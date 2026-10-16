/**
 * Os canais da organização (§4.18 a §4.20 e §4.27 a §4.29). Cada um é uma
 * linha de `canais` (o check de `canais.tipo` tem esta mesma lista). Disparo é
 * só WhatsApp e Telegram (D22): Instagram e Messenger servem para conversa, e
 * o número dos grupos (`whatsapp_app`) nunca fala de um para um.
 *
 * Sem `server-only`: o painel usa.
 */

export const TIPOS_DE_CANAL = ["whatsapp", "telegram", "instagram", "facebook", "whatsapp_app"] as const;
export type TipoDeCanal = (typeof TIPOS_DE_CANAL)[number];

export const CANAIS_DE_DISPARO = ["whatsapp", "telegram"] as const satisfies readonly TipoDeCanal[];
export type CanalDeDisparo = (typeof CANAIS_DE_DISPARO)[number];

export function ehCanalDeDisparo(valor: unknown): valor is CanalDeDisparo {
  return typeof valor === "string" && (CANAIS_DE_DISPARO as readonly string[]).includes(valor);
}

export const NOME_DO_CANAL: Record<TipoDeCanal, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp_app: "WhatsApp dos grupos",
};
