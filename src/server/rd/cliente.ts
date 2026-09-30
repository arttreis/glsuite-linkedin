// Referência: docs/pesquisa/rd-station.md (API v1 com token).

export class ErroRd extends Error {
  readonly status: number;
  constructor(status: number, mensagem: string) {
    super(`RD Station ${status}: ${mensagem}`);
    this.name = "ErroRd";
    this.status = status;
  }
}

export type CampoPersonalizado = { id: string; valor: string };
export type NegociacaoRd = { id: string; etapaId: string | null };

/** O que o SDR precisa do RD Station CRM. Os testes usam uma implementação falsa. */
export interface ClienteRd {
  buscarOrganizacao(nome: string): Promise<string | null>;
  criarOrganizacao(p: { nome: string; usuarioId?: string | null }): Promise<string>;
  buscarNegociacao(p: { nome: string; pipelineId?: string | null }): Promise<NegociacaoRd | null>;
  obterNegociacao(id: string): Promise<NegociacaoRd>;
  criarNegociacao(p: {
    nome: string;
    etapaId: string;
    usuarioId?: string | null;
    organizacaoId: string;
    contato: { nome: string; cargo: string | null };
    campos: CampoPersonalizado[];
    fonteId?: string | null;
  }): Promise<string>;
  atualizarNegociacao(id: string, p: { etapaId?: string | null; usuarioId?: string | null; campos?: CampoPersonalizado[] }): Promise<void>;
  criarTarefa(p: { negociacaoId: string; assunto: string; data: string; hora?: string; usuarioIds?: string[] }): Promise<void>;
  criarAnotacao(p: { negociacaoId: string; usuarioId?: string | null; texto: string }): Promise<void>;
  listarFunis(): Promise<{ id: string; nome: string; etapas: { id: string; nome: string; ordem: number }[] }[]>;
  listarCamposDeNegociacao(): Promise<{ id: string; rotulo: string; tipo: string; opcoes: string[] }[]>;
  listarUsuarios(): Promise<{ id: string; nome: string; email: string }[]>;
  listarFontes(): Promise<{ id: string; nome: string }[]>;
}

type Json = Record<string, unknown>;

const lista = (dados: unknown, chave: string): Json[] => {
  if (Array.isArray(dados)) return dados as Json[];
  const valor = (dados as Json | undefined)?.[chave];
  return Array.isArray(valor) ? (valor as Json[]) : [];
};
const idDe = (item: Json | undefined): string => String(item?.id ?? item?._id ?? "");
const etapaDe = (negociacao: Json): string | null => {
  const etapa = negociacao.deal_stage as Json | undefined;
  return etapa?.id ? String(etapa.id) : null;
};

