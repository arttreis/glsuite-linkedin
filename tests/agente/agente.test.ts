import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { processarComAgente, processarMensagensPendentes } from "@/server/agente/agente";
import { ErroDoModelo } from "@/server/agente/modelo";
import { cobrarPassagens } from "@/server/agente/passagem";
import { abrirChat, devolverAoSdr } from "@/server/chats/chats";
import { alertarSlasEstourados } from "@/server/conversas/alertas";
import { precisaDeVoce } from "@/server/painel/precisa";
import { listarConversas } from "@/server/conversas/inbox";
import { despachar } from "@/server/despachante/despachante";
import { executarReserva } from "@/server/despachante/envio";
import { carregarPerfil } from "@/server/despachante/perfis";
import { reservarProximaAcao } from "@/server/despachante/reserva";
import { registrarMensagem } from "@/server/reacoes/mensagem";
import { criarVerificadorDeResposta } from "@/server/reacoes/verificar-resposta";
import { trocarModo } from "@/server/perfis/modo";
import { passagensRecentes } from "@/server/sdr/passagens";
import { gravarVersaoDoSdr } from "@/server/sdr/sdr";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { leadsComAcao, SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa, idDaOrganizacaoGuessless, idDoPerfil, type SlugPerfil } from "../support/fixtures";
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

  it("rascunho que viola o validador nunca sai: cai na fila marcado, até no modo automático", async () => {
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
    ["reclamação", "automatico", { categoria: "objecao", confianca: 0.9, sinais: { preco: false, reclamacao: true, idioma: "pt" } }, 0.9],
    ["baixa confiança", "automatico", { categoria: "pergunta", confianca: 0.9, sinais: { preco: false, reclamacao: false, idioma: "pt" } }, 0.4],
    ["reclamação", "aprovacao", { categoria: "objecao", confianca: 0.9, sinais: { preco: false, reclamacao: true, idioma: "pt" } }, 0.9],
  ] as const)("%s faz o SDR chamar você no modo %s: nada sai e a conversa fica com humano (SDR-52)", async (motivo, modo, classificacao, confianca) => {
    const { leadId, mensagemId } = await pessoaResponde("E quanto custa?", { modo });
    modelo.classificacoes.push(classificacao);
    modelo.decisoes.push({ ...modelo.decisaoPadrao, confianca });
    expect(await rodar(mensagemId!)).toBe("escalado");
    expect(await lead(leadId)).toBe("escalado_humano");
    expect(await acoesDaIa(leadId)).toEqual([]);
    const [alerta] = await banco.db.query<{ assunto: string; texto: string }>("select assunto, texto from public.alertas where chave like 'escalado/%'");
    expect(alerta!.assunto).toContain("O SDR chamou você");
    expect(alerta!.texto).toContain(motivo);
    expect(alerta!.texto).toContain(`/chats/${leadId}`);
  });

  it("as conversas que o SDR passou aparecem com o motivo e a proporção sobre o que ele tratou (SDR-60)", async () => {
    const preco = await pessoaResponde("E quanto custa?", { modo: "automatico" });
    modelo.classificacoes.push({ categoria: "pergunta", confianca: 0.9, sinais: { preco: true, reclamacao: false, idioma: "pt" } });
    await rodar(preco.mensagemId!);
    const comum = await pessoaResponde("Tenho interesse, pode falar.", { modo: "automatico" });
    await rodar(comum.mensagemId!);

    const recentes = await passagensRecentes(banco.db, { agora: new Date() });
    expect(recentes).toMatchObject({ dias: 30, passadas: 1, tratadas: 2 });
    expect(recentes.passagens).toEqual([
      expect.objectContaining({ leadId: preco.leadId, motivo: "pergunta de preço", conta: expect.any(String), comVoce: true }),
    ]);
  });

  it("trocar o modo em Configurações vale para a próxima resposta (SDR-51)", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Me conta mais?", { modo: "automatico" });
    const operador = await criarOperador(banco.db, { papel: "admin" });
    await trocarModo(banco.db, { perfilId: await idDoPerfil(banco.db, "arthur"), para: "aprovacao", operadorId: operador, agora: AGORA });

    expect(await rodar(mensagemId!)).toBe("na_fila");
    expect((await acoesDaIa(leadId))[0]!.status).toBe("aguardando_aprovacao");
  });

  it("depois que a conversa passa para você, o SDR não responde mais nela (SDR-52)", async () => {
    const { leadId, mensagemId } = await pessoaResponde("E quanto custa?", { modo: "automatico" });
    modelo.classificacoes.push({ categoria: "pergunta", confianca: 0.9, sinais: { preco: true, reclamacao: false, idioma: "pt" } });
    await rodar(mensagemId!);

    const chat = (await banco.db.query<{ chat_id: string }>("select chat_id from public.leads where id = $1::uuid", [leadId]))[0]!.chat_id;
    const nova = `msg-${randomUUID().slice(0, 8)}`;
    await registrarMensagem(
      banco.db,
      {
        accountId: "acc-arthur",
        chatId: chat,
        messageId: nova,
        texto: "Alguém aí?",
        em: AGORA.toISOString(),
        remetenteProviderId: "ACoProspect",
        remetenteNome: "Maria",
        enviadaPelaConta: false,
        participantes: [],
      },
      AGORA,
    );
    const [mensagem] = await banco.db.query<{ id: string }>("select id from public.mensagens where provider_message_id = $1", [nova]);
    expect(await rodar(mensagem!.id)).toBe("descartado");
    // Só a ponte da passagem (SDR-66); nenhuma resposta nova.
    expect((await acoesDaIa(leadId)).map((a) => a.texto_gerado)).toEqual([modelo.passagemPadrao.ponte]);
    expect(await lead(leadId)).toBe("escalado_humano");
  });

  it("o dono escrevendo direto no LinkedIn tira o SDR da conversa; o eco da DM do SDR saindo, não (SDR-52)", async () => {
    const { leadId, mensagemId } = await pessoaResponde("Me conta mais?", { modo: "automatico" });
    modelo.classificacoes.push({ categoria: "pergunta", confianca: 0.9, sinais: { preco: false, reclamacao: false, idioma: "pt" } });
    expect(await rodar(mensagemId!)).toBe("agendado");
    const chat = (await banco.db.query<{ chat_id: string }>("select chat_id from public.leads where id = $1::uuid", [leadId]))[0]!.chat_id;
    const [resposta] = await banco.db.query<{ texto_final: string }>(
      "update public.acoes set status = 'enviando' where lead_id = $1::uuid and origem = 'ia' returning texto_final",
      [leadId],
    );
    const eco = (texto: string) =>
      registrarMensagem(
        banco.db,
        {
          accountId: "acc-arthur",
          chatId: chat,
          messageId: `msg-${randomUUID().slice(0, 8)}`,
          texto,
          em: AGORA.toISOString(),
          remetenteProviderId: "ACoArthur",
          remetenteNome: "Arthur",
          enviadaPelaConta: true,
          participantes: [{ providerId: "ACoArthur", nome: "Arthur" }, { providerId: "ACoProspect", nome: "Maria" }],
        },
        AGORA,
      );

    expect(await eco(resposta!.texto_final)).toEqual({ tipo: "nossa" });
    expect(await lead(leadId)).toBe("em_conversa");

    expect(await eco("Oi Maria, aqui é o Arthur mesmo. Te ligo amanhã?")).toMatchObject({ tipo: "humano_no_linkedin" });
    expect(await lead(leadId)).toBe("escalado_humano");
  });

  describe("quem escreve fora do Kakou tira o SDR (SDR-61)", () => {
    const donoEscreve = (leadId: string) =>
      banco.db
        .query<{ chat_id: string }>("select chat_id from public.leads where id = $1::uuid", [leadId])
        .then(([l]) =>
          registrarMensagem(
            banco.db,
            {
              accountId: "acc-arthur",
              chatId: l!.chat_id,
              messageId: `msg-${randomUUID().slice(0, 8)}`,
              texto: "Oi Maria, aqui é o Arthur mesmo. Te ligo amanhã?",
              em: AGORA.toISOString(),
              remetenteProviderId: "ACoArthur",
              remetenteNome: "Arthur",
              enviadaPelaConta: true,
              participantes: [{ providerId: "ACoArthur", nome: "Arthur" }, { providerId: "ACoProspect", nome: "Maria" }],
            },
            AGORA,
          ),
        );

    it("o dono escreve enquanto o modelo pensa: o rascunho não entra e nada sai", async () => {
      const { leadId, mensagemId } = await pessoaResponde("Me conta mais?", { modo: "automatico" });
      const rascunhar = modelo.rascunhar.bind(modelo);
      modelo.rascunhar = async (p) => {
        await donoEscreve(leadId);
        return rascunhar(p);
      };

      expect(await rodar(mensagemId!)).toBe("descartado");
      expect(await acoesDaIa(leadId)).toEqual([]);
      expect(await lead(leadId)).toBe("escalado_humano");
      expect((await rascunho(mensagemId!))!.excecao).toBe("lead em escalado_humano");
    });

    it("o SDR decide chamar você depois que você já assumiu: sem e-mail", async () => {
      const { leadId, mensagemId } = await pessoaResponde("E quanto custa?", { modo: "automatico" });
      modelo.classificacoes.push({ categoria: "pergunta", confianca: 0.9, sinais: { preco: true, reclamacao: false, idioma: "pt" } });
      const rascunhar = modelo.rascunhar.bind(modelo);
      modelo.rascunhar = async (p) => {
        await donoEscreve(leadId);
        return rascunhar(p);
      };

      expect(await rodar(mensagemId!)).toBe("escalado");
      const [contagem] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.alertas where chave like 'escalado/%'");
      expect(contagem!.n).toBe(0);
    });

    it("a resposta automática já reservada pelo despachante não sai depois que o dono escreve", async () => {
      const { leadId, mensagemId } = await pessoaResponde("Tenho interesse, pode falar.", { modo: "automatico" });
      expect(await rodar(mensagemId!)).toBe("agendado");
      const depois = new Date(AGORA.getTime() + 10 * 60_000);
      const perfil = (await carregarPerfil(banco.db, await idDoPerfil(banco.db, "arthur")))!;
      const reserva = await reservarProximaAcao(banco.db, perfil, { agora: depois, feriados: new Set(), cooldownDias: 30 });
      expect("reserva" in reserva).toBe(true);

      await donoEscreve(leadId); // chega com a resposta já reservada (enviando)

      const unipile = new UnipileFalso();
      const envio = await executarReserva(
        { db: banco.db, unipile, agora: depois, aleatorio: () => 0.5, feriados: new Set() },
        perfil,
        (reserva as { reserva: Parameters<typeof executarReserva>[2] }).reserva,
      );
      expect(envio).toMatchObject({ resultado: "cancelada" });
      expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
      expect(await lead(leadId)).toBe("escalado_humano");
    });

    it("webhook perdido: a checagem na Unipile antes da resposta automática acha o dono escrevendo", async () => {
      const { leadId, mensagemId } = await pessoaResponde("Tenho interesse, pode falar.", { modo: "automatico" });
      expect(await rodar(mensagemId!)).toBe("agendado");
      // O convite saiu antes da simulação: a checagem só olha o que veio depois dele.
      const [{ chat_id: chat }] = await banco.db.query<{ chat_id: string }>(
        "update public.leads set convite_enviado_em = $2 where id = $1::uuid returning chat_id",
        [leadId, new Date(AGORA.getTime() - 7 * 86_400_000)],
      );
      const unipile = new UnipileFalso();
      unipile.mensagensPorChat.set(chat, [
        { id: "dono-sem-webhook", texto: "Maria, te ligo amanhã!", enviadaPelaConta: true, remetenteProviderId: "ACoArthur", em: AGORA.toISOString() },
      ]);
      const depois = new Date(AGORA.getTime() + 10 * 60_000);
      const verificarResposta = criarVerificadorDeResposta({ db: banco.db, unipile, agora: depois });

      const [resultado] = await despachar({ db: banco.db, unipile, agora: depois, aleatorio: () => 0.5, verificarResposta });
      expect(resultado!.resultado).toBe("cancelada");
      expect(unipile.chamadasDe("enviarMensagem")).toHaveLength(0);
      expect(await lead(leadId)).toBe("escalado_humano");
    });
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

  describe("passagem de bastão (SDR-66)", () => {
    const PRECO = { categoria: "pergunta", confianca: 0.9, sinais: { preco: true, reclamacao: false, idioma: "pt" } } as const;
    const RECLAMACAO = { categoria: "objecao", confianca: 0.9, sinais: { preco: false, reclamacao: true, idioma: "pt" } } as const;
    const HORA = 3_600_000;
    const depois = (ms: number) => new Date(AGORA.getTime() + ms);

    const passagem = async (mensagemId: string) =>
      (await banco.db.query<{
        passada_em: Date | null;
        resumo: string | null;
        sugestao: string | null;
        ponte: string | null;
        ponte_excecao: string | null;
        acao_id: string | null;
      }>("select passada_em, resumo, sugestao, ponte, ponte_excecao, acao_id from public.rascunhos where mensagem_id = $1::uuid", [mensagemId]))[0]!;
    const alertasCom = (prefixo: string) =>
      banco.db.query<{ chave: string; destinatarios: string[]; texto: string }>(
        "select chave, destinatarios, texto from public.alertas where chave like $1 order by criado_em",
        [`${prefixo}%`],
      );
    const passarPorPreco = async (modo = "automatico") => {
      const r = await pessoaResponde("E quanto custa?", { modo });
      modelo.classificacoes.push(PRECO);
      expect(await rodar(r.mensagemId!)).toBe("escalado");
      return r;
    };

    it("preço gera ponte e passagem: a ponte sai pelo despachante com a conversa já com você", async () => {
      const { leadId, mensagemId } = await passarPorPreco();
      expect(await lead(leadId)).toBe("escalado_humano");
      const [acao] = await acoesDaIa(leadId);
      expect(acao).toMatchObject({ status: "pendente", texto_final: modelo.passagemPadrao.ponte, motivo_revisao: null });
      expect(modelo.chamadas.find((c) => c.etapa === "passar")!.entrada).toContain("Ponte: escreva.");

      const [alerta] = await alertasCom("escalado/");
      expect(alerta!.texto).toContain(`O SDR avisou a pessoa: "${modelo.passagemPadrao.ponte}"`);

      const unipile = new UnipileFalso();
      await despachar({ db: banco.db, unipile, agora: depois(HORA / 6), aleatorio: () => 0.5 });
      expect(unipile.chamadasDe("enviarMensagem")[0]).toMatchObject({ texto: modelo.passagemPadrao.ponte });
      expect(await lead(leadId)).toBe("escalado_humano");
      expect((await passagem(mensagemId!)).acao_id).not.toBeNull();

      // A ponte não conta como resposta: a conversa segue precisando de você.
      const chat = await abrirChat(banco.db, leadId);
      expect(chat!.situacao).toBe("precisa");
    });

    it("reclamação gera passagem sem ponte, mesmo que a IA escreva uma", async () => {
      const { leadId, mensagemId } = await pessoaResponde("Que chato isso.", { modo: "automatico" });
      modelo.classificacoes.push(RECLAMACAO);
      expect(await rodar(mensagemId!)).toBe("escalado");
      expect(await lead(leadId)).toBe("escalado_humano");
      expect(await acoesDaIa(leadId)).toEqual([]);
      expect(modelo.chamadas.find((c) => c.etapa === "passar")!.entrada).toContain("Ponte: não escreva (null).");
      expect(await passagem(mensagemId!)).toMatchObject({ ponte: null, ponte_excecao: null, resumo: expect.any(String), sugestao: expect.any(String) });
    });

    it("ponte barrada não sai e a passagem acontece mesmo assim", async () => {
      modelo.passagens.push({ ...modelo.passagemPadrao, ponte: "Boa pergunta, te respondo ainda hoje." });
      const { leadId, mensagemId } = await passarPorPreco();
      expect(await lead(leadId)).toBe("escalado_humano");
      expect(await acoesDaIa(leadId)).toEqual([]);
      expect(await passagem(mensagemId!)).toMatchObject({
        passada_em: expect.any(Date),
        ponte: "Boa pergunta, te respondo ainda hoje.",
        ponte_excecao: expect.stringContaining("prazo menor que 1 dia útil"),
      });
      const [alerta] = await alertasCom("escalado/");
      expect(alerta!.texto).toContain("O SDR não avisou a pessoa");
    });

    it("falha na chamada da passagem não impede a passagem", async () => {
      modelo.falhasDaPassagem.push(new ErroDoModelo("fora do formato"));
      const { leadId, mensagemId } = await passarPorPreco();
      expect(await lead(leadId)).toBe("escalado_humano");
      expect(await acoesDaIa(leadId)).toEqual([]);
      expect(await passagem(mensagemId!)).toMatchObject({ resumo: null, sugestao: null, ponte_excecao: "o SDR não conseguiu escrever a ponte" });
    });

    it('no modo "Aprovo cada resposta", a ponte vira resposta para aprovar', async () => {
      const { leadId } = await passarPorPreco("aprovacao");
      const [acao] = await acoesDaIa(leadId);
      expect(acao).toMatchObject({ status: "aguardando_aprovacao", texto_gerado: modelo.passagemPadrao.ponte, texto_final: null });
      expect(acao!.motivo_revisao).toContain("O SDR passou a conversa para você");
      const chat = await abrirChat(banco.db, leadId);
      expect(chat!.pendentes.map((p) => p.texto)).toEqual([modelo.passagemPadrao.ponte]);
    });

    it("a passagem grava resumo e sugestão e mostra no e-mail, no Chats e no Dashboard", async () => {
      const { leadId, mensagemId } = await passarPorPreco();
      const { resumo, sugestao } = modelo.passagemPadrao;
      expect(await passagem(mensagemId!)).toMatchObject({ passada_em: expect.any(Date), resumo, sugestao, ponte: modelo.passagemPadrao.ponte });

      const [alerta] = await alertasCom("escalado/");
      expect(alerta!.texto).toContain(resumo);
      expect(alerta!.texto).toContain(sugestao);
      expect(alerta!.texto).toContain("Motivo: pergunta de preço");

      const chat = await abrirChat(banco.db, leadId);
      expect(chat!.passagem).toMatchObject({ motivo: "pergunta de preço", resumo, sugestao });
      const itens = await precisaDeVoce(banco.db);
      expect(itens).toContainEqual(expect.objectContaining({ href: `/chats/${leadId}`, passagem: { resumo, sugestao } }));
    });

    it("o lembrete sai uma vez depois de 4 horas úteis, no lugar do aviso de SLA", async () => {
      const { leadId } = await passarPorPreco();
      expect(await cobrarPassagens(banco.db, depois(4 * HORA - 60_000))).toEqual({ lembretes: 0, admins: 0 });
      expect(await cobrarPassagens(banco.db, depois(4 * HORA))).toEqual({ lembretes: 1, admins: 0 });
      expect(await cobrarPassagens(banco.db, depois(5 * HORA))).toEqual({ lembretes: 0, admins: 0 });
      const lembretes = await alertasCom("passagem-lembrete/");
      expect(lembretes).toHaveLength(1);
      expect(lembretes[0]!.texto).toContain(`/chats/${leadId}`);

      await alertarSlasEstourados(banco.db, depois(5 * HORA));
      expect(await alertasCom(`sla/${leadId}`)).toEqual([]);
    });

    it("o lembrete não sai se você respondeu", async () => {
      const { leadId } = await passarPorPreco();
      const [{ chat_id: chat }] = await banco.db.query<{ chat_id: string }>("select chat_id from public.leads where id = $1::uuid", [leadId]);
      await registrarMensagem(
        banco.db,
        {
          accountId: "acc-arthur",
          chatId: chat,
          messageId: `msg-${randomUUID().slice(0, 8)}`,
          texto: "Maria, fica em R$ 2 mil por mês.",
          em: depois(HORA).toISOString(),
          remetenteProviderId: "ACoArthur",
          remetenteNome: "Arthur",
          enviadaPelaConta: true,
          participantes: [{ providerId: "ACoArthur", nome: "Arthur" }, { providerId: "ACoProspect", nome: "Maria" }],
        },
        depois(HORA),
      );
      expect(await cobrarPassagens(banco.db, depois(30 * HORA))).toEqual({ lembretes: 0, admins: 0 });
      expect((await abrirChat(banco.db, leadId))!.passagem).toBeNull();
    });

    it("o lembrete não sai se você devolveu ao SDR", async () => {
      const { leadId } = await passarPorPreco();
      const operador = await criarOperador(banco.db, { perfis: ["arthur"] });
      expect(await devolverAoSdr(banco.db, { leadId, operadorId: operador, agora: depois(HORA) })).toBe(true);
      expect(await cobrarPassagens(banco.db, depois(30 * HORA))).toEqual({ lembretes: 0, admins: 0 });
    });

    it("o admin da organização é avisado uma vez, em 1 dia útil", async () => {
      const admin = await criarOperador(banco.db, { papel: "admin", email: "admin@guessless.com.br" });
      await criarOperador(banco.db, { papel: "operador", email: "operador@guessless.com.br" });
      await banco.db.query("update public.operadores set papel = 'operador' where id <> $1::uuid and papel = 'admin'", [admin]);
      await passarPorPreco();

      expect(await cobrarPassagens(banco.db, depois(24 * HORA - 60_000))).toEqual({ lembretes: 1, admins: 0 });
      expect(await cobrarPassagens(banco.db, depois(24 * HORA))).toEqual({ lembretes: 0, admins: 1 });
      expect(await cobrarPassagens(banco.db, depois(48 * HORA))).toEqual({ lembretes: 0, admins: 0 });
      const avisos = await alertasCom("passagem-admin/");
      expect(avisos).toHaveLength(1);
      expect(avisos[0]!.destinatarios).toEqual(["admin@guessless.com.br"]);
    });
  });

  describe("com o SDR da organização (SDR-42)", () => {
    const SDR = {
      objetivo: "marcar 20 minutos com o Arthur para mostrar o diagnóstico de margem",
      voz: "Seco e direto, sem floreio.",
      abertura: "Uma observação sobre margem por canal.",
      qualificacao: ["Vende em mais de um canal"],
      objecoes: [{ objecao: "Já tenho agência", resposta: "A gente não faz mídia: mostra a margem." }],
      regras: ["Pode usar travessão quando quiser"],
      quando_chamar_voce: ["Pedido de proposta formal"],
      link_agenda: "https://cal.com/arthur-guessless/20min",
    };

    const gravar = async (sdr = SDR) =>
      gravarVersaoDoSdr(banco.db, {
        organizacaoId: await idDaOrganizacaoGuessless(banco.db),
        sdr,
        origem: "humano",
        por: null,
        agora: AGORA,
      });
    const sistemaDoRascunho = () => modelo.chamadas.filter((c) => c.etapa === "rascunhar").at(-1)!.sistema;

    it("o prompt de sistema traz o SDR e a análise no lugar da voz do perfil", async () => {
      await banco.db.query("update public.perfis set voz_md = 'Voz antiga do perfil' where slug = 'arthur'");
      await banco.db.query(
        `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
         values ($1::uuid, 'https://guessless.com.br/', 'pronta', $2::jsonb, $2::jsonb, now())`,
        [
          await idDaOrganizacaoGuessless(banco.db),
          JSON.stringify({
            empresa: { nome: "GuessLess", resumo: "Diagnóstico de margem para e-commerce." },
            produtos: [{ nome: "Diagnóstico", descricao: "Margem por canal.", para_quem: "e-commerce" }],
            para_quem: "E-commerces.",
            diferenciais: [],
            provas: [],
            dores: [],
            objecoes: [],
            tom_de_voz: "Direto.",
            idioma: "pt",
          }),
        ],
      );
      await gravar();
      const { mensagemId } = await pessoaResponde("Me conta mais?");
      await rodar(mensagemId!);

      const sistema = sistemaDoRascunho();
      expect(sistema).toContain("Missão: marcar 20 minutos com o Arthur");
      expect(sistema).toContain("GuessLess: Diagnóstico de margem para e-commerce.");
      expect(sistema).toContain('- "Já tenho agência": A gente não faz mídia');
      expect(sistema).toContain(SDR.link_agenda);
      expect(sistema).not.toContain("Voz antiga do perfil");
    });

    it("as regras da casa ficam acima de qualquer SDR", async () => {
      await gravar();
      const { mensagemId } = await pessoaResponde("Me conta mais?");
      await rodar(mensagemId!);
      const sistema = sistemaDoRascunho();
      expect(sistema).toContain("Regras da casa (valem sempre, acima do SDR");
      expect(sistema).toContain("Nunca use travessão (—) nem meia-risca (–).");
      expect(sistema.indexOf("Regras da casa")).toBeGreaterThan(sistema.indexOf("Pode usar travessão"));
    });

    it("o prompt é o mesmo na mesma versão do SDR e muda quando o SDR muda; o rascunho grava a versão", async () => {
      await gravar();
      const a = await pessoaResponde("Me conta mais?");
      const b = await pessoaResponde("Como funciona?");
      await rodar(a.mensagemId!);
      await rodar(b.mensagemId!);
      const [primeiro, segundo] = modelo.chamadas.filter((c) => c.etapa === "rascunhar").map((c) => c.sistema);
      expect(primeiro).toBe(segundo);

      await gravar({ ...SDR, objetivo: "marcar uma call com o Juliano" });
      const c = await pessoaResponde("E o preço?");
      await rodar(c.mensagemId!);
      expect(sistemaDoRascunho()).not.toBe(primeiro);
      expect(sistemaDoRascunho()).toContain("marcar uma call com o Juliano");

      const versoes = await banco.db.query<{ sdr_versao: number }>(
        "select sdr_versao from public.rascunhos where mensagem_id = any($1::uuid[]) order by sdr_versao",
        [[a.mensagemId, b.mensagemId, c.mensagemId]],
      );
      expect(versoes.map((v) => v.sdr_versao)).toEqual([1, 1, 2]);
    });

    it("as instruções da campanha vão na mensagem do usuário, não no prompt de sistema", async () => {
      await gravar();
      const { leadId, mensagemId } = await pessoaResponde("Me conta mais?");
      await banco.db.query(
        "update public.campanhas set instrucoes_sdr = 'Fale do evento de novembro' where id = (select campanha_id from public.leads where id = $1::uuid)",
        [leadId],
      );
      await rodar(mensagemId!);
      const chamada = modelo.chamadas.filter((c) => c.etapa === "rascunhar").at(-1)!;
      expect(chamada.entrada).toContain("Instruções desta campanha (valem abaixo das regras da casa):\nFale do evento de novembro");
      expect(chamada.sistema).not.toContain("evento de novembro");
    });

    it("a instrução de uma campanha não vaza para a conversa de outra (SDR-50)", async () => {
      await gravar();
      const comInstrucao = await pessoaResponde("Me conta mais?");
      await banco.db.query(
        "update public.campanhas set instrucoes_sdr = 'Fale do evento de novembro' where id = (select campanha_id from public.leads where id = $1::uuid)",
        [comInstrucao.leadId],
      );
      const semInstrucao = await pessoaResponde("Como funciona?");

      await rodar(semInstrucao.mensagemId!);
      const chamada = modelo.chamadas.filter((c) => c.etapa === "rascunhar").at(-1)!;
      expect(chamada.entrada).not.toContain("evento de novembro");
      expect(chamada.entrada).not.toContain("Instruções desta campanha");
    });

    it("sem SDR, nada muda: voz do perfil e oferta da configuração", async () => {
      await banco.db.query("update public.perfis set voz_md = 'Voz antiga do perfil' where slug = 'arthur'");
      const { mensagemId } = await pessoaResponde("Me conta mais?");
      await rodar(mensagemId!);
      const sistema = sistemaDoRascunho();
      expect(sistema).toContain("Voz antiga do perfil");
      expect(sistema).toContain("O que a GuessLess oferece agora:");
      const [registro] = await banco.db.query<{ sdr_versao: number | null }>(
        "select sdr_versao from public.rascunhos where mensagem_id = $1::uuid",
        [mensagemId],
      );
      expect(registro!.sdr_versao).toBeNull();
    });
  });
});
