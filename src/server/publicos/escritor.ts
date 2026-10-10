import type { TextosDoFluxo } from "@/domain/fluxo-gerado";
import type { Resposta } from "@/server/agente/modelo";

/**
 * Escreve os textos do fluxo de uma campanha de público (§4.14). Em produção é
 * o Claude (`claude.ts`); nos testes, um falso.
 */
export interface EscritorDeFluxo {
  escrever(p: { sistema: string; entrada: string }): Promise<Resposta<TextosDoFluxo>>;
}
