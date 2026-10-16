import { beforeEach, describe, expect, it } from "vitest";
import { desfechoDaConexao, MOTIVO_OUTRA_ORGANIZACAO, registrarContaConectada } from "@/server/perfis/conexao";
import { contaNovaDoLinkedin } from "@/server/perfis/nova-conta";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarDuasMarcas, type DuasMarcas } from "../support/duas-marcas";
import { criarOperador, criarOrganizacao, criarPerfilNaOrganizacao } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-20T13:00:00Z");
const DONO_X = { providerId: "ACoX", nome: "Pessoa X", publicIdentifier: "x", premium: true, salesNavigator: false };

describe("callback do hosted auth: o mesmo LinkedIn nunca vira dois perfis (SDR-108, §4.30)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let f: DuasMarcas;
  /** O perfil P, na marca A, já conectado ao LinkedIn X. */
  let p: string;

  const marcasDe = async (perfilId: string) =>
    (await banco.db.query<{ marca_id: string }>("select marca_id from public.marcas_dos_perfis where perfil_id = $1::uuid", [perfilId]))
      .map((l) => l.marca_id)
      .sort();
  const existe = async (perfilId: string) =>
    (await banco.db.query("select 1 from public.perfis where id = $1::uuid", [perfilId])).length > 0;

  /** O pendente Q, criado por quem está na marca B, como "Vincular outra conta" faz. */
  async function pendenteNaB() {
    const operadorB = await criarOperador(banco.db, { organizacaoId: f.organizacaoId, nome: "Operador da Beta" });
    await banco.db.query("insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid)", [operadorB, f.marcaB]);
    await banco.db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [operadorB, f.marcaB]);
    const q = await contaNovaDoLinkedin(banco.db, { organizacaoId: f.organizacaoId, operadorId: operadorB, nome: "Operador da Beta", agora: AGORA });
    return { q, operadorB };
  }

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    f = await criarDuasMarcas(banco.db);
    p = f.perfilId;
    await banco.db.query("update public.perfis set unipile_account_id = 'acc-p', linkedin_provider_id = 'ACoX' where id = $1::uuid", [p]);
    unipile.donos.set("acc-nova", DONO_X);
  });

  it("na mesma organização, liga P à marca do pendente, apaga o pendente e não cria perfil", async () => {
    const { q, operadorB } = await pendenteNaB();
    expect(await marcasDe(q)).toEqual([f.marcaB]);
    const [antes] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.perfis");

    const resultado = await registrarContaConectada({ db: banco.db, unipile }, { status: "CREATION_SUCCESS", account_id: "acc-nova", name: q }, AGORA);

    expect(resultado).toEqual({ ok: true, perfilId: p, ligadaAExistente: true });
    expect(await marcasDe(p)).toEqual([f.marcaA, f.marcaB].sort());
    expect(await existe(q)).toBe(false);
    const [depois] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.perfis");
    expect(depois!.n).toBe(antes!.n - 1);
    const [conta] = await banco.db.query("select unipile_account_id, linkedin_provider_id from public.perfis where id = $1::uuid", [p]);
    expect(conta).toEqual({ unipile_account_id: "acc-p", linkedin_provider_id: "ACoX" });

    const eventos = await banco.db.query("select perfil_id, payload from public.eventos where tipo = 'conta_ligada_a_marca'");
    expect(eventos).toEqual([
      { perfil_id: p, payload: { marca_id: f.marcaB, origem: "callback", pendente_id: q, account_id: "acc-nova" } },
    ]);
    // Quem vinculou passa a operar a conta; a trilha do pendente fica pelo entidade_id.
    const operadores = await banco.db.query("select 1 from public.operador_perfis where operador_id = $1::uuid and perfil_id = $2::uuid", [operadorB, p]);
    expect(operadores).toHaveLength(1);
    const trilha = await banco.db.query("select perfil_id from public.eventos where tipo = 'perfil_criado' and entidade_id = $1", [q]);
    expect(trilha).toEqual([{ perfil_id: null }]);

    expect(await desfechoDaConexao(banco.db, { perfilId: q, desde: AGORA })).toBe("ligada_a_existente");
  });

  it("de outra organização, recusa com o motivo, e o pendente continua pendente", async () => {
    const outra = await criarOrganizacao(banco.db, { nome: "Outra" });
    const q = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: outra, slug: "pendente-da-outra" });
    const marcasAntes = await marcasDe(q);

    const resultado = await registrarContaConectada({ db: banco.db, unipile }, { status: "CREATION_SUCCESS", account_id: "acc-nova", name: q }, AGORA);

    expect(resultado).toEqual({ ok: false, motivo: MOTIVO_OUTRA_ORGANIZACAO });
    const [pendente] = await banco.db.query("select unipile_account_id, linkedin_provider_id from public.perfis where id = $1::uuid", [q]);
    expect(pendente).toEqual({ unipile_account_id: null, linkedin_provider_id: null });
    expect(await marcasDe(q)).toEqual(marcasAntes);
    expect(await marcasDe(p)).toEqual([f.marcaA]);
    // O motivo não nomeia a outra organização.
    expect(MOTIVO_OUTRA_ORGANIZACAO).not.toContain("Agência");

    expect(await desfechoDaConexao(banco.db, { perfilId: q, desde: AGORA })).toBe("outra_organizacao");
    // Um link gerado depois da recusa não herda o aviso.
    expect(await desfechoDaConexao(banco.db, { perfilId: q, desde: new Date(AGORA.getTime() + 1000) })).toBeNull();
  });

  it("o unipile_account_id repetido continua recusado como hoje", async () => {
    const { q } = await pendenteNaB();
    unipile.donos.set("acc-p", { ...DONO_X, providerId: "ACoOutraPessoa" });
    expect(await registrarContaConectada({ db: banco.db, unipile }, { status: "CREATION_SUCCESS", account_id: "acc-p", name: q }, AGORA)).toEqual({
      ok: false,
      motivo: `conta já ligada ao perfil perfil-${f.organizacaoId.slice(0, 8)}`,
    });
    expect(await existe(q)).toBe(true);
  });

  it("a casa não conta: o LinkedIn da casa conecta num perfil normal, e a casa reconecta sem ser recusada", async () => {
    await banco.db.query("update public.perfis set casa = true where id = $1::uuid", [p]);
    const { q } = await pendenteNaB();
    expect(await registrarContaConectada({ db: banco.db, unipile }, { status: "CREATION_SUCCESS", account_id: "acc-nova", name: q }, AGORA)).toEqual({
      ok: true,
      perfilId: q,
    });
    expect(await existe(q)).toBe(true);

    unipile.donos.set("acc-casa", DONO_X);
    expect(await registrarContaConectada({ db: banco.db, unipile }, { status: "RECONNECTED", account_id: "acc-casa", name: p }, AGORA)).toEqual({
      ok: true,
      perfilId: p,
    });
  });

  it("um perfil já conectado não é apagado: reconectar com o LinkedIn de outro perfil é recusado", async () => {
    const outro = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: f.organizacaoId, slug: "ja-conectado" });
    await banco.db.query("update public.perfis set unipile_account_id = 'acc-outro', linkedin_provider_id = 'ACoY' where id = $1::uuid", [outro]);
    expect(await registrarContaConectada({ db: banco.db, unipile }, { status: "RECONNECTED", account_id: "acc-nova", name: outro }, AGORA)).toEqual({
      ok: false,
      motivo: `conta já ligada ao perfil perfil-${f.organizacaoId.slice(0, 8)}`,
    });
    expect(await existe(outro)).toBe(true);
  });

  it("sem callback ainda, a volta segue o caminho de sempre", async () => {
    const { q } = await pendenteNaB();
    expect(await desfechoDaConexao(banco.db, { perfilId: q, desde: AGORA })).toBeNull();
  });
});
