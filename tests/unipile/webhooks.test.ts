import { describe, expect, it } from "vitest";
import { idDoEvento, interpretarWebhookUnipile, segredoConfere } from "@/server/unipile/webhooks";
import { mensagemRecebida } from "../support/payloads-unipile";

describe("webhooks da Unipile", () => {
  it("interpreta mensagem recebida de um prospect", () => {
    const evento = interpretarWebhookUnipile(mensagemRecebida());
    expect(evento.fonte).toBe("messaging");
    expect(evento.dados).toMatchObject({
      accountId: "acc-arthur",
      chatId: "chat-1",
      messageId: "msg-1",
      remetenteProviderId: "ACoMaria",
      enviadaPelaConta: false,
    });
  });

  it("reconhece mensagem enviada pela própria conta (API, LinkedIn ou nota de convite)", () => {
    const evento = interpretarWebhookUnipile(
      mensagemRecebida({ sender: { attendee_provider_id: "ACoArthur", attendee_name: "Arthur" } }),
    );
    expect(evento.fonte === "messaging" && evento.dados.enviadaPelaConta).toBe(true);
    const comFlag = interpretarWebhookUnipile(mensagemRecebida({ is_sender: 1 }));
    expect(comFlag.fonte === "messaging" && comFlag.dados.enviadaPelaConta).toBe(true);
  });

  it("interpreta convite aceito e status da conta", () => {
    expect(
      interpretarWebhookUnipile({
        event: "new_relation",
        account_id: "acc",
        user_provider_id: "ACoMaria",
        user_full_name: "Maria Souza",
        user_public_identifier: "mariasouza",
      }),
    ).toMatchObject({ fonte: "users", dados: { providerId: "ACoMaria", publicIdentifier: "mariasouza" } });

    expect(
      interpretarWebhookUnipile({ AccountStatus: { account_id: "acc", account_type: "LINKEDIN", message: "CREDENTIALS" } }),
    ).toEqual({ fonte: "account_status", tipo: "CREDENTIALS", dados: { accountId: "acc", status: "CREDENTIALS" } });
  });

  it("não quebra com payload desconhecido", () => {
    expect(interpretarWebhookUnipile({ event: "message_reaction" }).fonte).toBe("desconhecido");
    expect(interpretarWebhookUnipile(null).fonte).toBe("desconhecido");
  });

  it("dá a mesma chave para a mesma mensagem e chaves distintas para status em janelas diferentes", () => {
    const corpo = mensagemRecebida();
    const evento = interpretarWebhookUnipile(corpo);
    const agora = new Date("2026-10-01T14:00:00Z");
    expect(idDoEvento(evento, JSON.stringify(corpo), agora)).toBe(
      idDoEvento(evento, JSON.stringify(corpo), new Date("2026-10-02T14:00:00Z")),
    );

    const status = interpretarWebhookUnipile({ AccountStatus: { account_id: "acc", message: "CREDENTIALS" } });
    const retentativa = idDoEvento(status, "", new Date("2026-10-01T14:05:00Z"));
    expect(idDoEvento(status, "", new Date("2026-10-01T14:10:00Z"))).toBe(retentativa);
    expect(idDoEvento(status, "", new Date("2026-10-01T18:00:00Z"))).not.toBe(retentativa);
  });

  it("confere o segredo em tempo constante", () => {
    expect(segredoConfere("segredo-com-16-chars", "segredo-com-16-chars")).toBe(true);
    expect(segredoConfere("errado", "segredo-com-16-chars")).toBe(false);
    expect(segredoConfere(null, "segredo-com-16-chars")).toBe(false);
  });
});
