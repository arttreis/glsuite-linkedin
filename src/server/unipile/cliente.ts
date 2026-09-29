import { ErroUnipile } from "./erros";

// Referência dos endpoints: docs/pesquisa/unipile.md

export type DistanciaDeRede = "FIRST_DEGREE" | "SECOND_DEGREE" | "THIRD_DEGREE" | "OUT_OF_NETWORK";

export type ContaUnipile = {
  id: string;
  tipo: string;
  nome: string | null;
  /** Status de cada fonte da conta (`OK`, `CREDENTIALS`, `ERROR`...). */
  status: string[];
};

export type DonoDaConta = {
  providerId: string;
  nome: string;
  publicIdentifier: string | null;
  premium: boolean;
  salesNavigator: boolean;
};

export type ExperienciaLinkedIn = {
  empresa: string | null;
  empresaId: string | null;
  cargo: string | null;
  atual: boolean;
};

export type PerfilLinkedIn = {
  providerId: string;
  publicIdentifier: string | null;
  primeiroNome: string | null;
  sobrenome: string | null;
  titulo: string | null;
  localizacao: string | null;
  resumo: string | null;
  distancia: DistanciaDeRede | null;
  ehConexao: boolean;
  urlPublica: string | null;
  experiencia: ExperienciaLinkedIn[];
};

export type PostLinkedIn = { id: string; texto: string; data: string | null };

export type MensagemDaConversa = {
  id: string;
  texto: string;
  enviadaPelaConta: boolean;
  remetenteProviderId: string | null;
  em: string;
};

export type ConversaUnipile = { id: string; attendeeProviderId: string | null };

export type ResultadoDeBusca = {
  providerId: string;
  nome: string | null;
  primeiroNome: string | null;
  sobrenome: string | null;
  titulo: string | null;
  localizacao: string | null;
  publicIdentifier: string | null;
  urlPublica: string | null;
  empresaAtual: string | null;
  cargoAtual: string | null;
};

export type ConviteEnviado = { id: string; providerId: string | null; data: string | null };

export type WebhookUnipile = { id: string; url: string; fonte: string };

export type LinkDeConexao = {
  tipo: "create" | "reconnect";
  nome: string;
  notifyUrl: string;
  sucessoUrl: string;
  falhaUrl: string;
  expiraEm: Date;
  contaParaReconectar?: string;
};

/** O que o SDR precisa da Unipile. Os testes usam uma implementação falsa. */
export interface ClienteUnipile {
  gerarLinkDeConexao(link: LinkDeConexao): Promise<string>;
  obterConta(accountId: string): Promise<ContaUnipile>;
  obterDonoDaConta(accountId: string): Promise<DonoDaConta>;
  enviarConvite(p: { accountId: string; providerId: string; mensagem?: string }): Promise<{ invitationId: string }>;
  listarConvitesEnviados(accountId: string, cursor?: string): Promise<{ itens: ConviteEnviado[]; cursor: string | null }>;
  cancelarConvite(accountId: string, invitationId: string): Promise<void>;
  obterPerfil(accountId: string, identificador: string, opcoes?: { completo?: boolean }): Promise<PerfilLinkedIn>;
  listarPosts(accountId: string, providerId: string, limite?: number): Promise<PostLinkedIn[]>;
  iniciarConversa(p: { accountId: string; providerId: string; texto: string }): Promise<{ chatId: string | null; messageId: string | null }>;
  enviarMensagem(p: { accountId: string; chatId: string; texto: string }): Promise<{ messageId: string | null }>;
  listarMensagens(chatId: string, limite?: number): Promise<MensagemDaConversa[]>;
  listarConversasComPessoa(accountId: string, providerId: string): Promise<ConversaUnipile[]>;
  buscarPessoas(
    accountId: string,
    busca: { url: string } | { keywords: string; api?: "classic" | "sales_navigator" },
    cursor?: string,
  ): Promise<{ itens: ResultadoDeBusca[]; cursor: string | null }>;
  criarWebhook(p: { url: string; fonte: "messaging" | "users" | "account_status"; nome: string; headers: Record<string, string>; eventos?: string[] }): Promise<string>;
  listarWebhooks(): Promise<WebhookUnipile[]>;
}

type ConfigCliente = {
  /** `apiX.unipile.com:PORTA`, como aparece no dashboard. */
  dsn: string;
  apiKey: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Query = Record<string, string | number | boolean | undefined>;
type Json = Record<string, unknown>;

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.length > 0 ? valor : null);

