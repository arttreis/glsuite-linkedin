/** Erro da API da Unipile no formato `{ status, type, title, detail }`. */
export class ErroUnipile extends Error {
  readonly status: number;
  /** `type` da Unipile sem o prefixo `errors/` (ex.: `cannot_resend_yet`), ou `rede`. */
  readonly tipo: string;
  readonly detalhe: string | null;

  constructor(dados: { status: number; tipo: string; titulo: string; detalhe?: string | null }) {
    super(`Unipile ${dados.status} ${dados.tipo}: ${dados.titulo}`);
    this.name = "ErroUnipile";
    this.status = dados.status;
    this.tipo = dados.tipo;
    this.detalhe = dados.detalhe ?? null;
  }

  static deResposta(status: number, corpo: unknown, texto: string): ErroUnipile {
    const dados = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
    const tipoBruto = typeof dados.type === "string" ? dados.type : `http_${status}`;
    return new ErroUnipile({
      status,
      tipo: tipoBruto.replace(/^errors\//, ""),
      titulo: typeof dados.title === "string" ? dados.title : texto.slice(0, 200) || "sem corpo",
      detalhe: typeof dados.detail === "string" ? dados.detail : null,
    });
  }
}

export type ClasseDeErro = "limite" | "conta" | "transitorio" | "permanente";

const TIPOS_LIMITE = new Set([
  "cannot_resend_yet",
  "cannot_resend_within_24hrs",
  "limit_exceeded",
  "connection_limit_reached",
  "too_many_requests",
]);

const TIPOS_CONTA = new Set([
  "disconnected_account",
  "checkpoint_error",
  "multiple_sessions",
  "account_restricted",
  "action_required",
  "unknown_authentication_context",
  "subscription_required",
  "feature_not_subscribed",
  "invalid_account",
]);

/**
 * A Unipile não reconhece a chave da API (`missing_credentials`): vale para
 * todas as contas e reconectar não resolve. Com a chave morta, endpoint com
 * `account_id` pode devolver `invalid_credentials`, igual a conta desconectada.
 */
export function chaveRecusada(erro: unknown): boolean {
  return erro instanceof ErroUnipile && erro.tipo === "missing_credentials";
}

/** Para quem vê a recusa da chave na tela. */
export const PECA_A_CHAVE = "Não é a conta do LinkedIn: peça ao admin para trocar a chave da API da Unipile.";

/**
 * Como o despachante reage (§5.1 e §4.4):
 * - limite: conta para a parada automática e reagenda;
 * - conta: desconexão, checkpoint ou restrição, pausa o perfil na hora;
 * - transitorio: nova tentativa com backoff;
 * - permanente: a ação falha e o lead vai para revisão.
 */
export function classificarErro(erro: unknown): ClasseDeErro {
  if (!(erro instanceof ErroUnipile)) return "transitorio";
  if (erro.status === 429 || TIPOS_LIMITE.has(erro.tipo)) return "limite";
  if (TIPOS_CONTA.has(erro.tipo) || erro.status === 401) return "conta";
  if (erro.status === 0 || erro.status === 408 || erro.status >= 500) return "transitorio";
  return "permanente";
}
