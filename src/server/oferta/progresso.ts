/** Tamanho do trecho de cada página que a tela mostra enquanto a IA lê. */
export const TAMANHO_DO_TRECHO = 120;

const limparLinha = (linha: string) =>
  linha
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // imagem
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // link: fica o texto
    .replace(/^\s*(?:[#>*+|-]+|\d+[.)])\s*/, "") // título, citação, item de lista
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Linha que parece frase: comprida, com várias palavras e sem cara de tabela ou menu. */
const pareceFrase = (linha: string) => linha.length >= 40 && linha.split(" ").length >= 6 && !linha.includes("|");

/**
 * Um trecho do texto da página para a tela mostrar o que a IA está lendo: a
 * primeira linha com cara de frase, sem a marcação, cortada numa palavra.
 * Página sem frase (só menu, PDF, vazia) fica sem trecho.
 */
export function trechoDaPagina(texto: string): string | null {
  const frase = texto.split(/\r?\n/).map(limparLinha).find(pareceFrase);
  if (!frase) return null;
  if (frase.length <= TAMANHO_DO_TRECHO) return frase;
  const corte = frase.slice(0, TAMANHO_DO_TRECHO - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > TAMANHO_DO_TRECHO / 2 ? corte.slice(0, espaco) : corte).replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * Se o JSON da análise, ainda chegando, já abriu a chave do Mercado. O Mercado
 * é a última parte do formato: quando ela começa, Negócio e Produto saíram.
 * A chave escrita dentro de um texto vem com a aspa escapada e não conta.
 */
export const comecouOMercado = (parcial: string): boolean => /(^|[^\\])"mercado"\s*:/.test(parcial);
