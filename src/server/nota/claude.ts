import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { notasDeAderencia } from "@/domain/nota";
import { ErroDoModelo } from "@/server/agente/modelo";
import type { AvaliadorDeAderencia } from "./avaliador";

/**
 * Nota de aderência no Claude, com o modelo de classificação (Haiku, §5): um
 * lote por chamada, saída estruturada. O Haiku 4.5 não aceita esforço nem
 * pensamento adaptativo, e a tarefa não pede.
 */
export function criarAvaliadorClaude(config: { apiKey?: string; modelo: string }): AvaliadorDeAderencia {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});
  return {
    async avaliar({ sistema, entrada }) {
      const resposta = await cliente.messages.parse({
        model: config.modelo,
        max_tokens: 8000,
        system: sistema,
        messages: [{ role: "user", content: entrada }],
        output_config: { format: zodOutputFormat(notasDeAderencia) },
      });
      if (resposta.stop_reason === "refusal") {
        throw new ErroDoModelo(`O modelo recusou (${resposta.stop_details?.category ?? "sem categoria"}).`);
      }
      if (resposta.parsed_output === null || resposta.parsed_output === undefined) {
        throw new ErroDoModelo(`Resposta fora do formato (stop_reason ${resposta.stop_reason}).`);
      }
      const usage = resposta.usage;
      return {
        saida: resposta.parsed_output,
        uso: {
          entrada: usage.input_tokens,
          saida: usage.output_tokens,
          cacheLeitura: usage.cache_read_input_tokens ?? 0,
          cacheEscrita: usage.cache_creation_input_tokens ?? 0,
        },
        modelo: resposta.model,
      };
    },
  };
}
