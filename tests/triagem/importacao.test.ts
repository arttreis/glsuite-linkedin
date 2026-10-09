import { beforeEach, describe, expect, it } from "vitest";
import type { PessoaImportada } from "@/domain/importacao";
import { importarPessoas } from "@/server/importacao/importar";
import { aprovarLeads, rejeitarLeads } from "@/server/triagem/triagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-01T14:00:00Z");

const pessoa = (providerId: string, extra: Partial<PessoaImportada> = {}): PessoaImportada => ({
  providerId,
  publicIdentifier: providerId.toLowerCase(),
  urlPublica: `https://www.linkedin.com/in/${providerId.toLowerCase()}`,
  nome: "Maria Souza",
  primeiroNome: "Maria",
  cargo: "Diretora",
  empresa: "Acme",
  empresaDominio: null,
  empresaChave: "acme",
  localizacao: "São Paulo",
  coletadoEm: null,
  ...extra,
});

describe("importação para a triagem", () => {
  let banco: BancoDeTeste;
  let campanhaArthur: string;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    campanhaArthur = await criarCampanha(banco.db, { perfil: "arthur", nome: "Varejo SP" });
    operador = await criarOperador(banco.db, { papel: "admin" });
  });

  const importar = (pessoas: PessoaImportada[], campanhaId = campanhaArthur, unipile?: UnipileFalso) =>
    importarPessoas({ db: banco.db, unipile }, { campanhaId, fonte: "csv", pessoas, operadorId: operador, agora: AGORA });

  const leadsDaCampanha = (campanhaId: string) =>
    banco.db.query<{ provider_id: string; estado: string; bloqueio_motivo: string | null; alerta_triagem: string | null }>(
      `select pe.provider_id, l.estado, l.bloqueio_motivo, l.alerta_triagem
         from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
        where l.campanha_id = $1::uuid order by pe.provider_id`,
      [campanhaId],
    );

  it("pessoa com opt-out nunca entra (nem na base)", async () => {
    await banco.db.query("insert into public.optouts (provider_id, texto_pedido) values ('ACoOptout0000001', 'pare')");
    const { resumo } = await importar([pessoa("ACoOptout0000001"), pessoa("ACoNova000000001")]);

    expect(resumo).toMatchObject({ novos: 1, optouts: 1 });
    const [contagem] = await banco.db.query<{ n: number }>(
      "select count(*)::int as n from public.pessoas where provider_id = 'ACoOptout0000001'",
    );
    expect(contagem!.n).toBe(0);
  });

  it("pessoa de outro perfil aparece bloqueada com o motivo", async () => {
    const campanhaJuliano = await criarCampanha(banco.db, { perfil: "juliano" });
    const pessoaId = await criarPessoa(banco.db, { dono: "juliano", providerId: "ACoDoJuliano0001" });
    await criarLead(banco.db, { pessoaId, campanhaId: campanhaJuliano, estado: "convite_enviado" });

    const { resumo } = await importar([pessoa("ACoDoJuliano0001")]);

    expect(resumo).toMatchObject({ novos: 0, bloqueados: 1 });
    expect(await leadsDaCampanha(campanhaArthur)).toEqual([
      {
        provider_id: "ACoDoJuliano0001",
        estado: "triagem",
        bloqueio_motivo: "Já é do perfil Juliano: cada pessoa fica com um perfil só",
        alerta_triagem: null,
      },
    ]);
  });

  it("todo registro tem URL, fonte e data da coleta", async () => {
    await importar([pessoa("ACoSemData000001"), pessoa("ACoComData000001", { coletadoEm: "2026-09-15T08:00:00.000Z" })]);
    const pessoas = await banco.db.query<{ provider_id: string; url_publica: string; fonte: string; coletado_em: Date }>(
      "select provider_id, url_publica, fonte, coletado_em from public.pessoas order by provider_id",
    );
    expect(pessoas.map((p) => [p.provider_id, p.fonte, new Date(p.coletado_em).toISOString()])).toEqual([
      ["ACoComData000001", "csv", "2026-09-15T08:00:00.000Z"],
      ["ACoSemData000001", "csv", AGORA.toISOString()],
    ]);
    expect(pessoas.every((p) => p.url_publica.startsWith("https://www.linkedin.com/in/"))).toBe(true);
  });

  it("deduplica por provider_id no arquivo e entre importações", async () => {
    const primeira = await importar([pessoa("ACoRepetida00001"), pessoa("ACoRepetida00001")]);
    const segunda = await importar([pessoa("ACoRepetida00001")]);
    expect(primeira.resumo).toMatchObject({ novos: 1, duplicados: 1 });
    expect(segunda.resumo).toMatchObject({ novos: 0, duplicados: 1 });
    expect(await leadsDaCampanha(campanhaArthur)).toHaveLength(1);
  });

  it("marca o cooldown de empresa tocada por outro perfil", async () => {
    const campanhaJuliano = await criarCampanha(banco.db, { perfil: "juliano" });
    const colega = await criarPessoa(banco.db, { dono: "juliano", empresa: "Acme", empresaChave: "acme" });
    const leadColega = await criarLead(banco.db, { pessoaId: colega, campanhaId: campanhaJuliano, estado: "convite_enviado" });
    await banco.db.query("update public.leads set ultimo_toque_em = '2026-09-25T12:00:00Z' where id = $1::uuid", [leadColega]);

    const { resumo } = await importar([pessoa("ACoMesmaEmpresa1", { empresaChave: "acme" })]);

    expect(resumo).toMatchObject({ novos: 1, comAlerta: 1 });
    const [lead] = await leadsDaCampanha(campanhaArthur);
    expect(lead!.alerta_triagem).toBe("O perfil Juliano falou com alguém desta empresa em 25/09/2026. Pode aprovar: o convite espera até 25/10/2026");
  });

  it("resolve na Unipile quem veio só com URL, até o limite", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    const unipile = new UnipileFalso();
    unipile.perfis.set("so-url", {
      providerId: "ACoResolvido0001",
      publicIdentifier: "so-url",
      primeiroNome: "Ana",
      sobrenome: null,
      titulo: null,
      localizacao: null,
      resumo: null,
      distancia: "SECOND_DEGREE",
      ehConexao: false,
      urlPublica: null,
      experiencia: [],
    });

    const { resumo } = await importar(
      [pessoa("x", { providerId: null, publicIdentifier: "so-url" }), pessoa("y", { providerId: null, publicIdentifier: "inexistente" })],
      campanhaArthur,
      unipile,
    );

    expect(resumo).toMatchObject({ novos: 1, semProviderId: 1 });
    expect((await leadsDaCampanha(campanhaArthur))[0]!.provider_id).toBe("ACoResolvido0001");
  });

  describe("regras de retorno à régua", () => {
    let sequencia = 0;
    const comHistorico = async (estado: string, extra: { retorno_apos?: string; angulo?: string } = {}) => {
      sequencia += 1;
      const providerId = `ACoHistorico${String(sequencia).padStart(4, "0")}`;
      const antiga = await criarCampanha(banco.db, { perfil: "arthur", angulo: extra.angulo ?? "Margem invisível" });
      const pessoaId = await criarPessoa(banco.db, { dono: "arthur", providerId });
      const leadId = await criarLead(banco.db, { pessoaId, campanhaId: antiga, estado });
      if (extra.retorno_apos) {
        await banco.db.query("update public.leads set retorno_apos = $2 where id = $1::uuid", [leadId, extra.retorno_apos]);
      }
      return providerId;
    };

    it("quem disse não não volta", async () => {
      const id = await comHistorico("encerrado_nao");
      await importar([pessoa(id)]);
      expect((await leadsDaCampanha(campanhaArthur))[0]!.bloqueio_motivo).toMatch(/^Disse não/);
    });

    it("sem resposta no Brasil fica como conexão", async () => {
      const id = await comHistorico("sem_resposta");
      await importar([pessoa(id)]);
      expect((await leadsDaCampanha(campanhaArthur))[0]!.bloqueio_motivo).toBe("Já passou por uma sequência e ficou só como conexão");
    });

    it("pausa de 60 dias: bloqueia antes do prazo e com o mesmo ângulo, libera com ângulo novo", async () => {
      const id = await comHistorico("sem_resposta", { retorno_apos: "2026-11-15" });
      await importar([pessoa(id)]);
      expect((await leadsDaCampanha(campanhaArthur))[0]!.bloqueio_motivo).toBe("Em pausa até 15/11/2026");

      const vencida = await comHistorico("sem_resposta", { retorno_apos: "2026-09-01", angulo: "Margem invisível" });
      await importar([pessoa(vencida)]);
      const mesmoAngulo = (await leadsDaCampanha(campanhaArthur)).find((l) => l.provider_id === vencida);
      expect(mesmoAngulo!.bloqueio_motivo).toBe('Só volta com ângulo diferente de "Margem invisível"');

      const outraCampanha = await criarCampanha(banco.db, { perfil: "arthur", angulo: "ROAS de verdade" });
      await importar([pessoa(vencida)], outraCampanha);
      expect((await leadsDaCampanha(outraCampanha))[0]!.bloqueio_motivo).toBeNull();
    });
  });
});

