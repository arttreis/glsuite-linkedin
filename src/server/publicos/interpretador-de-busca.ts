import type { PedidoDeBusca } from "@/domain/conversa-da-busca";
import type { Resposta } from "@/server/agente/modelo";

/**
 * Lê o pedido da pessoa e devolve a busca como deve ficar (SDR-62). Em
 * produção é o Claude (`claude.ts`); nos testes, um falso.
 */
export interface InterpretadorDeBusca {
  interpretar(p: { sistema: string; entrada: string }): Promise<Resposta<PedidoDeBusca>>;
}
