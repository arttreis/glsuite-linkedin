import Anthropic, { AnthropicError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { analiseDaIa } from "@/domain/concorrentes";
import { ErroDoModelo } from "@/server/agente/modelo";
import { criarLeitorClaude, type ConfigDoLeitor } from "@/server/oferta/claude";
import type { AnalistaDeConcorrente } from "./analista";

/**
 * A análise de concorrente no Claude: a leitura é a mesma do site da
 * organização (`web_fetch` preso ao domínio do concorrente); a comparação é
 * uma chamada com saída estruturada, sem limite de tamanho no esquema (os
 * limites valem depois, item a item).
 */
export function criarAnalistaDeConcorrenteClaude(config: ConfigDoLeitor): AnalistaDeConcorrente {
  const leitor = criarLeitorClaude(config);
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  return {
    ler: leitor.ler,

    async analisar({ sistema, entrada }) {
      let resposta;
      try {
        resposta = await cliente.messages.parse({
          model: config.modelo,
          max_tokens: 8000,
          system: sistema,
          messages: [{ role: "user", content: entrada }],
          thinking: { type: "adaptive" },
          output_config: { effort: config.esforco, format: zodOutputFormat(analiseDaIa) },
        });
      } catch (erro) {
        // O SDK valida a resposta com o esquema e lança se o JSON não fecha.
        if (erro instanceof AnthropicError && erro.message.startsWith("Failed to parse structured output")) {
          throw new ErroDoModelo("A resposta da IA veio fora do formato.");
        }
        throw erro;
      }
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
