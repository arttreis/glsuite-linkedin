import type { NotasDeAderencia } from "@/domain/nota";
import type { Resposta } from "@/server/agente/modelo";

/**
 * Dá a nota de aderência de um lote de pessoas contra o público (§4.13). Em
 * produção é o Claude (`claude.ts`); nos testes, um falso.
 */
export interface AvaliadorDeAderencia {
  avaliar(p: { sistema: string; entrada: string }): Promise<Resposta<NotasDeAderencia>>;
}
