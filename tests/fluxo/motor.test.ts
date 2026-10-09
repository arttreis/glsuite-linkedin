import { beforeEach, describe, expect, it } from "vitest";
import { dataLocal, instanteLocal } from "@/domain/calendario";
import type { Fluxo } from "@/domain/fluxo";
import { ErroDeStatus, mudarStatusDaCampanha } from "@/server/campanhas/campanhas";
import { despachar } from "@/server/despachante/despachante";
import { salvarFluxo } from "@/server/fluxo/fluxos";
import { registrarAceite } from "@/server/reacoes/aceite";
import { aprovarLeads } from "@/server/triagem/triagem";
import type { PerfilLinkedIn } from "@/server/unipile/cliente";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { envios, simular, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const SEGUNDA_10H = instanteLocal("2026-10-05", "10:00", SP);

/** Convite (prazo de 3 dias úteis); aceitou → +1 → A → +3 → B → fim com pausa; não → tarefa de InMail → fim. */
const FLUXO_COM_DESVIO: Fluxo = {
  versao: 1,
  nodes: [
    { id: "inicio", tipo: "inicio" },
    { id: "convite", tipo: "convite", template: "Oi {{first_name}}, tudo bem?" },
    { id: "aceitou", tipo: "condicao", condicao: "aceitou", prazo_dias_uteis: 3 },
    { id: "e1", tipo: "esperar", dias_uteis: 1 },
    { id: "a", tipo: "mensagem", template: "Obrigado por aceitar, {{first_name}}." },
    { id: "e2", tipo: "esperar", dias_uteis: 3 },
    { id: "b", tipo: "mensagem", template: "Como a {{company}} mede isso hoje?" },
    { id: "fim", tipo: "fim", resultado: "pausa_60" },
    { id: "inmail", tipo: "tarefa", roteiro: "Mandar InMail para {{first_name}}" },
    { id: "fim-nao", tipo: "fim", resultado: "sem_resposta" },
  ],
  arestas: [
    { de: "inicio", para: "convite" },
    { de: "convite", para: "aceitou" },
    { de: "aceitou", para: "e1", saida: "sim" },
    { de: "aceitou", para: "inmail", saida: "nao" },
    { de: "e1", para: "a" },
    { de: "a", para: "e2" },
    { de: "e2", para: "b" },
    { de: "b", para: "fim" },
    { de: "inmail", para: "fim-nao" },
  ],
};

/** "Já é conexão?": sim → DM direta; não → convite. */
const FLUXO_CONEXAO: Fluxo = {
  versao: 1,
  nodes: [
    { id: "inicio", tipo: "inicio" },
    { id: "conectado", tipo: "condicao", condicao: "conectado" },
    { id: "oi", tipo: "mensagem", template: "Oi de novo, {{first_name}}." },
    { id: "convite", tipo: "convite", template: "" },
    { id: "aceitou", tipo: "condicao", condicao: "aceitou" },
    { id: "fim", tipo: "fim", resultado: "sem_resposta" },
    { id: "fim2", tipo: "fim", resultado: "sem_resposta" },
    { id: "fim3", tipo: "fim", resultado: "sem_resposta" },
  ],
  arestas: [
    { de: "inicio", para: "conectado" },
    { de: "conectado", para: "oi", saida: "sim" },
    { de: "conectado", para: "convite", saida: "nao" },
    { de: "oi", para: "fim" },
    { de: "convite", para: "aceitou" },
    { de: "aceitou", para: "fim2", saida: "sim" },
    { de: "aceitou", para: "fim3", saida: "nao" },
  ],
};

describe("motor do fluxo com blocos (SDR-21)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-09-01T12:00:00Z", accountId: "acc-arthur" });
    operador = await criarOperador(banco.db, { papel: "admin" });
  });

  async function leadNoFluxo(fluxo: Fluxo, opcoes: { conectado?: boolean } = {}) {
    const campanha = await criarCampanha(banco.db);
    await salvarFluxo(banco.db, { campanhaId: campanha, fluxo, operadorId: operador });
    const providerId = `ACo${Math.random().toString(36).slice(2, 10)}`;
    const pessoa = await criarPessoa(banco.db, { providerId, nome: "Pessoa Teste", empresa: "Acme" });
    const leadId = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha });
    if (opcoes.conectado !== undefined) {
      unipile.perfis.set(providerId, { providerId, ehConexao: opcoes.conectado } as PerfilLinkedIn);
    }
    const { aprovados } = await aprovarLeads(banco.db, { leadIds: [leadId], operadorId: operador, agora: SEGUNDA_10H, unipile });
    expect(aprovados).toEqual([leadId]);
    return { campanha, leadId, providerId };
  }

  const acoes = (leadId: string) =>
    banco.db.query<{ tipo: string; toque: string | null; status: string; agendada_para: Date; texto_gerado: string | null }>(
      "select tipo, toque, status, agendada_para, texto_gerado from public.acoes where lead_id = $1::uuid order by criada_em",
      [leadId],
    );
  const lead = async (leadId: string) =>
    (await banco.db.query<{ estado: string; retorno_apos: string | null }>(
      "select estado, retorno_apos from public.leads where id = $1::uuid",
      [leadId],
    ))[0]!;
  const tick = (agora: Date) => despachar({ db: banco.db, unipile, agora, aleatorio: () => 0.5 });

  it("aceitou: esperas e mensagens com ids livres, e o fim com pausa de 60 dias", async () => {
    const { leadId, providerId } = await leadNoFluxo(FLUXO_COM_DESVIO);
    expect((await acoes(leadId)).map((a) => [a.tipo, a.toque])).toEqual([["convite", "convite"]]);

    await tick(SEGUNDA_10H);
    const retirada = (await acoes(leadId)).find((a) => a.tipo === "retirar_convite")!;
    // Prazo da condição: 3 dias úteis depois do envio, na abertura da janela.
    expect(new Date(retirada.agendada_para)).toEqual(instanteLocal("2026-10-08", "09:00", SP));

    await registrarAceite(banco.db, {
      accountId: "acc-arthur",
      providerId,
      agora: instanteLocal("2026-10-06", "15:00", SP),
      origem: "new_relation",
    });
    const a = (await acoes(leadId)).find((acao) => acao.toque === "a")!;
    expect(new Date(a.agendada_para)).toEqual(instanteLocal("2026-10-07", "09:00", SP));

    await simular(banco.db, unipile, { de: "2026-10-07", ate: "2026-10-16" });
    const toques = (await envios(banco.db)).map((e) => [e.toque, dataLocal(new Date(e.enviada_em), SP)]);
    // B: quarta 07/10 + 3 dias úteis, pulando o feriado de 12/10 → terça 13/10.
    expect(toques).toEqual([["convite", "2026-10-05"], ["a", "2026-10-07"], ["b", "2026-10-13"]]);
    expect(await lead(leadId)).toEqual({ estado: "sem_resposta", retorno_apos: "2026-12-12" });
  });

  it("não aceitou no prazo: o convite é retirado e o fluxo segue pela saída \"não\"", async () => {
    const { leadId } = await leadNoFluxo(FLUXO_COM_DESVIO);
    await tick(SEGUNDA_10H);
    await simular(banco.db, unipile, { de: "2026-10-08", ate: "2026-10-08" });

    expect((await lead(leadId)).estado).toBe("convite_retirado");
    expect(unipile.chamadasDe("cancelarConvite")).toHaveLength(1);
    const tarefa = (await acoes(leadId)).find((acao) => acao.toque === "inmail")!;
    expect(tarefa).toMatchObject({ tipo: "tarefa_manual", status: "pendente", texto_gerado: "Mandar InMail para Pessoa" });
  });

  it("já é conexão: a mensagem sai direto, sem convite", async () => {
    const { leadId } = await leadNoFluxo(FLUXO_CONEXAO, { conectado: true });
    expect((await lead(leadId)).estado).toBe("aceito");
    expect((await acoes(leadId)).map((a) => [a.tipo, a.toque])).toEqual([["dm", "oi"]]);

    await tick(SEGUNDA_10H);
    expect(unipile.chamadasDe("iniciarConversa")[0]).toMatchObject({ texto: "Oi de novo, Pessoa." });
    expect(unipile.chamadasDe("enviarConvite")).toHaveLength(0);
    expect((await lead(leadId)).estado).toBe("sem_resposta");
  });

  it("não é conexão: recebe o convite", async () => {
    const { leadId } = await leadNoFluxo(FLUXO_CONEXAO, { conectado: false });
    expect((await lead(leadId)).estado).toBe("na_fila");
    expect((await acoes(leadId)).map((a) => [a.tipo, a.toque])).toEqual([["convite", "convite"]]);
  });

  it("editar o fluxo com leads andando cria versão nova; o lead fica na dele", async () => {
    const { campanha, leadId } = await leadNoFluxo(FLUXO_COM_DESVIO);
    const versao = async () =>
      (await banco.db.query<{ campanha: string; lead: string }>(
        "select c.fluxo_id as campanha, l.fluxo_id as lead from public.campanhas c join public.leads l on l.campanha_id = c.id where l.id = $1::uuid",
        [leadId],
      ))[0]!;
    const antes = await versao();
    expect(antes.campanha).toBe(antes.lead);

    const nova = await salvarFluxo(banco.db, { campanhaId: campanha, fluxo: FLUXO_CONEXAO, operadorId: operador });
    expect(await versao()).toEqual({ campanha: nova, lead: antes.lead });
    // Sem lead na versão nova, salvar de novo reescreve a mesma versão.
    expect(await salvarFluxo(banco.db, { campanhaId: campanha, fluxo: FLUXO_COM_DESVIO, operadorId: operador })).toBe(nova);
  });

  it("campanha com fluxo inválido não ativa", async () => {
    const campanha = await criarCampanha(banco.db, { status: "rascunho" });
    const quebrado: Fluxo = { ...FLUXO_COM_DESVIO, arestas: FLUXO_COM_DESVIO.arestas.filter((a) => a.de !== "b") };
    await salvarFluxo(banco.db, { campanhaId: campanha, fluxo: quebrado, operadorId: operador });
    await expect(
      mudarStatusDaCampanha(banco.db, { campanhaId: campanha, status: "ativa", operadorId: operador, agora: SEGUNDA_10H }),
    ).rejects.toThrow(ErroDeStatus);
  });
});
