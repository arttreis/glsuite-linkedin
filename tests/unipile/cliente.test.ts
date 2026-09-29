import { describe, expect, it } from "vitest";
import { criarClienteUnipile } from "@/server/unipile/cliente";
import { classificarErro, ErroUnipile } from "@/server/unipile/erros";

type Requisicao = { url: URL; metodo: string; headers: Record<string, string>; corpo: unknown };

function clienteComFetch(respostas: Array<{ status: number; corpo?: unknown }>) {
  const requisicoes: Requisicao[] = [];
  const fetchFalso = (async (entrada: URL | RequestInfo, init?: RequestInit) => {
    requisicoes.push({
      url: new URL(String(entrada)),
      metodo: init?.method ?? "GET",
      headers: init?.headers as Record<string, string>,
      corpo: init?.body,
    });
    const resposta = respostas.shift() ?? { status: 200, corpo: {} };
    return new Response(resposta.corpo === undefined ? "" : JSON.stringify(resposta.corpo), { status: resposta.status });
  }) as typeof fetch;
  const cliente = criarClienteUnipile({ dsn: "api8.unipile.com:13851", apiKey: "chave-secreta", fetch: fetchFalso });
  return { cliente, requisicoes };
}

describe("cliente da Unipile", () => {
  it("envia convite em JSON com a chave no header X-API-KEY", async () => {
    const { cliente, requisicoes } = clienteComFetch([
      { status: 200, corpo: { object: "UserInvitationSent", invitation_id: "inv-1" } },
    ]);
    const resposta = await cliente.enviarConvite({ accountId: "acc", providerId: "ACo1", mensagem: "Oi Ana" });

    expect(resposta).toEqual({ invitationId: "inv-1" });
    const [req] = requisicoes;
    expect(req!.url.toString()).toBe("https://api8.unipile.com:13851/api/v1/users/invite");
    expect(req!.metodo).toBe("POST");
    expect(req!.headers["X-API-KEY"]).toBe("chave-secreta");
    expect(JSON.parse(String(req!.corpo))).toEqual({ provider_id: "ACo1", account_id: "acc", message: "Oi Ana" });
  });

  it("inicia conversa em multipart com attendees_ids", async () => {
    const { cliente, requisicoes } = clienteComFetch([
      { status: 201, corpo: { object: "ChatStarted", chat_id: "chat-1", message_id: "m-1" } },
    ]);
    expect(await cliente.iniciarConversa({ accountId: "acc", providerId: "ACo1", texto: "Olá" })).toEqual({
      chatId: "chat-1",
      messageId: "m-1",
    });
    const form = requisicoes[0]!.corpo as FormData;
    expect(form.get("attendees_ids")).toBe("ACo1");
    expect(form.get("text")).toBe("Olá");
    expect(form.get("account_id")).toBe("acc");
  });

  it("gera link de reconexão sem providers e com a conta a reconectar", async () => {
    const { cliente, requisicoes } = clienteComFetch([{ status: 201, corpo: { object: "HostedAuthUrl", url: "https://x" } }]);
    await cliente.gerarLinkDeConexao({
      tipo: "reconnect",
      contaParaReconectar: "acc",
      nome: "perfil-1",
      notifyUrl: "https://app/api/unipile/conta",
      sucessoUrl: "https://app/ok",
      falhaUrl: "https://app/falha",
      expiraEm: new Date("2026-09-29T12:00:00Z"),
    });
    const corpo = JSON.parse(String(requisicoes[0]!.corpo));
    expect(corpo).toMatchObject({
      type: "reconnect",
      reconnect_account: "acc",
      api_url: "https://api8.unipile.com:13851",
      expiresOn: "2026-09-29T12:00:00.000Z",
      name: "perfil-1",
    });
    expect(corpo.providers).toBeUndefined();
  });

  it("converte o erro da Unipile em ErroUnipile com o tipo sem prefixo", async () => {
    const { cliente } = clienteComFetch([
      { status: 422, corpo: { status: 422, type: "errors/cannot_resend_yet", title: "Cannot resend yet" } },
    ]);
    const erro = await cliente.enviarConvite({ accountId: "acc", providerId: "ACo1" }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroUnipile);
    expect(erro).toMatchObject({ status: 422, tipo: "cannot_resend_yet" });
    expect(classificarErro(erro)).toBe("limite");
  });

  it("marca falha de rede como transitória", async () => {
    const cliente = criarClienteUnipile({
      dsn: "api8.unipile.com:13851",
      apiKey: "x",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    const erro = await cliente.obterConta("acc").catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 0, tipo: "rede" });
    expect(classificarErro(erro)).toBe("transitorio");
  });

  it.each([
    [429, "too_many_requests", "limite"],
    [422, "limit_exceeded", "limite"],
    [401, "disconnected_account", "conta"],
    [401, "checkpoint_error", "conta"],
    [403, "account_restricted", "conta"],
    [500, "provider_error", "transitorio"],
    [503, "http_503", "transitorio"],
    [422, "already_connected", "permanente"],
    [422, "invalid_recipient", "permanente"],
    [400, "too_many_characters", "permanente"],
  ])("classifica %i %s como %s", (status, tipo, classe) => {
    expect(classificarErro(new ErroUnipile({ status, tipo, titulo: "x" }))).toBe(classe);
  });
});
