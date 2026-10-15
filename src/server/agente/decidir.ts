import { contextoDeValidacao } from "@/domain/campanha";
import { detectarOptout } from "@/domain/optout";
import { limiarDaCautela, problemaDaPonte, resumoEmTresLinhas } from "@/domain/passagem";
import type { Sdr } from "@/domain/sdr";
import { validarMensagem, type Praca, type ResultadoDaValidacao } from "@/domain/validador";
import type { Configuracao } from "@/server/configuracoes";
import type { Classificacao, Decisao, ModeloDeLinguagem, PassagemDaIa, Uso } from "./modelo";
import { entradaDaPassagem, promptDaPassagem } from "./prompts-da-passagem";
import {
  entradaDaAbertura,
  entradaDaClassificacao,
  entradaDoRascunho,
  promptDeClassificacao,
  promptDeRascunho,
  type LeadDoAgente,
  type MensagemDoHistorico,
} from "./prompts";

const SEM_TEXTO = "o agente não escreveu resposta";

/** Tudo o que o agente lê para decidir, sem banco: é também a entrada do eval (SDR-16). */
export type EntradaDoAgente = {
  perfil: {
    nome: string;
    praca: Praca;
    idioma: string;
    voz: string | null;
    regras: string | null;
    palavrasProibidas: string[];
    limiteNotaConvite: number;
  };
  linkDeAgenda: string | null;
  responsavelDiscovery: string;
  oferta: string;
  /** O SDR da organização (§4.3), na versão atual. Sem ele, valem a voz e as regras do perfil. */
  sdr?: { versao: number; sdr: Sdr } | null;
  /** Instruções do SDR que valem só na campanha do lead (§4.11). */
  instrucoesDaCampanha?: string | null;
  lead: LeadDoAgente;
  mensagens: MensagemDoHistorico[];
};

/**
 * A passagem de bastão (SDR-66): o que a pessoa recebe (resumo e resposta
 * sugerida) e a ponte que o SDR manda antes de parar.
 */
export type Passagem = {
  /** Até 3 linhas: quem é, o que já conversaram, o que pediu. */
  resumo: string | null;
  sugestao: string | null;
  /** A ponte que sai: só nos casos com ponte e depois do validador. */
  ponte: string | null;
  /** A ponte que o SDR escreveu, mesmo barrada (fica gravada). */
  ponteEscrita: string | null;
  /** Por que um caso com ponte ficou sem ela (barrada, não escrita). */
  ponteExcecao: string | null;
};

/**
 * O que o agente decidiu, antes de qualquer efeito colateral:
 * - optout: registrar o opt-out (claro ou com confiança suficiente);
 * - sem_resposta: ausência automática, nada a responder;
 * - escalar: a conversa vai para um humano, com a passagem (e a ponte, se couber);
 * - rascunho: texto validado, com as exceções que mandam para a fila no automático.
 */
export type Desfecho =
  | { tipo: "optout"; classificacao?: Classificacao; decisao?: Decisao; excecao?: string }
  | { tipo: "sem_resposta"; classificacao: Classificacao }
  | { tipo: "escalar"; classificacao: Classificacao; decisao: Decisao; motivo: string; passagem: Passagem }
  | {
      tipo: "rascunho";
      classificacao: Classificacao;
      decisao: Decisao;
      texto: string | null;
      validacao: ResultadoDaValidacao | null;
      excecao: string | null;
    };

/** Modelos e uso de tokens acumulados, preenchidos mesmo quando uma chamada falha no meio. */
export type Consumo = { modelos: Record<string, string>; uso: Record<string, Uso> };

const somaDeUso = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  saida: a.saida + b.saida,
  cacheLeitura: a.cacheLeitura + b.cacheLeitura,
  cacheEscrita: a.cacheEscrita + b.cacheEscrita,
});

/** O prompt de sistema do rascunho: o mesmo para responder e para abrir a conversa. */
function sistemaDoRascunho(ctx: EntradaDoAgente): string {
  return promptDeRascunho({
    perfil: ctx.perfil,
    linkDeAgenda: ctx.linkDeAgenda,
    responsavelDiscovery: ctx.responsavelDiscovery,
    oferta: ctx.oferta,
    sdr: ctx.sdr?.sdr ?? null,
  });
}

/** O validador (§4.2) sobre um texto escrito pela IA, no contexto do perfil. */
function validarTextoDaIa(ctx: EntradaDoAgente, texto: string): ResultadoDaValidacao {
  return validarMensagem(
    texto,
    contextoDeValidacao(
      {
        praca: ctx.perfil.praca,
        palavrasProibidas: ctx.perfil.palavrasProibidas,
        limiteNotaConvite: ctx.perfil.limiteNotaConvite,
        linkDeAgenda: ctx.linkDeAgenda,
      },
      null,
      "ia",
    ),
  );
}

/** Casos em que o SDR passa em silêncio, sem ponte (§4.7). */
const SEM_PONTE = ["reclamação", "opt-out ambíguo", "baixa confiança", SEM_TEXTO];

