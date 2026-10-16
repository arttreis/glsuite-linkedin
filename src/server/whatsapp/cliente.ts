import type { ComponenteDoTemplate, TemplateDoWhatsapp } from "@/domain/disparos";

// Referência dos endpoints: docs/pesquisa/whatsapp-cloud-api.md

/** Erro da Graph API no formato `{ error: { message, code, error_subcode, error_data: { details } } }`. */
export class ErroDaMeta extends Error {
  readonly status: number;
  /** O `code` da Meta, em texto; `rede` quando a resposta não chegou. */
  readonly codigo: string;
  readonly subcodigo: string | null;
  readonly detalhe: string | null;

  constructor(dados: { status: number; codigo: string; mensagem: string; subcodigo?: string | null; detalhe?: string | null }) {
    super(`Meta ${dados.status} ${dados.codigo}: ${dados.mensagem}`);
    this.name = "ErroDaMeta";
    this.status = dados.status;
    this.codigo = dados.codigo;
    this.subcodigo = dados.subcodigo ?? null;
    this.detalhe = dados.detalhe ?? null;
  }

  /** Sem resposta da Meta (queda, timeout) ou resposta sem o id: o envio pode ter saído. */
  get semResposta(): boolean {
    return this.codigo === "rede" || this.codigo === "sem_id";
  }

  static deResposta(status: number, corpo: unknown, texto: string): ErroDaMeta {
    const erro = (corpo && typeof corpo === "object" ? (corpo as { error?: Record<string, unknown> }).error : undefined) ?? {};
    const dados = (erro.error_data && typeof erro.error_data === "object" ? erro.error_data : {}) as Record<string, unknown>;
    return new ErroDaMeta({
      status,
      codigo: erro.code === undefined ? `http_${status}` : String(erro.code),
      mensagem: typeof erro.message === "string" ? erro.message : texto.slice(0, 200) || "sem corpo",
      subcodigo: erro.error_subcode === undefined ? null : String(erro.error_subcode),
      detalhe: typeof dados.details === "string" ? dados.details : null,
    });
  }
}

export type NumeroDoWhatsapp = {
  id: string;
  /** O número como a Meta mostra (`+55 11 99999-8888`). */
  numero: string;
  nomeVerificado: string | null;
  /** `GREEN`, `YELLOW`, `RED` ou `NA`. */
  qualidade: string | null;
  /** Destinatários únicos em 24 h, do portfólio (`TIER_250`, `TIER_2K`…). */
  limite: string | null;
};

export type EnvioDeTemplate = {
  phoneNumberId: string;
  token: string;
  /** E.164, com o +. */
  para: string;
  template: { nome: string; idioma: string; componentes: Record<string, unknown>[] };
  /** Volta nos webhooks de status (`biz_opaque_callback_data`): o id do envio no Kakou. */
  dadosDeVolta?: string;
};

export type ClienteWhatsapp = {
  conferirNumero(p: { phoneNumberId: string; token: string }): Promise<NumeroDoWhatsapp>;
  /**
   * Inscreve o app do token na WABA, com o webhook de mensagens apontando para
   * o Kakou (`override_callback_uri`). A Meta confere a URL com o verify token.
   */
  inscreverApp(p: { wabaId: string; token: string; urlDoWebhook: string; tokenDeVerificacao: string }): Promise<void>;
  /** Todos os templates da WABA (até 1.000), em qualquer status. */
  listarTemplates(p: { wabaId: string; token: string }): Promise<TemplateDoWhatsapp[]>;
  enviarTemplate(p: EnvioDeTemplate): Promise<{ wamid: string; waId: string | null; status: string | null }>;
};

type ConfigCliente = {
  /** Versão da Graph API (`v26.0`). */
  versao: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Json = Record<string, unknown>;

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.length > 0 ? valor : null);

export function paraTemplate(dados: Json): TemplateDoWhatsapp {
  return {
    id: String(dados.id ?? ""),
    nome: String(dados.name ?? ""),
    idioma: String(dados.language ?? ""),
    categoria: String(dados.category ?? ""),
    status: String(dados.status ?? ""),
    formato: String(dados.parameter_format ?? "").toUpperCase() === "NAMED" ? "named" : "positional",
    componentes: (Array.isArray(dados.components) ? (dados.components as Json[]) : []).map(
      (c): ComponenteDoTemplate => ({
        type: String(c.type ?? ""),
        format: texto(c.format) ?? undefined,
        text: texto(c.text) ?? undefined,
        buttons: Array.isArray(c.buttons)
          ? (c.buttons as Json[]).map((b) => ({ type: String(b.type ?? ""), text: texto(b.text) ?? undefined, url: texto(b.url) ?? undefined }))
          : undefined,
      }),
    ),
  };
}

