import { semAcentos } from "./texto";

/**
 * Validador de copy (§4.2). Toda mensagem que sai passa por ele: template,
 * texto da IA e texto editado por humano. Falha bloqueia o envio e manda para
 * revisão humana com o motivo. Ele nunca corrige nada em silêncio.
 */

/** Toque da sequência padrão (T1 a T4) ou id de um bloco do fluxo (SDR-21). */
export type Toque = string;
export type Praca = "domestico" | "canada" | "espanha";
export type Origem = "template" | "ia" | "humano";

export type ContextoDeValidacao = {
  /** Toque da régua; null quando é mensagem de conversa (depois da resposta). */
  toque: Toque | null;
  tipo: "convite" | "dm";
  origem: Origem;
  praca: Praca;
  palavrasProibidas: readonly string[];
  /** Teto de caracteres do toque (§4.1, configurável na campanha). */
  tetoCaracteres?: number;
  /** Limite do LinkedIn para a nota do convite (200 na conta gratuita, 300 na paga). */
  limiteNotaConvite?: number;
  /** Frases de descadastro aceitas (Canadá, §4.5). */
  frasesDescadastro?: readonly string[];
  /** Único link que a IA pode mandar numa conversa (link de agenda). */
  linkDeAgenda?: string | null;
};

export type RegraDoValidador =
  | "vazio"
  | "travessao"
  | "palavra_proibida"
  | "url"
  | "teto_caracteres"
  | "limite_nota_convite"
  | "escrita_a_mao"
  | "descadastro"
  | "token_nao_resolvido"
  | "escalada_canal"
  | "link_nao_permitido";

export type Violacao = { regra: RegraDoValidador; mensagem: string };
export type ResultadoDaValidacao = { ok: boolean; violacoes: Violacao[] };

// Travessão, meia-risca e parentes visuais (figure dash, horizontal bar,
// travessões duplos e as variantes de compatibilidade).
const TRAVESSOES = /[‒–—―⸺⸻︱︲﹘]/u;

const TLDS =
  "com|br|net|org|io|ai|co|me|ly|app|dev|link|es|ca|pt|us|uk|info|biz|xyz|site|online|store|tech|to|gg|tv|de|fr|it|eu|cc|sh|so|page|digital|agency|chat|bio|click|cal";
const PADRAO_URL = new RegExp(
  `(?:https?:\\/\\/|www\\.)\\S+|\\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/\\S*)?`,
  "iu",
);

// Afirmações de autoria humana ("escrevi à mão", "não é mensagem automática").
const ESCRITA_A_MAO = [
  /escrit[ao]s? (a|de proprio) (mao|punho)/,
  /escrevi (isso |essa mensagem |esta mensagem )?(a mao|de proprio punho)/,
  /feit[ao] a mao/,
  /nao (e|eh) (uma )?mensagem automatica/,
  /nao (e|eh) (um )?(robo|bot)/,
  /nao sou (um )?(robo|bot)/,
  /hand[- ]?written/,
  /written by hand/,
  /wrote (this|it) by hand/,
  /not (an )?automated/,
  /not a (bot|template)/,
  /escrit[oa] a mano/,
  /escribi (esto |este mensaje )?a mano/,
  /no es (un )?mensaje automatico/,
  /no soy un bot/,
];

// Puxar para outro canal: WhatsApp, e-mail, telefone (§4.6).
const ESCALADA_DE_CANAL = [
  /whats ?app|\bwpp\b|\bzap\b/,
  /\be-?mail\b|\bcorreo\b/,
  /\btelefone\b|\bcelular\b|\bphone\b|\btelefono\b/,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /\+?\d[\d\s().-]{8,}\d/,
];

const normalizar = (texto: string) => semAcentos(texto).toLowerCase().replace(/\s+/g, " ");

