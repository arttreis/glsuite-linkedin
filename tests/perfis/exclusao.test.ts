import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import { equipeDaOrganizacao } from "@/server/organizacao/equipe";
import { precisaDeVoce } from "@/server/painel/precisa";
import { saudeDosPerfis } from "@/server/painel/saude";
import { excluirConta } from "@/server/perfis/exclusao";
import { contaNovaDoLinkedin } from "@/server/perfis/nova-conta";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa, idDaOrganizacaoGuessless, idDoPerfil } from "../support/fixtures";

const AGORA = new Date("2026-10-16T15:00:00Z");

describe("excluir uma conta do LinkedIn (SDR-125)", () => {
  let banco: BancoDeTeste;
  let admin: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    admin = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
  });

  const excluir = (operadorId: string, perfilId: string) =>
    comOperador(banco.db, operadorId, (tx) => excluirConta(tx, { perfilId, operadorId, operadorNome: "Arthur", agora: AGORA }));

  const perfil = async (perfilId: string) => {
    const [linha] = await banco.db.query<{
      status: string;
      motivo_pausa: string | null;
      arquivado_em: Date | null;
      unipile_account_id: string | null;
      unipile_status: string | null;
    }>("select status, motivo_pausa, arquivado_em, unipile_account_id, unipile_status from public.perfis where id = $1::uuid", [perfilId]);
    return linha!;
  };

  const eventos = (perfilId: string, tipo: string) =>
    banco.db.query<{ payload: Record<string, unknown>; ator: string }>(
      "select payload, ator from public.eventos where perfil_id = $1::uuid and tipo = $2",
      [perfilId, tipo],
    );

  it("perfil ativo com leads: pausa, arquiva, solta a Unipile, mantém os leads e registra um evento", async () => {
    const juliano = await ativarPerfil(banco.db, "juliano", { accountId: "conta-do-juliano" });
    await banco.db.query("update public.perfis set unipile_status = 'OK' where id = $1::uuid", [juliano]);
    const campanha = await criarCampanha(banco.db, { perfil: "juliano" });
    const lead = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "juliano" }), campanhaId: campanha });

    expect(await excluir(admin, juliano)).toEqual({ ok: true, nome: expect.any(String) });

    expect(await perfil(juliano)).toEqual({
      status: "pausado",
      motivo_pausa: "Conta excluída por Arthur",
      arquivado_em: AGORA,
      unipile_account_id: null,
      unipile_status: null,
    });
    const [leadDepois] = await banco.db.query("select id from public.leads where id = $1::uuid and perfil_id = $2::uuid", [lead, juliano]);
    expect(leadDepois).toBeDefined();
    const excluidos = await eventos(juliano, "perfil_excluido");
    expect(excluidos).toHaveLength(1);
    expect(excluidos[0]).toMatchObject({ ator: admin, payload: { account_id: "conta-do-juliano" } });
    expect(await eventos(juliano, "perfil_pausado")).toHaveLength(1);
  });

  it("perfil nunca conectado: some do Dashboard, do Precisa de você e da Equipe", async () => {
    const dono = await criarOperador(banco.db, { nome: "Duda" });
    const nova = await contaNovaDoLinkedin(banco.db, {
      organizacaoId: await idDaOrganizacaoGuessless(banco.db),
      operadorId: dono,
      nome: "Duda",
      agora: AGORA,
    });
    const ids = async () => ({
      saude: (await comOperador(banco.db, admin, (tx) => saudeDosPerfis(tx, AGORA))).map((s) => s.id),
      precisa: (await comOperador(banco.db, admin, (tx) => precisaDeVoce(tx))).map((i) => i.id),
      equipe: await comOperador(banco.db, admin, (tx) => equipeDaOrganizacao(tx)),
    });
    const antes = await ids();
    expect(antes.saude).toContain(nova);
    expect(antes.precisa).toContain(`conta-${nova}`);

    expect(await excluir(dono, nova)).toMatchObject({ ok: true });

    const depois = await ids();
    expect(depois.saude).not.toContain(nova);
    expect(depois.precisa).not.toContain(`conta-${nova}`);
    expect(depois.equipe.contas.map((c) => c.id)).not.toContain(nova);
    expect(depois.equipe.membros.find((m) => m.id === dono)?.perfilIds).not.toContain(nova);
    expect((await perfil(nova)).motivo_pausa).toBe("Aguardando o LinkedIn");
    expect(await eventos(nova, "perfil_pausado")).toHaveLength(0);

    // Vincular outra conta não ressuscita a excluída: nasce uma nova.
    const outra = await contaNovaDoLinkedin(banco.db, {
      organizacaoId: await idDaOrganizacaoGuessless(banco.db),
      operadorId: dono,
      nome: "Duda",
      agora: AGORA,
    });
    expect(outra).not.toBe(nova);
  });

  it("quem só opera a conta não exclui, e nada muda", async () => {
    const juliano = await ativarPerfil(banco.db, "juliano");
    const colega = await criarOperador(banco.db, { perfis: ["juliano"] });
    const antes = await perfil(juliano);

    expect(await excluir(colega, juliano)).toEqual({ ok: false, erro: "Você não opera esta conta." });
    expect(await perfil(juliano)).toEqual(antes);
    expect(await eventos(juliano, "perfil_excluido")).toHaveLength(0);
  });

  it("a conta da casa é recusada", async () => {
    const arthur = await idDoPerfil(banco.db, "arthur");
    await banco.db.query("update public.perfis set casa = true, unipile_account_id = 'conta-da-casa' where id = $1::uuid", [arthur]);

    expect(await excluir(admin, arthur)).toEqual({ ok: false, erro: "A conta da casa não pode ser excluída." });
    expect(await perfil(arthur)).toMatchObject({ arquivado_em: null, unipile_account_id: "conta-da-casa" });
  });

  it("excluir de novo responde ok sem evento novo", async () => {
    const juliano = await ativarPerfil(banco.db, "juliano");
    expect(await excluir(admin, juliano)).toMatchObject({ ok: true });
    expect(await excluir(admin, juliano)).toMatchObject({ ok: true });
    expect(await eventos(juliano, "perfil_excluido")).toHaveLength(1);
    expect((await perfil(juliano)).arquivado_em).toEqual(AGORA);
  });
});
