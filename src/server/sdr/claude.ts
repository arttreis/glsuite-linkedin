import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { sdrDaIa } from "@/domain/sdr";
import { ajusteDoSdr } from "@/domain/teste-do-sdr";
import { ErroDoModelo } from "@/server/agente/modelo";
import type { GeradorDeSdr } from "./sdr";
import type { AjustadorDeSdr } from "./teste";

export type ConfigDoGerador = {
  apiKey?: string;
  modelo: string;
  esforco: "low" | "medium" | "high" | "xhigh" | "max";
};

/** O SDR gerado no Claude: uma chamada com saída estruturada. */
export function criarGeradorDeSdrClaude(config: ConfigDoGerador): GeradorDeSdr {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  return {
    async gerar({ sistema, entrada }) {
      const resposta = await cliente.messages.parse({
        model: config.modelo,
        max_tokens: 16000,
        system: sistema,
        messages: [{ role: "user", content: entrada }],
        thinking: { type: "adaptive" },
        output_config: { effort: config.esforco, format: zodOutputFormat(sdrDaIa) },
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

/** O ajuste do SDR no Claude: uma chamada com saída estruturada. */
export function criarAjustadorDeSdrClaude(config: ConfigDoGerador): AjustadorDeSdr {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  return {
    async ajustar({ sistema, entrada }) {
      const resposta = await cliente.messages.parse({
        model: config.modelo,
        max_tokens: 16000,
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: entrada }],
        thinking: { type: "adaptive" },
        output_config: { effort: config.esforco, format: zodOutputFormat(ajusteDoSdr) },
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
