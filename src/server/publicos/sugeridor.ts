import type { SugestaoDePublicos } from "@/domain/publico";
import type { Resposta } from "@/server/agente/modelo";

/**
 * Sugere públicos a partir do dossiê confirmado (§4.12). Em produção é o
 * Claude (`claude.ts`); nos testes, um falso.
 */
export interface SugeridorDePublicos {
  sugerir(p: { sistema: string; entrada: string }): Promise<Resposta<SugestaoDePublicos>>;
}
