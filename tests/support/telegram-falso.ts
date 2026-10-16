import { ErroDoTelegram, type BotDoTelegram, type ClienteTelegram, type MensagemDoTelegram, type WebhookDoBot } from "@/server/telegram/cliente";

/** A Bot API de mentira: guarda as chamadas e responde o que o teste pedir. */
export class TelegramFalso implements ClienteTelegram {
  bot: BotDoTelegram = { id: "7000000001", usuario: "loja_bot", nome: "Loja" };
  webhook: WebhookDoBot = { url: null, ultimoErro: null, pendentes: 0 };
  erroNaConferencia: ErroDoTelegram | null = null;
  /** Erro de cada envio, pelo id do chat (o resto dá certo). */
  erroNoEnvio = new Map<string, ErroDoTelegram>();
  webhooksLigados: { url: string; segredo: string }[] = [];
  desligados = 0;
  mensagens: MensagemDoTelegram[] = [];
  private proximo = 100;

  async conferirBot() {
    if (this.erroNaConferencia) throw this.erroNaConferencia;
    return this.bot;
  }

  async webhookAtual() {
    return this.webhook;
  }

  async ligarWebhook(p: { token: string; url: string; segredo: string }) {
    this.webhooksLigados.push({ url: p.url, segredo: p.segredo });
    this.webhook = { url: p.url, ultimoErro: null, pendentes: 0 };
  }

  async desligarWebhook() {
    this.desligados += 1;
    this.webhook = { url: null, ultimoErro: null, pendentes: 0 };
  }

  async enviarMensagem(p: MensagemDoTelegram) {
    this.mensagens.push(p);
    const erro = this.erroNoEnvio.get(p.chatId);
    if (erro) throw erro;
    return { messageId: String(this.proximo++) };
  }
}

export const erroDoTelegram = (codigo: string, descricao: string, esperarSegundos?: number) =>
  new ErroDoTelegram({ status: Number(codigo), codigo, descricao, esperarSegundos });
