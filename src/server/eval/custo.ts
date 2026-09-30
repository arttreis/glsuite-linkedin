import type { Uso } from "@/server/agente/modelo";

/**
 * Preço por milhão de tokens (US$), tabela da Anthropic em 25/09/2026. A escrita
 * de cache (TTL de 5 min) custa 1,25× a entrada e a leitura, 0,1×.
 */
export const PRECOS_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "claude-haiku-4-5": { entrada: 1, saida: 5 },
  "claude-sonnet-5": { entrada: 2, saida: 10 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10 },
  "claude-opus-5": { entrada: 5, saida: 25 },
  "claude-opus-5-5": { entrada: 4, saida: 20 },
  "claude-fable-5-1": { entrada: 10, saida: 50 },
};

const FATOR_ESCRITA_CACHE = 1.25;
const FATOR_LEITURA_CACHE = 0.1;

/** Acha o preço pelo id do modelo; aceita id com data no fim ("claude-haiku-4-5-20251001"). */
export function precoDoModelo(modelo: string): { entrada: number; saida: number } | null {
  const candidatos = Object.keys(PRECOS_POR_MILHAO)
    .filter((id) => modelo === id || modelo.startsWith(`${id}-2`))
    .sort((a, b) => b.length - a.length);
  return candidatos[0] ? PRECOS_POR_MILHAO[candidatos[0]]! : null;
}

/** Custo em US$ de uma chamada. Modelo sem preço na tabela devolve null (o relatório avisa). */
export function custoDaChamada(modelo: string, uso: Uso): number | null {
  const preco = precoDoModelo(modelo);
  if (!preco) return null;
  const entrada =
    uso.entrada * preco.entrada +
    uso.cacheEscrita * preco.entrada * FATOR_ESCRITA_CACHE +
    uso.cacheLeitura * preco.entrada * FATOR_LEITURA_CACHE;
  return (entrada + uso.saida * preco.saida) / 1_000_000;
}
