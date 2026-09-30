/**
 * Aceita só caminhos internos ("/inbox"), nunca URLs absolutas ou "//host",
 * para o parâmetro `proximo` não virar redirecionamento aberto.
 */
export function caminhoInternoSeguro(valor: string | null | undefined, padrao = "/"): string {
  if (!valor || !valor.startsWith("/") || valor.startsWith("//") || valor.startsWith("/\\")) {
    return padrao;
  }
  return valor;
}