function cabePonte(classificacao: Classificacao, motivos: readonly string[]): boolean {
  if (classificacao.sinais.reclamacao || classificacao.categoria === "optout") return false;
  return !motivos.some((motivo) => SEM_PONTE.includes(motivo));
}

/**
 * Passagem de bastão (SDR-66): uma chamada barata escreve o resumo, a resposta
 * sugerida e, nos casos com ponte, a ponte. A ponte passa pelo validador e
 * pelas regras dela (`problemaDaPonte`); barrada, não sai. Se a chamada
 * falhar, a passagem acontece do mesmo jeito, sem nada disso.
 */
async function prepararPassagem(
  ctx: EntradaDoAgente,
  modelo: ModeloDeLinguagem,
  consumo: Consumo,
  p: { motivo: string; comPonte: boolean },
): Promise<Passagem> {
  let saida: PassagemDaIa;
  try {
    const resposta = await modelo.passar({
      sistema: promptDaPassagem({ perfil: ctx.perfil, sdr: ctx.sdr?.sdr ?? null }),
      entrada: entradaDaPassagem({
        lead: ctx.lead,
        mensagens: ctx.mensagens,
        nomeDoPerfil: ctx.perfil.nome,
        motivo: p.motivo,
        comPonte: p.comPonte,
      }),
    });
    consumo.modelos.passagem = resposta.modelo;
    consumo.uso.passagem = resposta.uso;
    if (consumo.uso.total) consumo.uso.total = somaDeUso(consumo.uso.total, resposta.uso);
    saida = resposta.saida;
  } catch {
    return {
      resumo: null,
      sugestao: null,
      ponte: null,
      ponteEscrita: null,
      ponteExcecao: p.comPonte ? "o SDR não conseguiu escrever a ponte" : null,
    };
  }

  const resumo = resumoEmTresLinhas(saida.resumo) || null;
  const sugestao = saida.sugestao.trim() || null;
  const escrita = p.comPonte ? saida.ponte?.trim() || null : null;
  if (!p.comPonte) return { resumo, sugestao, ponte: null, ponteEscrita: null, ponteExcecao: null };
  if (!escrita) return { resumo, sugestao, ponte: null, ponteEscrita: null, ponteExcecao: "o SDR não escreveu a ponte" };

  const validacao = validarTextoDaIa(ctx, escrita);
  const problemas = [...validacao.violacoes.map((v) => v.mensagem), problemaDaPonte(escrita)].filter((x): x is string => !!x);
  return problemas.length > 0
    ? { resumo, sugestao, ponte: null, ponteEscrita: escrita, ponteExcecao: `validador: ${problemas.join(" ")}` }
    : { resumo, sugestao, ponte: escrita, ponteEscrita: escrita, ponteExcecao: null };
}

/**
 * A primeira mensagem depois do aceite, no jeito da abertura do SDR (§4.3).
 * Mesmo prompt de sistema e mesmo validador do rascunho; só a mensagem do
 * usuário muda. `mensagens` da entrada é ignorado: a conversa ainda não existe.
 */
export async function abrirConversa(p: {
  entrada: EntradaDoAgente;
  modelo: ModeloDeLinguagem;
  consumo: Consumo;
}): Promise<{ decisao: Decisao; texto: string | null; validacao: ResultadoDaValidacao | null; excecao: string | null }> {
  const { entrada: ctx, modelo, consumo } = p;
  const rascunhada = await modelo.rascunhar({
    sistema: sistemaDoRascunho(ctx),
    entrada: entradaDaAbertura({ lead: ctx.lead, instrucoesDaCampanha: ctx.instrucoesDaCampanha ?? null }),
  });
  consumo.modelos.rascunho = rascunhada.modelo;
  consumo.uso.rascunho = rascunhada.uso;
  const decisao = rascunhada.saida;
  const texto = decisao.mensagem?.trim() || null;
  const validacao = texto ? validarTextoDaIa(ctx, texto) : null;
  const excecao = !texto
    ? "o agente não escreveu a abertura"
    : validacao && !validacao.ok
      ? `validador: ${validacao.violacoes.map((v) => v.mensagem).join(" ")}`
      : null;
  return { decisao, texto, validacao, excecao };
}

/**
 * Decisão do agente de conversa (§7) sobre a última mensagem da pessoa.
 *
 * Passo 1: classifica (Haiku). Passo 2: decide e rascunha (Sonnet). Depois,
 * regras duras que não dependem do prompt:
 * - opt-out claro é reconhecido antes de qualquer IA;
 * - preço, reclamação, opt-out ambíguo, baixa confiança e reunião sem link
 *   fazem o SDR parar e chamar você (§4.7), em qualquer modo; "baixa" é
 *   abaixo do nível de cautela do SDR (`limiarDaCautela`). A passagem leva
 *   resumo e resposta sugerida, e a ponte nos casos que a pedem (SDR-66);
 * - todo texto passa pelo validador (§4.13); texto barrado vira resposta
 *   para aprovar, com o motivo, e nunca sai sozinho.
 *
 * Não toca no banco: `processarComAgente` aplica o desfecho, e o eval (SDR-16)
 * roda exatamente esta função contra o dataset.
 */
