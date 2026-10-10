/**
 * Domínios de e-mail liberados para o primeiro acesso (§4.1), a partir do texto
 * da variável `CADASTRO_DOMINIOS`: separados por vírgula ou espaço, sem `@`,
 * em minúsculas.
 */
export function lerDominiosLiberados(texto: string | undefined): string[] {
  return [
    ...new Set(
      (texto ?? "")
        .split(/[\s,]+/)
        .map((dominio) => dominio.trim().toLowerCase().replace(/^@/, ""))
        .filter((dominio) => dominio.length > 0),
    ),
  ];
}

/** O e-mail é de um domínio liberado? Subdomínio não vale: só o domínio exato. */
export function emailLiberado(email: string, dominios: readonly string[]): boolean {
  const arroba = email.lastIndexOf("@");
  if (arroba <= 0) return false;
  return dominios.includes(email.slice(arroba + 1).trim().toLowerCase());
}

/**
 * Nome de quem entra pela primeira vez, tirado do e-mail
 * ("arthur.reis@..." vira "Arthur Reis"). A pessoa troca depois.
 */
export function nomeDoEmail(email: string): string {
  const local = email.slice(0, Math.max(email.indexOf("@"), 0)) || email;
  const nome = local
    .split(/[._+-]+/)
    .filter((parte) => parte.length > 0)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
    .join(" ");
  return nome.length >= 2 ? nome.slice(0, 80) : "Sem nome";
}
