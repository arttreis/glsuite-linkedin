import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { classificacao, conviteT1, decisao, ErroDoModelo, type ModeloDeLinguagem, type Resposta, type Uso } from "./modelo";

export type ConfigDoClaude = {
  /** Sem chave, o SDK resolve pelo ambiente (ANTHROPIC_API_KEY). */
  apiKey?: string;
  /** Passo 1: 30 palavras não pedem modelo de topo (§5). */
  modeloClassificacao: string;
  /** Passo 2: rascunho e pesquisa. */
  modeloRascunho: string;
  esforcoRascunho: "low" | "medium" | "high" | "xhigh" | "max";
};

const paraUso = (usage: Anthropic.Usage): Uso => ({
  entrada: usage.input_tokens,
  saida: usage.output_tokens,
  cacheLeitura: usage.cache_read_input_tokens ?? 0,
  cacheEscrita: usage.cache_creation_input_tokens ?? 0,
});

/**
 * Agente de conversa no Claude, pelo SDK oficial. O prompt de sistema de cada
 * perfil é estável e vai com `cache_control`; a conversa vai na mensagem do
 * usuário. Saída estruturada com zod: o que não bate com o formato vira erro,
 * nunca texto solto.
 */
export function criarModeloClaude(config: ConfigDoClaude): ModeloDeLinguagem {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  async function pedir<T extends z.ZodType>(
    esquema: T,
    p: { sistema: string; entrada: string },
    opcoes: { modelo: string; maxTokens: number; comPensamento: boolean },
  ): Promise<Resposta<z.infer<T>>> {
    const resposta = await cliente.messages.parse({
      model: opcoes.modelo,
      max_tokens: opcoes.maxTokens,
      system: [{ type: "text", text: p.sistema, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: p.entrada }],
      ...(opcoes.comPensamento
        ? { thinking: { type: "adaptive" as const }, output_config: { effort: config.esforcoRascunho, format: zodOutputFormat(esquema) } }
        : { output_config: { format: zodOutputFormat(esquema) } }),
    });
    if (resposta.stop_reason === "refusal") {
      throw new ErroDoModelo(`O modelo recusou (${resposta.stop_details?.category ?? "sem categoria"}).`);
    }
    if (resposta.parsed_output === null || resposta.parsed_output === undefined) {
      throw new ErroDoModelo(`Resposta fora do formato (stop_reason ${resposta.stop_reason}).`);
    }
    return { saida: resposta.parsed_output as z.infer<T>, uso: paraUso(resposta.usage), modelo: resposta.model };
  }

  return {
    classificar: (p) =>
      pedir(classificacao, p, { modelo: config.modeloClassificacao, maxTokens: 1024, comPensamento: false }),
    rascunhar: (p) => pedir(decisao, p, { modelo: config.modeloRascunho, maxTokens: 16000, comPensamento: true }),
    escreverConvite: (p) => pedir(conviteT1, p, { modelo: config.modeloRascunho, maxTokens: 16000, comPensamento: true }),
  };
}
