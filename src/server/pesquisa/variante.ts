import { createHash } from "node:crypto";

export type VarianteDeCopy = "template" | "personalizada";

/**
 * Sorteio do A/B do T1 (SDR-15), estável por lead: o mesmo lead cai sempre no
 * mesmo braço, sem guardar estado, e a divisão segue a proporção configurada.
 */
export function sortearVariante(leadId: string, proporcaoPersonalizada: number): VarianteDeCopy {
  const balde = createHash("sha256").update(leadId).digest().readUInt32BE(0) / 0x1_0000_0000;
  return balde < proporcaoPersonalizada ? "personalizada" : "template";
}