describe("triagem", () => {
  let banco: BancoDeTeste;
  let operador: string;
  let campanha: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    operador = await criarOperador(banco.db, { papel: "admin" });
    campanha = await criarCampanha(banco.db, { perfil: "arthur" });
  });

  const estadoDe = async (leadId: string) =>
    (await banco.db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [leadId]))[0]!.estado;

  it("aprova em lote e manda para a fila, com evento", async () => {
    const a = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });
    const b = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });

    const resultado = await aprovarLeads(banco.db, { leadIds: [a, b], operadorId: operador, agora: AGORA });

    expect(resultado.aprovados).toEqual([a, b]);
    expect(await estadoDe(a)).toBe("na_fila");
    const [evento] = await banco.db.query<{ payload: { de: string; para: string }; ator: string }>(
      "select payload, ator from public.eventos where entidade_id = $1 and tipo = 'lead_transicao'",
      [a],
    );
    expect(evento).toEqual({ payload: { de: "triagem", para: "na_fila" }, ator: operador });
  });

  it("não aprova quem ficou bloqueado nem quem pediu opt-out depois da importação", async () => {
    const pessoaId = await criarPessoa(banco.db, { providerId: "ACoOptoutTardio1" });
    const lead = await criarLead(banco.db, { pessoaId, campanhaId: campanha });
    await banco.db.query("insert into public.optouts (provider_id) values ('ACoOptoutTardio1')");

    const resultado = await aprovarLeads(banco.db, { leadIds: [lead], operadorId: operador, agora: AGORA });

    expect(resultado.recusados).toEqual([{ leadId: lead, motivo: "Pediu para não ser contatado" }]);
    expect(await estadoDe(lead)).toBe("triagem");
  });

  it("passa a posse quando o dono anterior só tinha rejeitado a pessoa", async () => {
    const campanhaJuliano = await criarCampanha(banco.db, { perfil: "juliano" });
    const pessoaId = await criarPessoa(banco.db, { dono: "juliano" });
    await criarLead(banco.db, { pessoaId, campanhaId: campanhaJuliano, estado: "rejeitado" });
    const lead = await criarLead(banco.db, { pessoaId, campanhaId: campanha });

    expect((await aprovarLeads(banco.db, { leadIds: [lead], operadorId: operador, agora: AGORA })).aprovados).toEqual([lead]);
    const [dono] = await banco.db.query<{ slug: string }>(
      "select pf.slug from public.pessoas pe join public.perfis pf on pf.id = pe.dono_perfil_id where pe.id = $1::uuid",
      [pessoaId],
    );
    expect(dono!.slug).toBe("arthur");
  });

  it("respeita o máximo de leads da campanha", async () => {
    await banco.db.query("update public.campanhas set max_leads = 1 where id = $1::uuid", [campanha]);
    const a = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });
    const b = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });
    const resultado = await aprovarLeads(banco.db, { leadIds: [a, b], operadorId: operador, agora: AGORA });
    expect(resultado.aprovados).toEqual([a]);
    expect(resultado.recusados[0]!.motivo).toBe("Campanha já tem o máximo de 1 leads");
  });

  it("rejeita só quem está em triagem", async () => {
    const emTriagem = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });
    const naFila = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha, estado: "na_fila" });
    expect(await rejeitarLeads(banco.db, { leadIds: [emTriagem, naFila], operadorId: operador, agora: AGORA })).toBe(1);
    expect(await estadoDe(emTriagem)).toBe("rejeitado");
    expect(await estadoDe(naFila)).toBe("na_fila");
  });
});
