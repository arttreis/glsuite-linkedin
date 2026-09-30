import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { processarComAgente, processarMensagensPendentes } from "@/server/agente/agente";
import { ErroDoModelo } from "@/server/agente/modelo";
import { listarConversas } from "@/server/conversas/inbox";
import { despachar } from "@/server/despachante/despachante";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { leadsComAcao, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarPessoa, type SlugPerfil } from "../support/fixtures";
import { ModeloFalso } from "../support/modelo-falso";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = instanteLocal("2026-10-07", "10:00", SP);
const LINK_JULIANO = "https://cal.com/juliano-guessless/30min";

describe("agente de conversa (SDR-10)", () => {
  let banco: BancoDeTeste;
  let modelo: ModeloFalso;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    modelo = new ModeloFalso();
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    await banco.db.query("update public.perfis set link_agenda = $1 where slug = 'juliano'", [LINK_JULIANO]);
  });

  /** Lead na régua que recebe a mensagem da pessoa (vira em_conversa pelo fluxo real). */
  async function pessoaResponde(texto: string, opcoes: { perfil?: SlugPerfil; modo?: string; conta?: string } = {}) {
    const perfil = opcoes.perfil ?? "arthur";
    const conta = opcoes.conta ?? "acc-arthur";
    if (opcoes.modo) await banco.db.query("update public.perfis set modo_resposta = $2 where slug = $1", [perfil, opcoes.modo]);
    const campanha = await criarCampanha(banco.db, { perfil });
    const [leadId] = await leadsComAcao(banco.db, { campanhaId: campanha, perfil, quantidade: 1, estado: "em_sequencia", toque: "T3", desde: AGORA });
    const chat = `chat-${randomUUID().slice(0, 8)}`;
    await banco.db.query("update public.leads set chat_id = $2 where id = $1::uuid", [leadId, chat]);
    const messageId = `msg-${randomUUID().slice(0, 8)}`;
    const resultado = await registrarMensagem(
      banco.db,
      {
        accountId: conta,
        chatId: chat,
        messageId,
        texto,
        em: AGORA.toISOString(),
        remetenteProviderId: "ACoProspect",
        remetenteNome: "Maria",
        enviadaPelaConta: false,
        participantes: [],
      },
      AGORA,
    );
    const [mensagem] = await banco.db.query<{ id: string }>("select id from public.mensagens where provider_message_id = $1", [messageId]);
    return { leadId: leadId!, mensagemId: mensagem?.id ?? null, resultado };
  }

  const rodar = (mensagemId: string) => processarComAgente({ db: banco.db, modelo, agora: AGORA, aleatorio: () => 0.5 }, mensagemId);
  const lead = async (leadId: string) =>
    (await banco.db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [leadId]))[0]!.estado;
  const acoesDaIa = (leadId: string) =>
    banco.db.query<{ status: string; texto_gerado: string | null; texto_final: string | null; motivo_revisao: string | null; agendada_para: Date }>(
      "select status, texto_gerado, texto_final, motivo_revisao, agendada_para from public.acoes where lead_id = $1::uuid and origem = 'ia'",
      [leadId],
    );
  const rascunho = async (mensagemId: string) =>
    (await banco.db.query<{ resultado: string; excecao: string | null; acao_sugerida: string | null; modelos: Record<string, string> }>(
      "select resultado, excecao, acao_sugerida, modelos from public.rascunhos where mensagem_id = $1::uuid",
      [mensagemId],
    ))[0];

  describe('"pare de me mandar mensagem" vira opt-out global', () => {
    it.each(["Pare de me mandar mensagem", "Please stop messaging me", "Deja de enviarme mensajes, gracias"])(
      "%s: registrado antes de qualquer IA, no próprio processamento do webhook",
      async (texto) => {
        const { leadId, resultado } = await pessoaResponde(texto);
        expect(resultado.tipo).toBe("optout");
        expect(await lead(leadId)).toBe("optout");
        const [optout] = await banco.db.query<{ texto_pedido: string }>("select texto_pedido from public.optouts");
        expect(optout!.texto_pedido).toBe(texto);
        const acoes = await banco.db.query<{ status: string }>("select status from public.acoes where lead_id = $1::uuid", [leadId]);
        expect(acoes.map((a) => a.status)).toEqual(["cancelada"]);
        expect(await processarMensagensPendentes({ db: banco.db, modelo, agora: AGORA })).toEqual([]);
        expect(modelo.chamadas).toHaveLength(0);
      },
    );

    it("pedido menos óbvio: a classificação da IA registra o opt-out quando tem certeza", async () => {
      const { leadId, mensagemId } = await pessoaResponde("Não quero mais esse tipo de abordagem aqui.");
      modelo.classificacoes.push({ categoria: "optout", confianca: 0.95, sinais: { preco: false, reclamacao: true, idioma: "pt" } });
      expect(await rodar(mensagemId!)).toBe("optout_registrado");
      expect(await lead(leadId)).toBe("optout");
      expect(modelo.chamadas.map((c) => c.etapa)).toEqual(["classificar"]);
    });

    it("opt-out ambíguo não é registrado: vai para um humano", async () => {
      const { leadId, mensagemId } = await pessoaResponde("Acho que não é pra mim, sei lá.");
      modelo.classificacoes.push({ categoria: "optout", confianca: 0.5, sinais: { preco: false, reclamacao: false, idioma: "pt" } });
      modelo.decisoes.push({ acao: "registrar_optout", mensagem: null, motivo: "parece pedir para parar", estagio_sugerido: null, confianca: 0.5 });
      expect(await rodar(mensagemId!)).toBe("escalado");
      expect(await lead(leadId)).toBe("escalado_humano");
      const [contagem] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.optouts");
      expect(contagem!.n).toBe(0);
    });
  });

  it("no modo aprovação, o rascunho vai para a fila e nada sai", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Opa, me conta mais sobre isso?");
    expect(await rodar(mensagemId!)).toBe("na_fila");
    const [acao] = await acoesDaIa(leadId);
    expect(acao).toMatchObject({ status: "aguardando_aprovacao", texto_gerado: modelo.decisaoPadrao.mensagem, texto_final: null, motivo_revisao: null });
    expect((await rascunho(mensagemId!))!.modelos).toMatchObject({
      classificacao: "falso-classificacao",
      rascunho: "falso-rascunho",
      prompts: expect.any(String),
    });
  });

  it("rascunho que viola o validador cai na fila marcado, até no modo automático", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Interessante, como funciona?", { modo: "automatico" });
    modelo.decisoes.push({
      acao: "responder",
      mensagem: "Funciona assim — a gente olha sua margem por canal.",
      motivo: "explicar",
      estagio_sugerido: "03",
      confianca: 0.95,
    });
    expect(await rodar(mensagemId!)).toBe("na_fila");
    const [acao] = await acoesDaIa(leadId);
    expect(acao!.status).toBe("aguardando_aprovacao");
    expect(acao!.motivo_revisao).toContain("validador: Tem travessão ou meia-risca");
  });

  it("no modo automático sem exceção, a resposta é agendada com atraso humano e o despachante envia", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Tenho interesse, pode falar.", { modo: "automatico" });
    expect(await rodar(mensagemId!)).toBe("agendado");
    const [acao] = await acoesDaIa(leadId);
    expect(acao).toMatchObject({ status: "pendente", texto_final: modelo.decisaoPadrao.mensagem });
    // atraso de 3 a 10 min, sorteio 0,5 → 6,5 min
    expect(new Date(acao!.agendada_para).getTime()).toBe(AGORA.getTime() + 6.5 * 60_000);

    const unipile = new UnipileFalso();
    await despachar({ db: banco.db, unipile, agora: new Date(AGORA.getTime() + 10 * 60_000), aleatorio: () => 0.5 });
    expect(unipile.chamadasDe("enviarMensagem")[0]).toMatchObject({ texto: modelo.decisaoPadrao.mensagem });
    const [mensagem] = await banco.db.query<{ autor: string }>(
      "select autor from public.mensagens where lead_id = $1::uuid and direcao = 'saida'",
      [leadId],
    );
    expect(mensagem!.autor).toBe("ia");
  });

  it.each([
    ["pergunta de preço", { categoria: "pergunta", confianca: 0.9, sinais: { preco: true, reclamacao: false, idioma: "pt" } }, 0.9],
    ["baixa confiança", { categoria: "pergunta", confianca: 0.9, sinais: { preco: false, reclamacao: false, idioma: "pt" } }, 0.4],
  ] as const)("no modo automático, %s vai para a fila", async (motivo, classificacao, confianca) => {
    const { leadId, mensagemId } = await pessoaResponde("E quanto custa?", { modo: "automatico" });
    modelo.classificacoes.push(classificacao);
    modelo.decisoes.push({ ...modelo.decisaoPadrao, confianca });
    expect(await rodar(mensagemId!)).toBe("na_fila");
    expect((await acoesDaIa(leadId))[0]!.motivo_revisao).toContain(motivo);
  });

  it("no modo manual (JP), a IA só sugere: nada vai para a fila de envio", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Me interesa, cuéntame más.", { modo: "manual" });
    expect(await rodar(mensagemId!)).toBe("sugestao");
    expect(await acoesDaIa(leadId)).toEqual([]);
    expect((await rascunho(mensagemId!))!.resultado).toBe("sugestao");
  });

  it("escalar_humano passa a conversa para o dono do perfil, com alerta", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Vocês atendem indústria química?");
    modelo.decisoes.push({ acao: "escalar_humano", mensagem: null, motivo: "pergunta técnica fora do roteiro", estagio_sugerido: null, confianca: 0.8 });
    expect(await rodar(mensagemId!)).toBe("escalado");
    expect(await lead(leadId)).toBe("escalado_humano");
    const [alerta] = await banco.db.query<{ texto: string }>("select texto from public.alertas where chave like 'escalado/%'");
    expect(alerta!.texto).toContain("pergunta técnica fora do roteiro");
  });

  it("proposta de reunião usa o link de agenda do responsável pela discovery (Juliano)", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Bora conversar, qual horário?");
    modelo.decisoes.push({
      acao: "propor_reuniao",
      mensagem: `Perfeito! O Juliano conduz essa conversa. Escolhe um horário aqui: ${LINK_JULIANO}`,
      motivo: "quer conversar",
      estagio_sugerido: "04",
      confianca: 0.9,
    });
    expect(await rodar(mensagemId!)).toBe("na_fila");
    expect(modelo.chamadas.find((c) => c.etapa === "rascunhar")!.sistema).toContain(LINK_JULIANO);
    expect((await acoesDaIa(leadId))[0]!.motivo_revisao).toBeNull();
  });

  it("link inventado pela IA é barrado pelo validador", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Bora conversar!");
    modelo.decisoes.push({
      acao: "propor_reuniao",
      mensagem: "Show! Marca aqui: https://calendly.com/inventado",
      motivo: "quer conversar",
      estagio_sugerido: "04",
      confianca: 0.9,
    });
    await rodar(mensagemId!);
    expect((await acoesDaIa(leadId))[0]!.motivo_revisao).toContain("só pode mandar o link de agenda configurado");
  });

  it("resposta automática de ausência não gera rascunho nem abre SLA", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Estou de férias até dia 20. Abraços.");
    modelo.classificacoes.push({ categoria: "fora_do_escritorio", confianca: 0.97, sinais: { preco: false, reclamacao: false, idioma: "pt" } });
    expect(await rodar(mensagemId!)).toBe("sem_resposta_necessaria");
    expect(await acoesDaIa(leadId)).toEqual([]);
    const [conversa] = await listarConversas(banco.db, { agora: new Date(AGORA.getTime() + 86_400_000) });
    expect(conversa!.sla).toBeNull();
  });

  it("no Canadá, DM sem a frase de saída é barrada", async () => {
    await ativarPerfil(banco.db, "luiz", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-luiz" });
    const { leadId, mensagemId } = await pessoaResponde("Sounds interesting, tell me more.", { perfil: "luiz", conta: "acc-luiz" });
    modelo.decisoes.push({ acao: "responder", mensagem: "Great! Happy to share how we look at channel margin.", motivo: "interest", estagio_sugerido: "03", confianca: 0.9 });
    await rodar(mensagemId!);
    expect(modelo.chamadas.find((c) => c.etapa === "rascunhar")!.sistema).toContain("or tell me to stop and I will");
    expect((await acoesDaIa(leadId))[0]!.motivo_revisao).toContain("DM do Canadá precisa trazer a saída");
  });

  it("o prompt de sistema é o mesmo para todos os leads do perfil (cache)", async () => {
    const a = await pessoaResponde("Me conta mais?");
    const b = await pessoaResponde("Como funciona?");
    await rodar(a.mensagemId!);
    await rodar(b.mensagemId!);
    const sistemas = modelo.chamadas.filter((c) => c.etapa === "rascunhar").map((c) => c.sistema);
    expect(sistemas[0]).toBe(sistemas[1]);
    expect(sistemas[0]).not.toContain("Maria");
  });

  it("processa cada mensagem uma vez só e retenta erro do modelo até 3 vezes", async () => {
    const { mensagemId } = await pessoaResponde("Me conta mais?");
    modelo.falhas.push(new ErroDoModelo("O modelo recusou (cyber)."), new ErroDoModelo("fora do formato"));

    const deps = { db: banco.db, modelo, agora: AGORA, aleatorio: () => 0.5 };
    expect(await processarMensagensPendentes(deps)).toEqual(["erro"]);
    expect(await processarMensagensPendentes(deps)).toEqual(["erro"]);
    expect(await processarMensagensPendentes(deps)).toEqual(["na_fila"]);
    expect(await processarMensagensPendentes(deps)).toEqual([]);
    expect(await rodar(mensagemId!)).toBe("ja_processado");
  });

  it("só olha a última mensagem sem resposta de cada lead em conversa", async () => {
    const pessoaId = await criarPessoa(banco.db);
    const outro = await criarLead(banco.db, { pessoaId, campanhaId: await criarCampanha(banco.db), estado: "em_conversa" });
    await banco.db.query(
      `insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto, em)
       select id, perfil_id, 'entrada', 'prospect', 'oi', $2 from public.leads where id = $1::uuid`,
      [outro, new Date(AGORA.getTime() - 3_600_000)],
    );
    await banco.db.query(
      `insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto, em)
       select id, perfil_id, 'saida', 'humano', 'oi! tudo bem?', $2 from public.leads where id = $1::uuid`,
      [outro, new Date(AGORA.getTime() - 1_800_000)],
    );
    expect(await processarMensagensPendentes({ db: banco.db, modelo, agora: AGORA })).toEqual([]);
  });
});
