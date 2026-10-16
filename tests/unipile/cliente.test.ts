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

describe("busca de pessoas na Unipile (§4.11)", () => {
  const filtros = {
    palavrasChave: "varejo",
    cargo: "Head de e-commerce",
    empresa: "",
    locais: [{ id: "105871508", titulo: "São Paulo" }],
    setores: [{ id: "27", titulo: "Varejo" }],
    graus: [2, 3] as (1 | 2 | 3)[],
    idiomas: ["pt" as const],
  };

  it("monta a busca clássica só com os filtros preenchidos e manda o cursor na query", async () => {
    const { cliente, requisicoes } = clienteComFetch([
      { status: 200, corpo: { items: [], cursor: "c2" } },
      { status: 200, corpo: { items: [] } },
    ]);
    expect((await cliente.buscarPessoas("acc", { filtros })).cursor).toBe("c2");
    await cliente.buscarPessoas("acc", { filtros }, "c2");

    const [primeira, segunda] = requisicoes;
    expect(primeira!.url.pathname).toBe("/api/v1/linkedin/search");
    expect(primeira!.url.searchParams.get("account_id")).toBe("acc");
    expect(primeira!.url.searchParams.has("cursor")).toBe(false);
    expect(JSON.parse(String(primeira!.corpo))).toEqual({
      api: "classic",
      category: "people",
      keywords: "varejo",
      advanced_keywords: { title: "Head de e-commerce" },
      location: ["105871508"],
      industry: ["27"],
      network_distance: [2, 3],
      profile_language: ["pt"],
    });
    expect(segunda!.url.searchParams.get("cursor")).toBe("c2");
    expect(JSON.parse(String(segunda!.corpo))).toEqual(JSON.parse(String(primeira!.corpo)));
  });

  it("busca pela URL colada e lê distância e convite pendente de cada pessoa", async () => {
    const { cliente, requisicoes } = clienteComFetch([
      {
        status: 200,
        corpo: {
          items: [
            {
              type: "PEOPLE",
              id: "ACoAna",
              name: "Ana Lima",
              headline: "CMO na Loja",
              network_distance: "DISTANCE_1",
              pending_invitation: true,
              current_positions: [{ company: "Loja", role: "CMO" }],
            },
            { type: "PEOPLE", id: "ACoBia", name: "Bia", network_distance: "OUT_OF_NETWORK" },
            { type: "COMPANY", id: "123", name: "Empresa" },
          ],
        },
      },
    ]);
    const url = "https://www.linkedin.com/search/results/people/?keywords=cmo";
    const { itens } = await cliente.buscarPessoas("acc", { url });

    expect(JSON.parse(String(requisicoes[0]!.corpo))).toEqual({ url });
    expect(itens).toEqual([
      expect.objectContaining({ providerId: "ACoAna", distancia: "FIRST_DEGREE", convitePendente: true, cargoAtual: "CMO" }),
      expect.objectContaining({ providerId: "ACoBia", distancia: "OUT_OF_NETWORK", convitePendente: false }),
    ]);
  });

  it("traduz texto em id de local ou setor", async () => {
    const { cliente, requisicoes } = clienteComFetch([
      {
        status: 200,
        corpo: {
          object: "LinkedinSearchParametersList",
          items: [
            { object: "LinkedinSearchParameter", id: "105871508", title: "São Paulo, Brasil" },
            { object: "LinkedinSearchParameter", id: "", title: "sem id" },
          ],
        },
      },
    ]);
    expect(await cliente.buscarParametros("acc", "LOCATION", "são paulo")).toEqual([
      { id: "105871508", titulo: "São Paulo, Brasil" },
    ]);
    const req = requisicoes[0]!;
    expect(req.metodo).toBe("GET");
    expect(req.url.pathname).toBe("/api/v1/linkedin/search/parameters");
    expect(Object.fromEntries(req.url.searchParams)).toEqual({
      account_id: "acc",
      type: "LOCATION",
      keywords: "são paulo",
      limit: "8",
    });
  });
});
