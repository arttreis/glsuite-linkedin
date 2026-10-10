import { z } from "zod";

/**
 * O que a IA devolve na nota de aderência (§4.13): uma nota de 0 a 100 e o
 * motivo numa linha para cada pessoa do lote, pelo índice da lista que ela
 * recebeu. Assim a nota não tem como cair na pessoa errada.
 */
export const notasDeAderencia = z.object({
  notas: z.array(z.object({ indice: z.number().int(), nota: z.number(), motivo: z.string() })),
});
export type NotasDeAderencia = z.infer<typeof notasDeAderencia>;

export type NotaDoLead = { indice: number; nota: number; motivo: string };

/**
 * Fica com uma nota por índice da lista, dentro dela, de 0 a 100 inteira e
 * com motivo de até 200 caracteres. Quem ficou sem nota volta no próximo lote.
 */
export function notasValidas(saida: NotasDeAderencia, tamanhoDoLote: number): NotaDoLead[] {
  const porIndice = new Map<number, NotaDoLead>();
  for (const item of saida.notas) {
    if (item.indice < 0 || item.indice >= tamanhoDoLote || porIndice.has(item.indice)) continue;
    if (!Number.isFinite(item.nota)) continue;
    const motivo = item.motivo.replace(/\s+/g, " ").trim().slice(0, 200);
    porIndice.set(item.indice, { indice: item.indice, nota: Math.round(Math.min(100, Math.max(0, item.nota))), motivo: motivo || "sem motivo" });
  }
  return [...porIndice.values()];
}
