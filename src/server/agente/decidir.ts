import { contextoDeValidacao } from "@/domain/campanha";
import { detectarOptout } from "@/domain/optout";
import { validarMensagem, type Praca, type ResultadoDaValidacao } from "@/domain/validador";
import type { Configuracao } from "@/server/configuracoes";
import type { Classificacao, Decisao, ModeloDeLinguagem, Uso } from "./modelo";
import {
  entradaDaClassificacao,
  entradaDoRascunho,
  promptDeClassificacao,
  promptDeRascunho,
  type LeadDoAgente,
  type MensagemDoHistorico,
} from "./prompts";

/** Tudo o que o agente lê para decidir, sem banco: é também a entrada do eval (SDR-16). */
export type EntradaDoAgente = {
  perfil: {
    nome: string;
    praca: Praca;
    idioma: string;
    voz: string | null;
    regras: string | null;
    palavrasProibidas: string[];
    rodape: string | null;
    limiteNotaConvite: number;
  };
  linkDeAgenda: string | null;
  responsavelDiscovery: string;
  oferta: string;
  lead: LeadDoAgente;
  mensagens: MensagemDoHistorico[];
};

/**
 * O que o agente decidiu, antes de qualquer efeito colateral:
 * - optout: registrar o opt-out (claro ou com confiança suficiente);
 * - sem_resposta: ausência automática, nada a responder;
 * - escalar: a conversa vai para um humano, sem texto;
 * - rascunho: texto validado, com as exceções que mandam para a fila no automático.
 */
export type Desfecho =
  | { tipo: "optout"; classificacao?: Classificacao; decisao?: Decisao; excecao?: string }
  | { tipo: "sem_resposta"; classificacao: Classificacao }
  | { tipo: "escalar"; classificacao: Classificacao; decisao: Decisao; motivo: string }
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

/**
 * Decisão do agente de conversa (§7) sobre a última mensagem da pessoa.
 *
 * Passo 1: classifica (Haiku). Passo 2: decide e rascunha (Sonnet). Depois,
 * regras duras que não dependem do prompt:
 * - opt-out claro é reconhecido antes de qualquer IA;
 * - todo texto passa pelo validador (§4.2); violação vira exceção;
 * - preço, reclamação, opt-out ambíguo, baixa confiança e reunião sem link
 *   viram exceção (vão para a fila no modo automático).
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
    sistema: promptDeRascunho({
      perfil: ctx.perfil,
      linkDeAgenda: ctx.linkDeAgenda,
      responsavelDiscovery: ctx.responsavelDiscovery,
      oferta: ctx.oferta,
    }),
    entrada: entradaDoRascunho({ lead: ctx.lead, mensagens: ctx.mensagens, nomeDoPerfil: ctx.perfil.nome, classificacao }),
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

  const texto = decisao.mensagem?.trim() || null;
  const precisaDeTexto = ["responder", "propor_reuniao", "encerrar"].includes(decisao.acao);
  if (decisao.acao === "escalar_humano" || (precisaDeTexto && !texto) || (!texto && excecoes.length > 0)) {
    const motivo = decisao.acao === "escalar_humano" ? decisao.motivo : excecoes[0] ?? "o agente não escreveu resposta";
    return { tipo: "escalar", classificacao, decisao, motivo };
  }

  const validacao = texto
    ? validarMensagem(
        texto,
        contextoDeValidacao(
          {
            praca: ctx.perfil.praca,
            palavrasProibidas: ctx.perfil.palavrasProibidas,
            rodapeObrigatorio: ctx.perfil.rodape,
            limiteNotaConvite: ctx.perfil.limiteNotaConvite,
            linkDeAgenda: ctx.linkDeAgenda,
          },
          null,
          "ia",
        ),
      )
    : null;
  if (validacao && !validacao.ok) excecoes.push(`validador: ${validacao.violacoes.map((v) => v.mensagem).join(" ")}`);
  if (decisao.acao === "propor_reuniao" && !ctx.linkDeAgenda) excecoes.push("sem link de agenda configurado");
  if (classificacao.sinais.preco) excecoes.push("pergunta de preço");
  if (classificacao.sinais.reclamacao) excecoes.push("reclamação");
  if (decisao.confianca < configuracao.limiar_confianca) excecoes.push("baixa confiança");

  return {
    tipo: "rascunho",
    classificacao,
    decisao,
    texto,
    validacao,
    excecao: excecoes.length > 0 ? excecoes.join("; ") : null,
  };
}