export function criarClienteUnipile(config: ConfigCliente): ClienteUnipile {
  const host = config.dsn.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const base = `https://${host}/api/v1`;
  const executar = config.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 25_000;

  async function chamar<T = Json>(
    metodo: "GET" | "POST" | "DELETE" | "PATCH",
    caminho: string,
    opcoes: { query?: Query; json?: unknown; form?: FormData } = {},
  ): Promise<T> {
    const url = new URL(base + caminho);
    for (const [chave, valor] of Object.entries(opcoes.query ?? {})) {
      if (valor !== undefined) url.searchParams.set(chave, String(valor));
    }
    const headers: Record<string, string> = { "X-API-KEY": config.apiKey, accept: "application/json" };
    let body: BodyInit | undefined;
    if (opcoes.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opcoes.json);
    } else if (opcoes.form) {
      body = opcoes.form;
    }

    let resposta: Response;
    try {
      resposta = await executar(url, { method: metodo, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch (erro) {
      throw new ErroUnipile({ status: 0, tipo: "rede", titulo: (erro as Error).message });
    }

    const corpoTexto = await resposta.text();
    let corpo: unknown;
    try {
      corpo = corpoTexto ? JSON.parse(corpoTexto) : undefined;
    } catch {
      corpo = undefined;
    }
    if (!resposta.ok) throw ErroUnipile.deResposta(resposta.status, corpo, corpoTexto);
    return (corpo ?? {}) as T;
  }

  const paraPerfil = (dados: Json): PerfilLinkedIn => {
    const experiencia = Array.isArray(dados.work_experience) ? (dados.work_experience as Json[]) : [];
    return {
      providerId: String(dados.provider_id),
      publicIdentifier: texto(dados.public_identifier),
      primeiroNome: texto(dados.first_name),
      sobrenome: texto(dados.last_name),
      titulo: texto(dados.headline),
      localizacao: texto(dados.location),
      resumo: texto(dados.summary),
      distancia: (texto(dados.network_distance) as DistanciaDeRede | null) ?? null,
      ehConexao: dados.is_relationship === true || dados.network_distance === "FIRST_DEGREE",
      urlPublica: texto(dados.public_profile_url),
      experiencia: experiencia.map((item) => ({
        empresa: texto(item.company),
        empresaId: texto(item.company_id),
        cargo: texto(item.position),
        atual: item.current === true || item.end === null || item.end === undefined,
      })),
    };
  };

  return {
    async gerarLinkDeConexao(link) {
      const resposta = await chamar<{ url: string }>("POST", "/hosted/accounts/link", {
        json: {
          type: link.tipo,
          ...(link.tipo === "create" ? { providers: ["LINKEDIN"] } : { reconnect_account: link.contaParaReconectar }),
          api_url: `https://${host}`,
          expiresOn: link.expiraEm.toISOString(),
          name: link.nome,
          notify_url: link.notifyUrl,
          success_redirect_url: link.sucessoUrl,
          failure_redirect_url: link.falhaUrl,
        },
      });
      return resposta.url;
    },

    async obterConta(accountId) {
      const dados = await chamar<Json>("GET", `/accounts/${encodeURIComponent(accountId)}`);
      const fontes = Array.isArray(dados.sources) ? (dados.sources as Json[]) : [];
      return {
        id: String(dados.id),
        tipo: String(dados.type),
        nome: texto(dados.name),
        status: fontes.map((fonte) => String(fonte.status)),
      };
    },

    async obterDonoDaConta(accountId) {
      const dados = await chamar<Json>("GET", "/users/me", { query: { account_id: accountId } });
      const salesNavigator = dados.sales_navigator as Json | null | undefined;
      return {
        providerId: String(dados.provider_id),
        nome: [dados.first_name, dados.last_name].filter(Boolean).join(" "),
        publicIdentifier: texto(dados.public_identifier),
        premium: dados.premium === true,
        salesNavigator: Boolean(salesNavigator && !("error" in salesNavigator)),
      };
    },

    async enviarConvite({ accountId, providerId, mensagem }) {
      const dados = await chamar<Json>("POST", "/users/invite", {
        json: { provider_id: providerId, account_id: accountId, ...(mensagem ? { message: mensagem } : {}) },
      });
      return { invitationId: String(dados.invitation_id) };
    },

    async listarConvitesEnviados(accountId, cursor) {
      const dados = await chamar<Json>("GET", "/users/invite/sent", {
        query: { account_id: accountId, limit: 100, cursor },
      });
      const itens = Array.isArray(dados.items) ? (dados.items as Json[]) : [];
      return {
        itens: itens.map((item) => ({
          id: String(item.id),
          providerId: texto(item.invited_user_id),
          data: texto(item.parsed_datetime) ?? texto(item.date),
        })),
        cursor: texto(dados.cursor),
      };
    },

    async cancelarConvite(accountId, invitationId) {
      await chamar("DELETE", `/users/invite/sent/${encodeURIComponent(invitationId)}`, {
        query: { account_id: accountId },
      });
    },

    async obterPerfil(accountId, identificador, opcoes) {
      const dados = await chamar<Json>("GET", `/users/${encodeURIComponent(identificador)}`, {
        query: { account_id: accountId, linkedin_sections: opcoes?.completo ? "*" : undefined },
      });
      return paraPerfil(dados);
    },

    async listarPosts(accountId, providerId, limite = 5) {
      const dados = await chamar<Json>("GET", `/users/${encodeURIComponent(providerId)}/posts`, {
        query: { account_id: accountId, limit: limite },
      });
      const itens = Array.isArray(dados.items) ? (dados.items as Json[]) : [];
      return itens.map((item) => ({
        id: String(item.id),
        texto: texto(item.text) ?? "",
        data: texto(item.parsed_datetime) ?? texto(item.date),
      }));
    },

    async iniciarConversa({ accountId, providerId, texto: mensagem }) {
      const form = new FormData();
      form.append("account_id", accountId);
      form.append("attendees_ids", providerId);
      form.append("text", mensagem);
      const dados = await chamar<Json>("POST", "/chats", { form });
      return { chatId: texto(dados.chat_id), messageId: texto(dados.message_id) };
    },

    async enviarMensagem({ accountId, chatId, texto: mensagem }) {
      const form = new FormData();
      form.append("account_id", accountId);
      form.append("text", mensagem);
      const dados = await chamar<Json>("POST", `/chats/${encodeURIComponent(chatId)}/messages`, { form });
      return { messageId: texto(dados.message_id) };
    },

    async listarMensagens(chatId, limite = 20) {
      const dados = await chamar<Json>("GET", `/chats/${encodeURIComponent(chatId)}/messages`, {
        query: { limit: limite },
      });
      const itens = Array.isArray(dados.items) ? (dados.items as Json[]) : [];
      return itens.map((item) => ({
        id: String(item.id),
        texto: texto(item.text) ?? "",
        enviadaPelaConta: item.is_sender === 1 || item.is_sender === true,
        remetenteProviderId: texto(item.sender_id),
        em: texto(item.timestamp) ?? new Date(0).toISOString(),
      }));
    },

    async listarConversasComPessoa(accountId, providerId) {
      const dados = await chamar<Json>("GET", `/chat_attendees/${encodeURIComponent(providerId)}/chats`, {
        query: { account_id: accountId },
      });
      const itens = Array.isArray(dados.items) ? (dados.items as Json[]) : [];
      return itens.map((item) => ({ id: String(item.id), attendeeProviderId: texto(item.attendee_provider_id) }));
    },

    async buscarPessoas(accountId, busca, cursor) {
      const corpo = cursor
        ? { cursor }
        : "url" in busca
          ? { url: busca.url }
          : { api: busca.api ?? "classic", category: "people", keywords: busca.keywords };
      const dados = await chamar<Json>("POST", "/linkedin/search", { query: { account_id: accountId }, json: corpo });
      const itens = Array.isArray(dados.items) ? (dados.items as Json[]) : [];
      return {
        itens: itens
          .filter((item) => item.type === undefined || item.type === "PEOPLE")
          .map((item) => {
            const posicao = Array.isArray(item.current_positions) ? (item.current_positions as Json[])[0] : undefined;
            return {
              providerId: String(item.id),
              nome: texto(item.name),
              primeiroNome: texto(item.first_name),
              sobrenome: texto(item.last_name),
              titulo: texto(item.headline),
              localizacao: texto(item.location),
              publicIdentifier: texto(item.public_identifier),
              urlPublica: texto(item.public_profile_url) ?? texto(item.profile_url),
              empresaAtual: posicao ? texto(posicao.company) : null,
              cargoAtual: posicao ? texto(posicao.role) : null,
            };
          }),
        cursor: texto(dados.cursor),
      };
    },

    async criarWebhook({ url, fonte, nome, headers, eventos }) {
      const dados = await chamar<Json>("POST", "/webhooks", {
        json: {
          request_url: url,
          source: fonte,
          name: nome,
          format: "json",
          headers: Object.entries(headers).map(([key, value]) => ({ key, value })),
          ...(eventos ? { events: eventos } : {}),
        },
      });
      return String(dados.webhook_id);
    },

    async listarWebhooks() {
      const dados = await chamar<Json>("GET", "/webhooks");
      const itens = Array.isArray(dados.items) ? (dados.items as Json[]) : [];
      return itens.map((item) => ({
        id: String(item.id),
        url: String(item.request_url ?? item.url ?? ""),
        fonte: String(item.source ?? item.type ?? ""),
      }));
    },
  };
}
