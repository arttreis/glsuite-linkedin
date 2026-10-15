import type {
  ClienteUnipile,
  ContaUnipile,
  ConviteEnviado,
  ConversaDaConta,
  ConversaUnipile,
  DonoDaConta,
  LinkDeConexao,
  MensagemDaConversa,
  ParticipanteDaConversa,
  PerfilLinkedIn,
  PostLinkedIn,
  ParametroDeBusca,
  ResultadoDeBusca,
  TipoDeParametro,
  WebhookUnipile,
} from "@/server/unipile/cliente";

type Metodo = keyof ClienteUnipile;
export type Chamada = { metodo: Metodo; args: Record<string, unknown> };

/**
 * Unipile em memória para os testes: registra cada chamada, devolve dados
 * configuráveis e falha sob encomenda (`falharProxima`).
 */
export class UnipileFalso implements ClienteUnipile {
  chamadas: Chamada[] = [];
  contas = new Map<string, ContaUnipile>();
  donos = new Map<string, DonoDaConta>();
  perfis = new Map<string, PerfilLinkedIn>();
  posts = new Map<string, PostLinkedIn[]>();
  mensagensPorChat = new Map<string, MensagemDaConversa[]>();
  conversasPorPessoa = new Map<string, ConversaUnipile[]>();
  conversasDaConta: ConversaDaConta[] = [];
  participantesPorChat = new Map<string, ParticipanteDaConversa[]>();
  resultadosDeBusca: ResultadoDeBusca[] = [];
  /** Busca em páginas: o cursor `pagina-N` leva à página N. Vazio, vale `resultadosDeBusca`. */
  paginasDeBusca: ResultadoDeBusca[][] = [];
  /** O `paging.total_count` que a busca devolve. */
  totalDaBusca: number | null = null;
  parametrosDeBusca = new Map<string, ParametroDeBusca[]>();
  convitesPendentes: ConviteEnviado[] = [];
  webhooks: WebhookUnipile[] = [];
  private falhas = new Map<Metodo, unknown[]>();
  private sequencia = 0;

  falharProxima(metodo: Metodo, erro: unknown): this {
    this.falhas.set(metodo, [...(this.falhas.get(metodo) ?? []), erro]);
    return this;
  }

  chamadasDe(metodo: Metodo): Record<string, unknown>[] {
    return this.chamadas.filter((c) => c.metodo === metodo).map((c) => c.args);
  }

  private registrar(metodo: Metodo, args: Record<string, unknown>) {
    this.chamadas.push({ metodo, args });
    const fila = this.falhas.get(metodo);
    if (fila && fila.length > 0) throw fila.shift();
  }

  private proximoId(prefixo: string) {
    this.sequencia += 1;
    return `${prefixo}-${this.sequencia}`;
  }

  async gerarLinkDeConexao(link: LinkDeConexao) {
    this.registrar("gerarLinkDeConexao", { ...link });
    return `https://account.unipile.com/${this.proximoId("link")}`;
  }

  async obterConta(accountId: string) {
    this.registrar("obterConta", { accountId });
    return this.contas.get(accountId) ?? { id: accountId, tipo: "LINKEDIN", nome: null, status: ["OK"] };
  }

  async obterDonoDaConta(accountId: string) {
    this.registrar("obterDonoDaConta", { accountId });
    return (
      this.donos.get(accountId) ?? {
        providerId: `ACoDono-${accountId}`,
        nome: "Dono da Conta",
        publicIdentifier: null,
        premium: true,
        salesNavigator: false,
      }
    );
  }

  async enviarConvite(p: { accountId: string; providerId: string; mensagem?: string }) {
    this.registrar("enviarConvite", p);
    return { invitationId: this.proximoId("convite") };
  }

  async listarConvitesEnviados(accountId: string) {
    this.registrar("listarConvitesEnviados", { accountId });
    return { itens: this.convitesPendentes, cursor: null };
  }

  async cancelarConvite(accountId: string, invitationId: string) {
    this.registrar("cancelarConvite", { accountId, invitationId });
  }

  async obterPerfil(accountId: string, identificador: string, opcoes?: { completo?: boolean }) {
    this.registrar("obterPerfil", { accountId, identificador, ...opcoes });
    const perfil = this.perfis.get(identificador);
    if (!perfil) throw new Error(`perfil ${identificador} não configurado no falso`);
    return perfil;
  }

  async listarPosts(accountId: string, providerId: string, limite?: number) {
    this.registrar("listarPosts", { accountId, providerId, limite });
    return this.posts.get(providerId) ?? [];
  }

  async iniciarConversa(p: { accountId: string; providerId: string; texto: string }) {
    this.registrar("iniciarConversa", p);
    return { chatId: this.proximoId("chat"), messageId: this.proximoId("msg") };
  }

  async enviarMensagem(p: { accountId: string; chatId: string; texto: string }) {
    this.registrar("enviarMensagem", p);
    return { messageId: this.proximoId("msg") };
  }

  async listarMensagens(chatId: string, limite?: number) {
    this.registrar("listarMensagens", { chatId, limite });
    return this.mensagensPorChat.get(chatId) ?? [];
  }

  async listarConversasComPessoa(accountId: string, providerId: string) {
    this.registrar("listarConversasComPessoa", { accountId, providerId });
    return this.conversasPorPessoa.get(providerId) ?? [];
  }

  async listarConversas(accountId: string, p?: { cursor?: string; limite?: number }) {
    this.registrar("listarConversas", { accountId, ...p });
    const inicio = p?.cursor ? Number(p.cursor) : 0;
    const fim = inicio + (p?.limite ?? 100);
    return { itens: this.conversasDaConta.slice(inicio, fim), cursor: fim < this.conversasDaConta.length ? String(fim) : null };
  }

  async listarParticipantes(chatId: string) {
    this.registrar("listarParticipantes", { chatId });
    return this.participantesPorChat.get(chatId) ?? [];
  }

  async buscarPessoas(accountId: string, busca: unknown, cursor?: string) {
    this.registrar("buscarPessoas", { accountId, busca, cursor });
    if (this.paginasDeBusca.length === 0) return { itens: this.resultadosDeBusca, cursor: null, total: this.totalDaBusca };
    const pagina = cursor ? Number(cursor.replace("pagina-", "")) : 0;
    const proxima = pagina + 1 < this.paginasDeBusca.length ? `pagina-${pagina + 1}` : null;
    return { itens: this.paginasDeBusca[pagina] ?? [], cursor: proxima, total: this.totalDaBusca };
  }

  async listarParametrosDeBusca(accountId: string, tipo: TipoDeParametro, texto: string) {
    this.registrar("listarParametrosDeBusca", { accountId, tipo, texto });
    return this.parametrosDeBusca.get(`${tipo}:${texto}`) ?? [];
  }

  async criarWebhook(p: { url: string; fonte: "messaging" | "users" | "account_status"; nome: string; headers: Record<string, string>; eventos?: string[] }) {
    this.registrar("criarWebhook", p);
    const id = this.proximoId("webhook");
    this.webhooks.push({ id, url: p.url, fonte: p.fonte });
    return id;
  }

  async listarWebhooks() {
    this.registrar("listarWebhooks", {});
    return this.webhooks;
  }
}
