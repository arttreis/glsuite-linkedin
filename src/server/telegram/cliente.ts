// Referência dos métodos: docs/pesquisa/telegram-bot-api.md

/** Erro da Bot API: `{ ok: false, error_code, description, parameters: { retry_after } }`. */
export class ErroDoTelegram extends Error {
  readonly status: number;
  /** O `error_code`, em texto; `rede` quando a resposta não chegou. */
  readonly codigo: string;
  readonly descricao: string;
  /** Segundos até poder repetir, no 429. */
  readonly esperarSegundos: number | null;

  constructor(dados: { status: number; codigo: string; descricao: string; esperarSegundos?: number | null }) {
    super(`Telegram ${dados.codigo}: ${dados.descricao}`);
    this.name = "ErroDoTelegram";
    this.status = dados.status;
    this.codigo = dados.codigo;
    this.descricao = dados.descricao;
    this.esperarSegundos = dados.esperarSegundos ?? null;
  }

  /** Sem resposta (queda, timeout): a mensagem pode ter saído. */
  get semResposta(): boolean {
    return this.codigo === "rede";
  }
}

export type BotDoTelegram = { id: string; usuario: string; nome: string };
export type WebhookDoBot = { url: string | null; ultimoErro: string | null; pendentes: number };

export type MensagemDoTelegram = {
  token: string;
  chatId: string;
  texto: string;
  botao?: { texto: string; url: string } | null;
};

export type ClienteTelegram = {
  conferirBot(token: string): Promise<BotDoTelegram>;
  webhookAtual(token: string): Promise<WebhookDoBot>;
  ligarWebhook(p: { token: string; url: string; segredo: string }): Promise<void>;
  desligarWebhook(token: string): Promise<void>;
  enviarMensagem(p: MensagemDoTelegram): Promise<{ messageId: string }>;
};

type Json = Record<string, unknown>;

export function criarClienteTelegram(config: { fetch?: typeof fetch; timeoutMs?: number } = {}): ClienteTelegram {
  const executar = config.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 15_000;

  async function chamar<T = Json>(token: string, metodo: string, corpo?: Json): Promise<T> {
    let resposta: Response;
    try {
      resposta = await executar(`https://api.telegram.org/bot${token}/${metodo}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(corpo ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (erro) {
      throw new ErroDoTelegram({ status: 0, codigo: "rede", descricao: (erro as Error).message });
    }
    const texto = await resposta.text();
    let dados: Json = {};
    try {
      dados = texto ? (JSON.parse(texto) as Json) : {};
    } catch {
      dados = {};
    }
    if (!resposta.ok || dados.ok !== true) {
      const parametros = (dados.parameters ?? {}) as Json;
      throw new ErroDoTelegram({
        status: resposta.status,
        codigo: String(dados.error_code ?? resposta.status),
        descricao: typeof dados.description === "string" ? dados.description : texto.slice(0, 200) || "sem corpo",
        esperarSegundos: typeof parametros.retry_after === "number" ? parametros.retry_after : null,
      });
    }
    return dados.result as T;
  }

  return {
    async conferirBot(token) {
      const bot = await chamar<Json>(token, "getMe");
      return { id: String(bot.id), usuario: String(bot.username ?? ""), nome: String(bot.first_name ?? "") };
    },
    async webhookAtual(token) {
      const info = await chamar<Json>(token, "getWebhookInfo");
      return {
        url: typeof info.url === "string" && info.url ? info.url : null,
        ultimoErro: typeof info.last_error_message === "string" ? info.last_error_message : null,
        pendentes: typeof info.pending_update_count === "number" ? info.pending_update_count : 0,
      };
    },
    async ligarWebhook({ token, url, segredo }) {
      await chamar(token, "setWebhook", { url, secret_token: segredo, allowed_updates: ["message", "my_chat_member"] });
    },
    async desligarWebhook(token) {
      await chamar(token, "deleteWebhook", {});
    },
    async enviarMensagem({ token, chatId, texto, botao }) {
      const mensagem = await chamar<Json>(token, "sendMessage", {
        chat_id: chatId,
        text: texto,
        ...(botao ? { reply_markup: { inline_keyboard: [[{ text: botao.texto, url: botao.url }]] } } : {}),
      });
      return { messageId: String(mensagem.message_id) };
    },
  };
}
