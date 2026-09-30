import type { CampoPersonalizado, ClienteRd, NegociacaoRd } from "@/server/rd/cliente";

type Negociacao = {
  id: string;
  nome: string;
  etapaId: string;
  organizacaoId: string;
  contatos: { nome: string; cargo: string | null }[];
  campos: Map<string, string>;
  usuarioId: string | null;
};

/** RD Station em memória: guarda empresas, negociações, tarefas e anotações. */
export class RdFalso implements ClienteRd {
  organizacoes = new Map<string, string>();
  negociacoes = new Map<string, Negociacao>();
  tarefas: { negociacaoId: string; assunto: string; data: string; usuarioIds?: string[] }[] = [];
  anotacoes: { negociacaoId: string; texto: string }[] = [];
  chamadas: string[] = [];
  private falhas: Error[] = [];
  private sequencia = 0;

  falharProxima(erro: Error): this {
    this.falhas.push(erro);
    return this;
  }

  private registrar(nome: string) {
    this.chamadas.push(nome);
    const falha = this.falhas.shift();
    if (falha) throw falha;
  }

  private novoId(prefixo: string) {
    this.sequencia += 1;
    return `${prefixo}-${this.sequencia}`;
  }

  async buscarOrganizacao(nome: string) {
    this.registrar("buscarOrganizacao");
    return this.organizacoes.get(nome.toLowerCase()) ?? null;
  }

  async criarOrganizacao(p: { nome: string }) {
    this.registrar("criarOrganizacao");
    const id = this.novoId("org");
    this.organizacoes.set(p.nome.toLowerCase(), id);
    return id;
  }

  async buscarNegociacao(p: { nome: string }): Promise<NegociacaoRd | null> {
    this.registrar("buscarNegociacao");
    const negociacao = [...this.negociacoes.values()].find((n) => n.nome === p.nome);
    return negociacao ? { id: negociacao.id, etapaId: negociacao.etapaId } : null;
  }

  async obterNegociacao(id: string): Promise<NegociacaoRd> {
    this.registrar("obterNegociacao");
    const negociacao = this.negociacoes.get(id)!;
    return { id, etapaId: negociacao.etapaId };
  }

  async criarNegociacao(p: {
    nome: string;
    etapaId: string;
    usuarioId?: string | null;
    organizacaoId: string;
    contato: { nome: string; cargo: string | null };
    campos: CampoPersonalizado[];
  }) {
    this.registrar("criarNegociacao");
    const id = this.novoId("deal");
    this.negociacoes.set(id, {
      id,
      nome: p.nome,
      etapaId: p.etapaId,
      organizacaoId: p.organizacaoId,
      contatos: [p.contato],
      campos: new Map(p.campos.map((c) => [c.id, c.valor])),
      usuarioId: p.usuarioId ?? null,
    });
    return id;
  }

  async atualizarNegociacao(id: string, p: { etapaId?: string | null; campos?: CampoPersonalizado[] }) {
    this.registrar("atualizarNegociacao");
    const negociacao = this.negociacoes.get(id)!;
    if (p.etapaId) negociacao.etapaId = p.etapaId;
    for (const campo of p.campos ?? []) negociacao.campos.set(campo.id, campo.valor);
  }

  async criarTarefa(p: { negociacaoId: string; assunto: string; data: string; usuarioIds?: string[] }) {
    this.registrar("criarTarefa");
    this.tarefas.push(p);
  }

  async criarAnotacao(p: { negociacaoId: string; texto: string }) {
    this.registrar("criarAnotacao");
    this.anotacoes.push(p);
  }

  async listarFunis() {
    return [];
  }

  async listarCamposDeNegociacao() {
    return [];
  }

  async listarUsuarios() {
    return [];
  }

  async listarFontes() {
    return [];
  }
}
