import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { textosDoFluxo } from "@/domain/fluxo-gerado";
import { sugestaoDePublicos } from "@/domain/publico";
import { ErroDoModelo } from "@/server/agente/modelo";
import type { EscritorDeFluxo } from "./escritor";
import type { SugeridorDePublicos } from "./sugeridor";

export type ConfigDoSugeridor = {
  apiKey?: string;
  modelo: string;
  esforco: "low" | "medium" | "high" | "xhigh" | "max";
};

/** Sugestão de públicos no Claude: uma chamada com saída estruturada. */
export function criarSugeridorClaude(config: ConfigDoSugeridor): SugeridorDePublicos {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  return {
    async sugerir({ sistema, entrada }) {
      const resposta = await cliente.messages.parse({
        model: config.modelo,
        max_tokens: 16000,
        system: sistema,
        messages: [{ role: "user", content: entrada }],
        thinking: { type: "adaptive" },
        output_config: { effort: config.esforco, format: zodOutputFormat(sugestaoDePublicos) },
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

/** Os textos do fluxo do público no Claude: uma chamada com saída estruturada. */
export function criarEscritorClaude(config: ConfigDoSugeridor): EscritorDeFluxo {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  return {
    async escrever({ sistema, entrada }) {
      const resposta = await cliente.messages.parse({
        model: config.modelo,
        max_tokens: 16000,
        system: sistema,
        messages: [{ role: "user", content: entrada }],
        thinking: { type: "adaptive" },
        output_config: { effort: config.esforco, format: zodOutputFormat(textosDoFluxo) },
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