const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function palavraProibidaEncontrada(texto: string, palavras: readonly string[]): string | null {
  const alvo = normalizar(texto);
  for (const palavra of palavras) {
    const busca = normalizar(palavra).trim();
    if (!busca) continue;
    // Começo de palavra, aceitando sufixo: "agência" pega "agências".
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaparRegex(busca)}`, "u").test(alvo)) return palavra;
  }
  return null;
}

const temDescadastro = (texto: string, frases: readonly string[]) => {
  const limpo = (valor: string) => normalizar(valor).replace(/[^\p{L}\p{N} ]/gu, "").trim();
  const alvo = limpo(texto);
  return frases.some((frase) => limpo(frase) !== "" && alvo.includes(limpo(frase)));
};

export function validarMensagem(texto: string, ctx: ContextoDeValidacao): ResultadoDaValidacao {
  const violacoes: Violacao[] = [];
  const conteudo = texto.trim();
  const naRegua = ctx.toque !== null;
  const nome = ctx.toque ?? "mensagem";

  if (!conteudo) {
    // Convite sem nota é permitido; DM vazia não.
    if (ctx.tipo === "dm") violacoes.push({ regra: "vazio", mensagem: "A mensagem está vazia." });
    return { ok: violacoes.length === 0, violacoes };
  }

  if (TRAVESSOES.test(conteudo)) {
    violacoes.push({
      regra: "travessao",
      mensagem: "Tem travessão ou meia-risca (— ou –). Troque por vírgula, ponto ou dois-pontos.",
    });
  }

  const proibida = palavraProibidaEncontrada(conteudo, ctx.palavrasProibidas);
  if (proibida) violacoes.push({ regra: "palavra_proibida", mensagem: `Usa a palavra proibida "${proibida}".` });

  if (/\{\{|\}\}/.test(conteudo)) {
    violacoes.push({ regra: "token_nao_resolvido", mensagem: "Sobrou variável sem preencher ({{...}})." });
  }

  const url = conteudo.match(PADRAO_URL)?.[0];
  if (naRegua && url) {
    violacoes.push({
      regra: "url",
      mensagem: `Tem link (${url}). T1 a T4 não levam link, anexo nem link de agenda.`,
    });
  }

  if (naRegua && ctx.tetoCaracteres !== undefined && conteudo.length > ctx.tetoCaracteres) {
    violacoes.push({
      regra: "teto_caracteres",
      mensagem: `Tem ${conteudo.length} caracteres; o teto do ${nome} é ${ctx.tetoCaracteres}.`,
    });
  }

  if (ctx.tipo === "convite" && ctx.limiteNotaConvite !== undefined && conteudo.length > ctx.limiteNotaConvite) {
    violacoes.push({
      regra: "limite_nota_convite",
      mensagem: `A nota do convite tem ${conteudo.length} caracteres; o LinkedIn aceita ${ctx.limiteNotaConvite} nesta conta.`,
    });
  }

  if (ctx.origem !== "humano" && ESCRITA_A_MAO.some((padrao) => padrao.test(normalizar(conteudo)))) {
    violacoes.push({ regra: "escrita_a_mao", mensagem: "Afirma que a mensagem foi escrita à mão. Não pode." });
  }

  if (ctx.praca === "canada" && ctx.tipo === "dm" && !temDescadastro(conteudo, ctx.frasesDescadastro ?? [])) {
    const exemplo = ctx.frasesDescadastro?.[0] ?? "or tell me to stop and I will";
    violacoes.push({
      regra: "descadastro",
      mensagem: `DM do Canadá precisa trazer a saída (ex.: "${exemplo}").`,
    });
  }

  if (ctx.origem === "ia") {
    if (ESCALADA_DE_CANAL.some((padrao) => padrao.test(normalizar(conteudo)))) {
      violacoes.push({
        regra: "escalada_canal",
        mensagem: "A IA puxou para WhatsApp, e-mail ou telefone. Isso só com convite explícito da pessoa.",
      });
    }
    if (!naRegua && url && (!ctx.linkDeAgenda || !conteudo.includes(ctx.linkDeAgenda))) {
      violacoes.push({ regra: "link_nao_permitido", mensagem: `A IA só pode mandar o link de agenda configurado (achei ${url}).` });
    }
  }

  return { ok: violacoes.length === 0, violacoes };
}
