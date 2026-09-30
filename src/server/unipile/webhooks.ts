import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Formatos em docs/pesquisa/unipile.md, seção Webhooks.

export type MensagemRecebida = {
  accountId: string;
  chatId: string;
  messageId: string;
  texto: string;
  em: string | null;
  remetenteProviderId: string | null;
  remetenteNome: string | null;
  /** A própria conta enviou (pela API, pelo LinkedIn ou a nota de um convite aceito). */
  enviadaPelaConta: boolean;
  participantes: { providerId: string; nome: string | null }[];
};

export type NovaRelacao = {
  accountId: string;
  providerId: string;
  publicIdentifier: string | null;
  nome: string | null;
  urlPerfil: string | null;
};

export type StatusDaConta = { accountId: string; status: string };

export type EventoUnipile =
  | { fonte: "messaging"; tipo: string; dados: MensagemRecebida }
  | { fonte: "users"; tipo: "new_relation"; dados: NovaRelacao }
  | { fonte: "account_status"; tipo: string; dados: StatusDaConta }
  | { fonte: "desconhecido"; tipo: string; dados: null };

const participante = z
  .object({ attendee_provider_id: z.string().nullish(), attendee_name: z.string().nullish() })
  .partial();

const esquemaMensagem = z.object({
  event: z.string(),
  account_id: z.string(),
  chat_id: z.string(),
  message_id: z.string(),
  message: z.string().nullish(),
  timestamp: z.string().nullish(),
  is_sender: z.union([z.boolean(), z.number()]).nullish(),
  account_info: z.object({ user_id: z.string().nullish() }).partial().nullish(),
  sender: participante.nullish(),
  attendees: z.array(participante).nullish(),
});

const esquemaNovaRelacao = z.object({
  event: z.literal("new_relation"),
  account_id: z.string(),
  user_provider_id: z.string(),
  user_public_identifier: z.string().nullish(),
  user_full_name: z.string().nullish(),
  user_profile_url: z.string().nullish(),
});

const esquemaStatus = z.object({
  AccountStatus: z.object({ account_id: z.string(), message: z.string() }),
});

export function interpretarWebhookUnipile(corpo: unknown): EventoUnipile {
  const dados = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;

  if ("AccountStatus" in dados) {
    const status = esquemaStatus.safeParse(dados);
    if (status.success) {
      const { account_id, message } = status.data.AccountStatus;
      return { fonte: "account_status", tipo: message, dados: { accountId: account_id, status: message } };
    }
  }

  if (dados.event === "new_relation") {
    const relacao = esquemaNovaRelacao.safeParse(dados);
    if (relacao.success) {
      const r = relacao.data;
      return {
        fonte: "users",
        tipo: "new_relation",
        dados: {
          accountId: r.account_id,
          providerId: r.user_provider_id,
          publicIdentifier: r.user_public_identifier ?? null,
          nome: r.user_full_name ?? null,
          urlPerfil: r.user_profile_url ?? null,
        },
      };
    }
  }

  if (typeof dados.event === "string" && dados.event.startsWith("message_")) {
    const mensagem = esquemaMensagem.safeParse(dados);
    if (mensagem.success) {
      const m = mensagem.data;
      const remetente = m.sender?.attendee_provider_id ?? null;
      const conta = m.account_info?.user_id ?? null;
      return {
        fonte: "messaging",
        tipo: m.event,
        dados: {
          accountId: m.account_id,
          chatId: m.chat_id,
          messageId: m.message_id,
          texto: m.message ?? "",
          em: m.timestamp ?? null,
          remetenteProviderId: remetente,
          remetenteNome: m.sender?.attendee_name ?? null,
          enviadaPelaConta: m.is_sender === true || m.is_sender === 1 || (remetente !== null && remetente === conta),
          participantes: (m.attendees ?? [])
            .filter((p) => p.attendee_provider_id)
            .map((p) => ({ providerId: p.attendee_provider_id as string, nome: p.attendee_name ?? null })),
        },
      };
    }
  }

  return { fonte: "desconhecido", tipo: typeof dados.event === "string" ? dados.event : "desconhecido", dados: null };
}

const hash = (valor: string) => createHash("sha256").update(valor).digest("hex");

/**
 * Chave de idempotência do webhook. Mensagem e relação têm id natural. Status de
 * conta não tem: a chave usa uma janela de 30 min, que cobre as retentativas da
 * Unipile sem engolir uma desconexão real que volte a acontecer mais tarde.
 */
export function idDoEvento(evento: EventoUnipile, corpoBruto: string, recebidoEm: Date): string {
  switch (evento.fonte) {
    case "messaging":
      return `messaging:${evento.tipo}:${evento.dados.messageId}`;
    case "users":
      return `users:new_relation:${evento.dados.accountId}:${evento.dados.providerId}`;
    case "account_status": {
      const janela = Math.floor(recebidoEm.getTime() / (30 * 60_000));
      return `account_status:${evento.dados.accountId}:${evento.dados.status}:${janela}`;
    }
    default:
      return `desconhecido:${hash(corpoBruto)}`;
  }
}

/** Compara segredos em tempo constante, sem vazar o tamanho. */
export function segredoConfere(recebido: string | null | undefined, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  return timingSafeEqual(Buffer.from(hash(recebido)), Buffer.from(hash(esperado)));
}
