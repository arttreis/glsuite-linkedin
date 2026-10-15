import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { dossieDaIa } from "@/domain/dossie";
import { ErroDoModelo, type Uso } from "@/server/agente/modelo";
import type { FonteDoSite, LeitorDeSite } from "./leitor";
import { comecouOMercado, trechoDaPagina } from "./progresso";

export type ConfigDoLeitor = {
  apiKey?: string;
  modelo: string;
  esforco: "low" | "medium" | "high" | "xhigh" | "max";
};

/** Uma leitura longa pode pausar no meio (limite do laço do servidor); retoma até este número de vezes. */
const MAX_RETOMADAS = 4;
/** Texto de cada página que entra no contexto, aproximado. */
const TOKENS_POR_PAGINA = 6000;

const USO_ZERO: Uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };

const somar = (a: Uso, usage: Anthropic.Usage): Uso => ({
  entrada: a.entrada + usage.input_tokens,
  saida: a.saida + usage.output_tokens,
  cacheLeitura: a.cacheLeitura + (usage.cache_read_input_tokens ?? 0),
  cacheEscrita: a.cacheEscrita + (usage.cache_creation_input_tokens ?? 0),
});

const fonteDa = (pagina: Anthropic.WebFetchBlock): FonteDoSite => ({
  url: pagina.url,
  titulo: pagina.content.title ?? null,
  trecho: pagina.content.source.type === "text" ? trechoDaPagina(pagina.content.source.data) : null,
});

/**
 * Leitor do site no Claude. A leitura usa a ferramenta `web_fetch`, que roda no
 * servidor da Anthropic e fica presa ao domínio do cliente; a estruturação é
 * uma chamada separada com saída estruturada (sem citações, que não combinam
 * com o formato fixo).
 */
export function criarLeitorClaude(config: ConfigDoLeitor): LeitorDeSite {
  const cliente = new Anthropic(config.apiKey ? { apiKey: config.apiKey } : {});

  return {
    async ler({ sistema, url, dominio, maxPaginas, aoAbrirPagina }) {
      const ferramenta: Anthropic.WebFetchTool20260209 = {
        type: "web_fetch_20260209",
        name: "web_fetch",
        allowed_domains: [dominio, `www.${dominio}`],
        max_uses: maxPaginas,
        max_content_tokens: TOKENS_POR_PAGINA,
      };
      const mensagens: Anthropic.MessageParam[] = [{ role: "user", content: url }];
      let uso = USO_ZERO;
      const fontes = new Map<string, FonteDoSite>();
      let notas = "";
      let modelo = config.modelo;

      for (let rodada = 0; rodada <= MAX_RETOMADAS; rodada++) {
        const fluxo = cliente.messages.stream({
          model: config.modelo,
          max_tokens: 32000,
          system: sistema,
          messages: mensagens,
          tools: [ferramenta],
          thinking: { type: "adaptive" },
          output_config: { effort: config.esforco },
        });
        fluxo.on("contentBlock", (bloco) => {
          if (bloco.type === "web_fetch_tool_result" && bloco.content.type === "web_fetch_result") {
            aoAbrirPagina?.(fonteDa(bloco.content));
          }
        });
        const resposta = await fluxo.finalMessage();
        uso = somar(uso, resposta.usage);
        modelo = resposta.model;
        for (const bloco of resposta.content) {
          if (bloco.type === "web_fetch_tool_result" && bloco.content.type === "web_fetch_result") {
            fontes.set(bloco.content.url, fonteDa(bloco.content));
          }
          if (bloco.type === "text") notas += bloco.text;
        }
        if (resposta.stop_reason === "refusal") {
          throw new ErroDoModelo(`O modelo recusou (${resposta.stop_details?.category ?? "sem categoria"}).`);
        }
        if (resposta.stop_reason !== "pause_turn") break;
        mensagens.push({ role: "assistant", content: resposta.content });
      }

      if (fontes.size === 0) throw new ErroDoModelo("Não consegui abrir nenhuma página do site.");
      if (notas.trim().length === 0) throw new ErroDoModelo("A leitura terminou sem anotações.");
      return { notas: notas.trim(), fontes: [...fontes.values()], uso, modelo };
    },

    async estruturar({ sistema, entrada, aoComecarMercado }) {
      // Em fluxo só para ver o Mercado começar; a resposta é a mesma de uma chamada inteira.
      const fluxo = cliente.messages.stream({
        model: config.modelo,
        max_tokens: 16000,
        system: sistema,
        messages: [{ role: "user", content: entrada }],
        thinking: { type: "adaptive" },
        output_config: { effort: config.esforco, format: zodOutputFormat(dossieDaIa) },
      });
      let noMercado = false;
      fluxo.on("text", (_, parcial) => {
        if (noMercado || !comecouOMercado(parcial)) return;
        noMercado = true;
        aoComecarMercado?.();
      });
      const resposta = await fluxo.finalMessage();
      if (resposta.stop_reason === "refusal") {
        throw new ErroDoModelo(`O modelo recusou (${resposta.stop_details?.category ?? "sem categoria"}).`);
      }
      if (resposta.parsed_output === null || resposta.parsed_output === undefined) {
        throw new ErroDoModelo(`Resposta fora do formato (stop_reason ${resposta.stop_reason}).`);
      }
      return { saida: resposta.parsed_output, uso: somar(USO_ZERO, resposta.usage), modelo: resposta.model };
    },
  };
}