export function criarClienteRd(config: { token: string; base?: string; fetch?: typeof fetch }): ClienteRd {
  const base = (config.base ?? "https://crm.rdstation.com/api/v1").replace(/\/$/, "");
  const executar = config.fetch ?? globalThis.fetch;

  async function chamar<T = Json>(metodo: "GET" | "POST" | "PUT", caminho: string, opcoes: { query?: Record<string, string>; json?: unknown } = {}): Promise<T> {
    const url = new URL(base + caminho);
    url.searchParams.set("token", config.token);
    for (const [chave, valor] of Object.entries(opcoes.query ?? {})) url.searchParams.set(chave, valor);
    let resposta: Response;
    try {
      resposta = await executar(url, {
        method: metodo,
        headers: { accept: "application/json", ...(opcoes.json !== undefined ? { "content-type": "application/json" } : {}) },
        body: opcoes.json !== undefined ? JSON.stringify(opcoes.json) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (erro) {
      throw new ErroRd(0, (erro as Error).message);
    }
    const texto = await resposta.text();
    if (!resposta.ok) throw new ErroRd(resposta.status, texto.slice(0, 300) || resposta.statusText);
    return (texto ? JSON.parse(texto) : {}) as T;
  }

  const campos = (itens: CampoPersonalizado[] | undefined) =>
    (itens ?? []).map((campo) => ({ custom_field_id: campo.id, value: campo.valor }));

  return {
    async buscarOrganizacao(nome) {
      const dados = await chamar("GET", "/organizations", { query: { q: nome, limit: "20" } });
      const exata = lista(dados, "organizations").find((o) => String(o.name ?? "").toLowerCase() === nome.toLowerCase());
      return exata ? idDe(exata) : null;
    },
    async criarOrganizacao({ nome, usuarioId }) {
      const dados = await chamar("POST", "/organizations", { json: { organization: { name: nome, ...(usuarioId ? { user_id: usuarioId } : {}) } } });
      return idDe(dados);
    },
    async buscarNegociacao({ nome, pipelineId }) {
      const query: Record<string, string> = { name: nome, exact_name: "true", limit: "20" };
      if (pipelineId) query.deal_pipeline_id = pipelineId;
      const dados = await chamar("GET", "/deals", { query });
      const aberta = lista(dados, "deals").find((d) => d.win === null || d.win === undefined);
      return aberta ? { id: idDe(aberta), etapaId: etapaDe(aberta) } : null;
    },
    async obterNegociacao(id) {
      const dados = await chamar("GET", `/deals/${encodeURIComponent(id)}`);
      return { id: idDe(dados) || id, etapaId: etapaDe(dados) };
    },
    async criarNegociacao(p) {
      const dados = await chamar("POST", "/deals", {
        json: {
          deal: {
            name: p.nome,
            deal_stage_id: p.etapaId,
            ...(p.usuarioId ? { user_id: p.usuarioId } : {}),
            deal_custom_fields: campos(p.campos),
          },
          organization: { _id: p.organizacaoId },
          contacts: [{ name: p.contato.nome, ...(p.contato.cargo ? { title: p.contato.cargo } : {}) }],
          ...(p.fonteId ? { deal_source: { _id: p.fonteId } } : {}),
        },
      });
      return idDe(dados);
    },
    async atualizarNegociacao(id, p) {
      // deal_stage_id vai na raiz: dentro de `deal` a v1 responde 200 e não move.
      await chamar("PUT", `/deals/${encodeURIComponent(id)}`, {
        json: {
          ...(p.etapaId ? { deal_stage_id: p.etapaId } : {}),
          deal: { ...(p.usuarioId ? { user_id: p.usuarioId } : {}), ...(p.campos?.length ? { deal_custom_fields: campos(p.campos) } : {}) },
        },
      });
    },
    async criarTarefa(p) {
      await chamar("POST", "/tasks", {
        json: {
          task: {
            deal_id: p.negociacaoId,
            subject: p.assunto,
            type: "task",
            date: p.data,
            hour: p.hora ?? "09:00",
            ...(p.usuarioIds?.length ? { user_ids: p.usuarioIds } : {}),
          },
        },
      });
    },
    async criarAnotacao(p) {
      await chamar("POST", "/activities", {
        json: { activity: { deal_id: p.negociacaoId, text: p.texto, ...(p.usuarioId ? { user_id: p.usuarioId } : {}) } },
      });
    },
    async listarFunis() {
      const dados = await chamar("GET", "/deal_pipelines", { query: { limit: "200" } });
      return lista(dados, "deal_pipelines").map((funil) => ({
        id: idDe(funil),
        nome: String(funil.name ?? ""),
        etapas: lista(funil.deal_stages, "deal_stages").map((etapa) => ({
          id: idDe(etapa),
          nome: String(etapa.name ?? ""),
          ordem: Number(etapa.order ?? 0),
        })),
      }));
    },
    async listarCamposDeNegociacao() {
      const dados = await chamar("GET", "/custom_fields", { query: { for: "deal" } });
      return lista(dados, "custom_fields").map((campo) => ({
        id: idDe(campo),
        rotulo: String(campo.label ?? ""),
        tipo: String(campo.type ?? ""),
        opcoes: Array.isArray(campo.opts) ? (campo.opts as unknown[]).map(String) : [],
      }));
    },
    async listarUsuarios() {
      const dados = await chamar("GET", "/users", { query: { active: "true" } });
      return lista(dados, "users").map((u) => ({ id: idDe(u), nome: String(u.name ?? ""), email: String(u.email ?? "") }));
    },
    async listarFontes() {
      const dados = await chamar("GET", "/deal_sources", { query: { limit: "200" } });
      return lista(dados, "deal_sources").map((f) => ({ id: idDe(f), nome: String(f.name ?? "") }));
    },
  };
}
