import Anthropic, { AnthropicError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { resumoDaIa } from "@/domain/objetivo";
import { ErroDoModelo } from "@/server/agente/modelo";
import type { ResumidorDeObjetivo } from "./objetivo";

/**
 * O SDK valida a saída estruturada com o esquema zod e lança `AnthropicError`
 * quando ela não fecha ou vem cortada. Isso é resposta fora do formato, não IA
 * fora do ar (SDR-63): vira `ErroDoModelo` com uma frase clara, e o detalhe
 * fica no log.
 */
export function foraDoFormato(erro: unknown): never {
  if (erro instanceof AnthropicError && erro.message.startsWith("Failed to parse structured output")) {
    console.error("Saída estruturada fora do esquema", erro.message);
    throw new ErroDoModelo("A IA devolveu o resumo fora do formato. Tente de novo.");
  }
  throw erro;
}

/**
 * O resumo do objetivo no Claude, com o modelo de classificação (Haiku, §5):
 * é reescrever as respostas em poucas frases, e a pessoa espera na tela. Uma
 * chamada, saída estruturada.
 */
export function criarResumidorDeObjetivoClaude(config: { apiKey?: string; modelo: string }): ResumidorDeObjetivo {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  return {
    async resumir({ sistema, entrada }) {
      const resposta = await cliente.messages
        .parse({
          model: config.modelo,
          max_tokens: 4000,
          system: sistema,
          messages: [{ role: "user", content: entrada }],
          output_config: { format: zodOutputFormat(resumoDaIa) },
        })
        .catch(foraDoFormato);
      if (resposta.stop_reason === "refusal") {
        throw new ErroDoModelo(`O modelo recusou (${resposta.stop_details?.category ?? "sem categoria"}).`);
      }
      if (resposta.parsed_output === null || resposta.parsed_output === undefined) {
        throw new ErroDoModelo("A IA devolveu o resumo fora do formato. Tente de novo.");
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
