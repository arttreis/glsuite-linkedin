/**
 * Status da conta na Unipile que pausam o perfil (§4.4). Com qualquer status
 * diferente de OK a Unipile para de mandar os webhooks de mensagem, e seguir a
 * régua sem ver as respostas é o erro mais caro do sistema.
 */
const MOTIVOS_DE_PAUSA: Record<string, string> = {
  CREDENTIALS: "Conta desconectada na Unipile (CREDENTIALS). Reconecte pelo painel.",
  ERROR: "A sincronização da conta parou na Unipile (ERROR).",
  STOPPED: "A sincronização da conta parou na Unipile (STOPPED).",
  PERMISSIONS: "A conta perdeu permissões na Unipile (PERMISSIONS).",
  DELETED: "A conta foi removida da Unipile.",
  CREATION_FAIL: "A conexão da conta falhou na Unipile.",
};

/** Status em que o despachante pode enviar. `CONNECTING` segura os envios sem pausar. */
export const STATUS_SAUDAVEIS = new Set(["OK", "RECONNECTED", "SYNC_SUCCESS", "CREATION_SUCCESS"]);

export function motivoDePausaDoStatus(status: string): string | null {
  return MOTIVOS_DE_PAUSA[status] ?? null;
}

/** O status mais grave entre as fontes da conta. */
export function statusMaisGrave(status: string[]): string {
  return (
    status.find((s) => MOTIVOS_DE_PAUSA[s]) ??
    status.find((s) => !STATUS_SAUDAVEIS.has(s)) ??
    status[0] ??
    "OK"
  );
}