export async function decidirResposta(p: {
  entrada: EntradaDoAgente;
  modelo: ModeloDeLinguagem;
  configuracao: Configuracao<"agente">;
  consumo: Consumo;
  /** Chamado assim que a classificação sai (a inbox mostra a categoria mesmo se o rascunho falhar). */
  aoClassificar?: (classificacao: Classificacao) => Promise<void>;
}): Promise<Desfecho> {
  const { entrada: ctx, modelo, configuracao, consumo } = p;
  const ultima = ctx.mensagens.filter((m) => m.direcao === "entrada").at(-1);

  if (ultima && detectarOptout(ultima.texto).claro) {
    return { tipo: "optout", excecao: "pedido claro de opt-out" };
  }

  // Passo 1: classificação.
  const classificada = await modelo.classificar({
    sistema: promptDeClassificacao(),
    entrada: entradaDaClassificacao(ctx.mensagens, ctx.perfil.nome),
  });
  const classificacao = classificada.saida;
  consumo.modelos.classificacao = classificada.modelo;
  consumo.uso.classificacao = classificada.uso;
  await p.aoClassificar?.(classificacao);

  if (classificacao.categoria === "optout" && classificacao.confianca >= configuracao.limiar_optout) {
    return { tipo: "optout", classificacao };
  }
  if (classificacao.categoria === "fora_do_escritorio" && classificacao.confianca >= configuracao.limiar_confianca) {
    return { tipo: "sem_resposta", classificacao };
  }

  // Passo 2: decisão e rascunho.
  const rascunhada = await modelo.rascunhar({
    sistema: sistemaDoRascunho(ctx),
    entrada: entradaDoRascunho({
      lead: ctx.lead,
      mensagens: ctx.mensagens,
      nomeDoPerfil: ctx.perfil.nome,
      classificacao,
      instrucoesDaCampanha: ctx.instrucoesDaCampanha ?? null,
    }),
  });
  const decisao = rascunhada.saida;
  consumo.modelos.rascunho = rascunhada.modelo;
  consumo.uso.rascunho = rascunhada.uso;
  consumo.uso.total = somaDeUso(classificada.uso, rascunhada.uso);

  const excecoes: string[] = [];
  if (classificacao.categoria === "optout") excecoes.push("opt-out ambíguo");

  if (decisao.acao === "registrar_optout") {
    if (classificacao.categoria === "optout" && decisao.confianca >= configuracao.limiar_optout) {
      return { tipo: "optout", classificacao, decisao };
    }
    excecoes.push("opt-out ambíguo");
  }

  // Com SDR, o limiar é o nível de cautela que a pessoa escolheu; sem ele, o global.
  const limiar = ctx.sdr ? limiarDaCautela(ctx.sdr.sdr.cautela) : configuracao.limiar_confianca;
  const escalar = async (motivo: string, motivos: readonly string[]): Promise<Desfecho> => ({
    tipo: "escalar",
    classificacao,
    decisao,
    motivo,
    passagem: await prepararPassagem(ctx, modelo, consumo, { motivo, comPonte: cabePonte(classificacao, motivos) }),
  });

  const texto = decisao.mensagem?.trim() || null;
  const precisaDeTexto = ["responder", "propor_reuniao", "encerrar"].includes(decisao.acao);
  if (decisao.acao === "escalar_humano") {
    // O próprio SDR decidiu passar: fora do comum ou caso da pessoa leva ponte; na dúvida, silêncio.
    return escalar(decisao.motivo, decisao.confianca < limiar ? [...excecoes, "baixa confiança"] : excecoes);
  }
  if ((precisaDeTexto && !texto) || (!texto && excecoes.length > 0)) {
    const motivo = excecoes[0] ?? SEM_TEXTO;
    return escalar(motivo, [motivo]);
  }

  // O que faz o SDR parar e chamar você naquela conversa (§4.7).
  if (decisao.acao === "propor_reuniao" && !ctx.linkDeAgenda) excecoes.push("quer marcar a reunião e não há link de agenda");
  if (classificacao.sinais.preco) excecoes.push("pergunta de preço");
  if (classificacao.sinais.reclamacao) excecoes.push("reclamação");
  if (decisao.confianca < limiar) excecoes.push("baixa confiança");
  if (excecoes.length > 0) return escalar(excecoes.join("; "), excecoes);

  // Texto barrado pelo validador nunca sai: vira resposta para aprovar, com o motivo.
  const validacao = texto ? validarTextoDaIa(ctx, texto) : null;
  return {
    tipo: "rascunho",
    classificacao,
    decisao,
    texto,
    validacao,
    excecao: validacao && !validacao.ok ? `validador: ${validacao.violacoes.map((v) => v.mensagem).join(" ")}` : null,
  };
}
