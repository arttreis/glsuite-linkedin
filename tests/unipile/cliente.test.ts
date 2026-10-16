import { afterEach, describe, expect, it, vi } from "vitest";
import { corpoDaBuscaClassica, criarClienteUnipile } from "@/server/unipile/cliente";
import { classificarErro, ErroUnipile, mensagemDaRecusa, PECA_A_CHAVE } from "@/server/unipile/erros";

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

describe("busca clássica com empresas (SDR-59)", () => {
  it("páginas de empresa vão em `company`; o nome de empresa sem página, em `advanced_keywords.company` junto com o cargo", () => {
    expect(corpoDaBuscaClassica({ cargo: '"CEO"', regioes: [], empresas: ["1035", "2041"] })).toEqual({
      api: "classic",
      category: "people",
      advanced_keywords: { title: '"CEO"' },
      company: ["1035", "2041"],
    });
    expect(corpoDaBuscaClassica({ cargo: '"CEO"', empresa: " Acme Administração Judicial " })).toEqual({
      api: "classic",
      category: "people",
      advanced_keywords: { title: '"CEO"', company: "Acme Administração Judicial" },
    });
  });

  it("sem empresa, o corpo é o de sempre", () => {
    expect(corpoDaBuscaClassica({ cargo: '"CEO"', palavras: "", regioes: ["106057199"], setores: [], empresas: [] })).toEqual({
      api: "classic",
      category: "people",
      advanced_keywords: { title: '"CEO"' },
      location: ["106057199"],
    });
  });

  it("consulta empresa no LinkedIn com type=COMPANY", async () => {
    const { cliente, requisicoes } = clienteComFetch([
      { status: 200, corpo: { items: [{ object: "LinkedinSearchParameter", id: "1035", title: "Acme" }] } },
    ]);
    expect(await cliente.listarParametrosDeBusca("acc", "COMPANY", "Acme")).toEqual([{ id: "1035", nome: "Acme" }]);
    expect(requisicoes[0]!.url.pathname).toBe("/api/v1/linkedin/search/parameters");
    expect(requisicoes[0]!.url.searchParams.get("type")).toBe("COMPANY");
    expect(requisicoes[0]!.url.searchParams.get("keywords")).toBe("Acme");
  });
});

describe("recusa da Unipile no log (SDR-122)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("401 missing_credentials lança ErroUnipile e deixa uma linha com status, tipo, método e caminho", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cliente } = clienteComFetch([
      { status: 401, corpo: { status: 401, type: "errors/missing_credentials", title: "Missing credentials" } },
    ]);
    const erro = await cliente.listarWebhooks().catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroUnipile);
    expect(erro).toMatchObject({ status: 401, tipo: "missing_credentials" });
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith("Unipile 401 missing_credentials GET /webhooks");
  });

  it("o log não leva a chave nem a query string", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cliente } = clienteComFetch([{ status: 401, corpo: { type: "errors/invalid_credentials", title: "Invalid" } }]);
    await cliente.listarConvitesEnviados("acc-secreta").catch(() => {});

    const linha = aviso.mock.calls.flat().map(String).join(" ");
    expect(linha).toBe("Unipile 401 invalid_credentials GET /users/invite/sent");
    expect(linha).not.toContain("chave-secreta");
    expect(linha).not.toContain("acc-secreta");
  });

  it("falha de rede deixa a linha com status 0 e tipo rede", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cliente = criarClienteUnipile({
      dsn: "api8.unipile.com:13851",
      apiKey: "chave-secreta",
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    const erro = await cliente.obterConta("acc").catch((e: unknown) => e);

    expect(erro).toMatchObject({ status: 0, tipo: "rede" });
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith("Unipile 0 rede GET /accounts/acc");
  });

  it("resposta 2xx não deixa log", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { cliente } = clienteComFetch([{ status: 200, corpo: { items: [] } }]);
    expect(await cliente.listarWebhooks()).toEqual([]);
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("mensagem da recusa nos botões da Administração (SDR-122)", () => {
  it("chave recusada aponta a chave da API, não a conta", () => {
    expect(mensagemDaRecusa(new ErroUnipile({ status: 401, tipo: "missing_credentials", titulo: "Missing credentials" }))).toBe(
      `A Unipile recusou a chave da API (Unipile 401 missing_credentials: Missing credentials). ${PECA_A_CHAVE}`,
    );
  });

  it("Unipile fora pede para tentar de novo", () => {
    expect(mensagemDaRecusa(new ErroUnipile({ status: 503, tipo: "http_503", titulo: "Service Unavailable" }))).toBe(
      "A Unipile não respondeu (Unipile 503 http_503: Service Unavailable). Tente de novo em instantes.",
    );
    expect(mensagemDaRecusa(new ErroUnipile({ status: 0, tipo: "rede", titulo: "fetch failed" }))).toBe(
      "A Unipile não respondeu (Unipile 0 rede: fetch failed). Tente de novo em instantes.",
    );
  });

  it("erro que não é da Unipile sobe", () => {
    expect(() => mensagemDaRecusa(new Error("Perfil não encontrado"))).toThrow("Perfil não encontrado");
  });
});
