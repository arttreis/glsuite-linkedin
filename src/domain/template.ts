import { nomeDeEmpresa } from "./texto";

/** A copy aprovada usa só estes dois tokens (§4.1). */
export const TOKENS_PERMITIDOS = ["first_name", "company"] as const;
export type Token = (typeof TOKENS_PERMITIDOS)[number];
export type ValoresDoTemplate = Record<Token, string | null | undefined>;

const PADRAO_TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function tokensDoTemplate(template: string): string[] {
  return [...template.matchAll(PADRAO_TOKEN)].map((achado) => achado[1]!);
}

export function tokensDesconhecidos(template: string): string[] {
  return tokensDoTemplate(template).filter((token) => !(TOKENS_PERMITIDOS as readonly string[]).includes(token));
}

export type Renderizacao = { ok: true; texto: string } | { ok: false; erro: string };

/**
 * Troca `{{first_name}}` e `{{company}}` pelos valores do lead. Token
 * desconhecido ou valor faltando não vira texto pela metade: devolve erro, e a
 * ação vai para revisão. Empresa em caixa alta entra com a inicial maiúscula.
 */
export function renderizarTemplate(template: string, valores: ValoresDoTemplate): Renderizacao {
  const desconhecidos = tokensDesconhecidos(template);
  if (desconhecidos.length > 0) {
    return { ok: false, erro: `Variável não permitida: {{${desconhecidos[0]}}}. Use só {{first_name}} e {{company}}.` };
  }
  let faltando: string | null = null;
  const texto = template.replace(PADRAO_TOKEN, (_trecho, token: Token) => {
    const valor = token === "company" ? nomeDeEmpresa(valores.company) : valores[token]?.trim();
    if (!valor) faltando ??= token;
    return valor ?? "";
  });
  if (faltando) return { ok: false, erro: `O lead não tem {{${faltando}}} para preencher o template.` };
  return { ok: true, texto: texto.trim() };
}
