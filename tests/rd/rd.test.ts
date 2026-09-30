import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { marcarDesfecho } from "@/server/conversas/desfecho";
import { despachar } from "@/server/despachante/despachante";
import { criarClienteRd } from "@/server/rd/cliente";
import { processarEventosRd } from "@/server/rd/sincronizar";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import { aprovarLeads } from "@/server/triagem/triagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa, type SlugPerfil } from "../support/fixtures";
import { RdFalso } from "../support/rd-falso";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = instanteLocal("2026-10-07", "10:00", SP);

const CONFIG_RD = {
  ativo: true,
  pipeline_id: "funil-servico",
  etapas: { "01": "e01", "02": "e02", "03": "e03", "04": "e04", "05": "e05" },
  campos: {
    nicho: "cf-nicho",
    fonte: "cf-fonte",
    praca: "cf-praca",
    originador: "cf-originador",
    angulo: "cf-angulo",
    dono_conversa: "cf-dono",
    data_reuniao: "cf-reuniao",
  },
  valores: { fonte: "LinkedIn", praca: "Doméstico" },
  usuarios: { arthur: "rd-user-arthur" },
  deal_source_id: "fonte-linkedin",
};

describe("RD Station (SDR-12)", () => {
  let banco: BancoDeTeste;
  let rd: RdFalso;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    rd = new RdFalso();
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    await banco.db.query("update public.configuracoes set valor = $1::jsonb where chave = 'rd_station'", [JSON.stringify(CONFIG_RD)]);
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
  });

  async function leadTriado(perfil: SlugPerfil = "arthur", empresa = "Loja Sul") {
    const campanha = await criarCampanha(banco.db, { perfil });
    await banco.db.query("update public.campanhas set nicho = 'moda' where id = $1::uuid", [campanha]);
    const pessoaId = await criarPessoa(banco.db, { dono: perfil, nome: "Carla Mendes", empresa, empresaChave: empresa.toLowerCase() });
    await banco.db.query("update public.pessoas set cargo = 'Head de E-commerce' where id = $1::uuid", [pessoaId]);
    const leadId = await criarLead(banco.db, { pessoaId, campanhaId: campanha });
    await aprovarLeads(banco.db, { leadIds: [leadId], operadorId: operador, agora: AGORA });
    return leadId;
  }

  const sincronizar = () => processarEventosRd({ db: banco.db, rd, agora: AGORA });

  it("lead aprovado na triagem aparece no 01 · Alvo com todos os campos", async () => {
    const leadId = await leadTriado();
    expect(await sincronizar()).toEqual({ feitos: 1, erros: 0, ignorados: 0 });

    const [negociacao] = [...rd.negociacoes.values()];
    expect(negociacao).toMatchObject({
      nome: "Loja Sul",
      etapaId: "e01",
      contatos: [{ nome: "Carla Mendes", cargo: "Head de E-commerce" }],
      usuarioId: "rd-user-arthur",
    });
    expect(Object.fromEntries(negociacao!.campos)).toEqual({
      "cf-nicho": "moda",
      "cf-fonte": "LinkedIn",
      "cf-praca": "Doméstico",
      "cf-originador": "Arthur",
    });
    const [lead] = await banco.db.query<{ rd_deal_id: string }>("select rd_deal_id from public.leads where id = $1::uuid", [leadId]);
    expect(lead!.rd_deal_id).toBe(negociacao!.id);
  });

  it("convite enviado move para o 02 · Tocado com o ângulo e o próximo passo com data", async () => {
    const leadId = await leadTriado();
    await sincronizar();
    await despachar({ db: banco.db, unipile: new UnipileFalso(), agora: AGORA, aleatorio: () => 0.5 });
    expect(await sincronizar()).toMatchObject({ feitos: 1 });

    const [negociacao] = [...rd.negociacoes.values()];
    expect(negociacao!.etapaId).toBe("e02");
    expect(negociacao!.campos.get("cf-angulo")).toBe("Margem invisível");
    // Quarta 07/10 + 5 dias úteis (12/10 feriado) = quinta 15/10.
    expect(rd.tarefas).toEqual([
      { negociacaoId: negociacao!.id, assunto: "Acompanhar o aceite do convite", data: "2026-10-15", usuarioIds: ["rd-user-arthur"] },
    ]);
    const [lead] = await banco.db.query<{ proximo_passo: string; proximo_passo_em: string }>(
      "select proximo_passo, proximo_passo_em from public.leads where id = $1::uuid",
      [leadId],
    );
    expect(lead).toEqual({ proximo_passo: "Acompanhar o aceite do convite", proximo_passo_em: "2026-10-15" });
  });

  it("resposta leva ao 03, qualificado ao 04 e reunião ao 05 com a data", async () => {
    const leadId = await leadTriado();
    await banco.db.query("update public.leads set estado = 'em_sequencia', chat_id = 'chat-rd' where id = $1::uuid", [leadId]);
    await registrarMensagem(
      banco.db,
      {
        accountId: "acc-arthur",
        chatId: "chat-rd",
        messageId: "m-rd-1",
        texto: "Oi! Pode me explicar melhor?",
        em: AGORA.toISOString(),
        remetenteProviderId: "ACoX",
        remetenteNome: null,
        enviadaPelaConta: false,
        participantes: [],
      },
      AGORA,
    );
    await marcarDesfecho(banco.db, { leadId, para: "qualificado", operadorId: operador, agora: AGORA });
    await marcarDesfecho(banco.db, {
      leadId,
      para: "reuniao_marcada",
      operadorId: operador,
      agora: AGORA,
      reuniaoEm: new Date("2026-10-14T17:00:00Z"),
    });

    expect(await sincronizar()).toMatchObject({ feitos: 4, erros: 0 });
    const [negociacao] = [...rd.negociacoes.values()];
    expect(negociacao!.etapaId).toBe("e05");
    expect(negociacao!.campos.get("cf-dono")).toBe("Arthur");
    expect(negociacao!.campos.get("cf-reuniao")).toBe("14/10/2026");
  });

  it("lead do Canadá nunca chega ao RD", async () => {
    await ativarPerfil(banco.db, "luiz", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-luiz" });
    await leadTriado("luiz", "Maple Goods");
    const [fila] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.rd_eventos");
    expect(fila!.n).toBe(0);
    expect(await sincronizar()).toEqual({ feitos: 0, erros: 0, ignorados: 0 });
    expect(rd.chamadas).toHaveLength(0);
  });

  it("é idempotente e reprocessa a falha sem duplicar a negociação", async () => {
    await leadTriado();
    rd.falharProxima(new Error("RD Station 500: indisponível"));
    expect(await sincronizar()).toEqual({ feitos: 0, erros: 1, ignorados: 0 });
    expect(await sincronizar()).toEqual({ feitos: 1, erros: 0, ignorados: 0 });
    expect(await sincronizar()).toEqual({ feitos: 0, erros: 0, ignorados: 0 });
    expect(rd.negociacoes.size).toBe(1);
  });

  it("dois decisores da mesma empresa ficam na mesma negociação, e a etapa nunca volta", async () => {
    const primeiro = await leadTriado("arthur", "Loja Sul");
    await sincronizar();
    await banco.db.query("update public.leads set estado = 'em_conversa' where id = $1::uuid", [primeiro]);
    await banco.db.query("insert into public.rd_eventos (lead_id, etapa) values ($1::uuid, '03')", [primeiro]);
    await sincronizar();

    await leadTriado("arthur", "Loja Sul"); // outro decisor, mesma empresa
    await sincronizar();
    expect(rd.negociacoes.size).toBe(1);
    expect([...rd.negociacoes.values()][0]!.etapaId).toBe("e03");
    expect(rd.anotacoes[0]!.texto).toMatch(/^Novo decisor pelo LinkedIn: Carla Mendes/);
  });

  it("com o RD desligado, a fila só acumula", async () => {
    await banco.db.query("update public.configuracoes set valor = jsonb_set(valor, '{ativo}', 'false') where chave = 'rd_station'");
    await leadTriado();
    expect(await sincronizar()).toEqual({ feitos: 0, erros: 0, ignorados: 0, desligado: true });
    expect(rd.chamadas).toHaveLength(0);
  });

  it("lead sem empresa não vira negociação sem nome", async () => {
    const campanha = await criarCampanha(banco.db);
    const pessoaId = await criarPessoa(banco.db);
    await banco.db.query("update public.pessoas set empresa = null where id = $1::uuid", [pessoaId]);
    const leadId = await criarLead(banco.db, { pessoaId, campanhaId: campanha });
    await aprovarLeads(banco.db, { leadIds: [leadId], operadorId: operador, agora: AGORA });
    expect(await sincronizar()).toMatchObject({ erros: 1 });
    const [evento] = await banco.db.query<{ erro: string }>("select erro from public.rd_eventos");
    expect(evento!.erro).toMatch(/sem empresa/);
  });
});

describe("cliente HTTP do RD Station", () => {
  it("move de etapa com deal_stage_id na raiz do body e o token na query", async () => {
    const requisicoes: { url: URL; metodo: string; corpo: unknown }[] = [];
    const rd = criarClienteRd({
      token: "tok-123",
      fetch: (async (entrada: URL | RequestInfo, init?: RequestInit) => {
        requisicoes.push({ url: new URL(String(entrada)), metodo: init?.method ?? "GET", corpo: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response("{}", { status: 200 });
      }) as typeof fetch,
    });

    await rd.atualizarNegociacao("deal-1", { etapaId: "e02", campos: [{ id: "cf-angulo", valor: "ROAS de verdade" }] });

    const [req] = requisicoes;
    expect(req!.metodo).toBe("PUT");
    expect(req!.url.pathname).toBe("/api/v1/deals/deal-1");
    expect(req!.url.searchParams.get("token")).toBe("tok-123");
    expect(req!.corpo).toEqual({
      deal_stage_id: "e02",
      deal: { deal_custom_fields: [{ custom_field_id: "cf-angulo", value: "ROAS de verdade" }] },
    });
  });
});
