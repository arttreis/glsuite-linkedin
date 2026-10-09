/**
 * Como os toques aparecem no painel. "T2" é vocabulário do épico; quem opera
 * vê a posição da mensagem na sequência.
 */
const MENSAGEM_DO_TOQUE: Record<string, string> = { T2: "1ª mensagem", T3: "2ª mensagem", T4: "3ª mensagem" };

export function rotuloDoToque(toque: string | null, origem?: string | null): string {
  if (!toque) return "Resposta a uma conversa";
  if (toque === "T1") return origem === "ia" ? "Convite personalizado pela IA" : "Nota do convite";
  return `${MENSAGEM_DO_TOQUE[toque] ?? toque} da sequência`;
}

const FONTES: Record<string, string> = { csv: "planilha", apify: "Apify", unipile_busca: "busca no LinkedIn" };

export function rotuloDaFonte(fonte: string | null): string {
  return fonte ? (FONTES[fonte] ?? fonte) : "desconhecida";
}