export function criarClienteWhatsapp(config: ConfigCliente): ClienteWhatsapp {
  const base = `https://graph.facebook.com/${config.versao}`;
  const executar = config.fetch ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 20_000;

  async function chamar<T = Json>(metodo: "GET" | "POST", caminho: string, token: string, opcoes: { query?: Record<string, string>; json?: unknown } = {}): Promise<T> {
    const url = new URL(caminho.startsWith("https://") ? caminho : base + caminho);
    for (const [chave, valor] of Object.entries(opcoes.query ?? {})) url.searchParams.set(chave, valor);
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: "application/json" };
    let body: string | undefined;
    if (opcoes.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opcoes.json);
    }
    let resposta: Response;
    try {
      resposta = await executar(url, { method: metodo, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch (erro) {
      throw new ErroDaMeta({ status: 0, codigo: "rede", mensagem: (erro as Error).message });
    }
    const corpoTexto = await resposta.text();
    let corpo: unknown;
    try {
      corpo = corpoTexto ? JSON.parse(corpoTexto) : undefined;
    } catch {
      corpo = undefined;
    }
    if (!resposta.ok) throw ErroDaMeta.deResposta(resposta.status, corpo, corpoTexto);
    return (corpo ?? {}) as T;
  }

  return {
    async conferirNumero({ phoneNumberId, token }) {
      const dados = await chamar(`GET`, `/${encodeURIComponent(phoneNumberId)}`, token, {
        query: { fields: "id,display_phone_number,verified_name,quality_rating,whatsapp_business_manager_messaging_limit" },
      });
      return {
        id: String(dados.id ?? phoneNumberId),
        numero: texto(dados.display_phone_number) ?? phoneNumberId,
        nomeVerificado: texto(dados.verified_name),
        qualidade: texto(dados.quality_rating),
        limite: texto(dados.whatsapp_business_manager_messaging_limit),
      };
    },

    async inscreverApp({ wabaId, token, urlDoWebhook, tokenDeVerificacao }) {
      await chamar("POST", `/${encodeURIComponent(wabaId)}/subscribed_apps`, token, {
        json: { override_callback_uri: urlDoWebhook, verify_token: tokenDeVerificacao },
      });
    },

    async listarTemplates({ wabaId, token }) {
      const templates: TemplateDoWhatsapp[] = [];
      let proxima: string | null = `/${encodeURIComponent(wabaId)}/message_templates`;
      let query: Record<string, string> | undefined = { fields: "id,name,language,status,category,components,parameter_format", limit: "100" };
      for (let pagina = 0; proxima && pagina < 10; pagina += 1) {
        const dados: Json = await chamar("GET", proxima, token, { query });
        for (const item of Array.isArray(dados.data) ? (dados.data as Json[]) : []) templates.push(paraTemplate(item));
        const paginacao = (dados.paging ?? {}) as Json;
        proxima = texto(paginacao.next);
        query = undefined; // o `next` já traz a query inteira
      }
      return templates;
    },

    async enviarTemplate({ phoneNumberId, token, para, template, dadosDeVolta }) {
      const dados = await chamar("POST", `/${encodeURIComponent(phoneNumberId)}/messages`, token, {
        json: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: para,
          type: "template",
          template: { name: template.nome, language: { code: template.idioma }, components: template.componentes },
          ...(dadosDeVolta ? { biz_opaque_callback_data: dadosDeVolta } : {}),
        },
      });
      const mensagem = Array.isArray(dados.messages) ? (dados.messages[0] as Json | undefined) : undefined;
      const contato = Array.isArray(dados.contacts) ? (dados.contacts[0] as Json | undefined) : undefined;
      const wamid = texto(mensagem?.id);
      if (!wamid) throw new ErroDaMeta({ status: 200, codigo: "sem_id", mensagem: "A Meta aceitou sem devolver o id da mensagem." });
      return { wamid, waId: texto(contato?.wa_id), status: texto(mensagem?.message_status) };
    },
  };
}
