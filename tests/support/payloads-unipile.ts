/** Payloads de webhook no formato da Unipile V1 (docs/pesquisa/unipile.md). */
export const mensagemRecebida = (sobrescrever: Record<string, unknown> = {}) => ({
  account_id: "acc-arthur",
  account_type: "LINKEDIN",
  account_info: { type: "LINKEDIN", feature: "classic", user_id: "ACoArthur" },
  event: "message_received",
  chat_id: "chat-1",
  timestamp: "2026-10-01T13:49:07.965Z",
  message_id: "msg-1",
  message: "Oi, tudo bem? Pode falar.",
  sender: { attendee_id: "att-1", attendee_name: "Maria Souza", attendee_provider_id: "ACoMaria" },
  attendees: [{ attendee_id: "att-1", attendee_name: "Maria Souza", attendee_provider_id: "ACoMaria" }],
  ...sobrescrever,
});

export const novaRelacao = (sobrescrever: Record<string, unknown> = {}) => ({
  event: "new_relation",
  account_id: "acc-arthur",
  account_type: "LINKEDIN",
  webhook_name: "guessless-sdr users",
  user_full_name: "Maria Souza",
  user_provider_id: "ACoMaria",
  user_public_identifier: "mariasouza",
  user_profile_url: "https://www.linkedin.com/in/mariasouza/",
  ...sobrescrever,
});

export const statusDaConta = (accountId: string, message: string) => ({
  AccountStatus: { account_id: accountId, account_type: "LINKEDIN", message },
});
