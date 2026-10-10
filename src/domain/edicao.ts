import type { z } from "zod";

const emBranco = (item: unknown) =>
  item === "" ||
  (item !== null &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    Object.entries(item).every(([chave, valor]) => chave === "tipo" || valor === "" || valor === null));

/**
 * O que um editor do painel manda (dossiê, público), arrumado antes de
 * validar: textos sem espaço nas pontas, item de lista em branco descartado e
 * fonte vazia como null. Item em branco é o "adicionar" que ninguém
 * preencheu, não um erro.
 */
export function limparEdicao(entrada: unknown): unknown {
  if (typeof entrada === "string") return entrada.trim();
  if (Array.isArray(entrada)) return entrada.map(limparEdicao).filter((item) => !emBranco(item));
  if (entrada !== null && typeof entrada === "object") {
    const limpo = Object.fromEntries(Object.entries(entrada).map(([chave, valor]) => [chave, limparEdicao(valor)]));
    if (limpo.fonte_url === "") limpo.fonte_url = null;
    return limpo;
  }
  return entrada;
}

export type RotulosDaEdicao = { secoes: Record<string, string>; campos: Record<string, string> };

/** O primeiro problema da validação, numa frase para quem editou: seção, item e campo. */
export function explicarErroDeEdicao(erro: z.ZodError, rotulos: RotulosDaEdicao): string {
  const issue = erro.issues[0];
  if (!issue) return "Há um campo inválido.";
  const [secao, indice, campo] = issue.path;
  const partes = [rotulos.secoes[String(secao)] ?? String(secao)];
  if (typeof indice === "number") partes.push(`item ${indice + 1}`);
  else if (typeof indice === "string") partes.push(rotulos.campos[indice] ?? indice);
  if (typeof campo === "string") partes.push(rotulos.campos[campo] ?? campo);
  const onde = partes.join(", ");

  if (issue.code === "too_small") {
    if (issue.origin === "array") return `${onde}: precisa de pelo menos ${issue.minimum}.`;
    return `${onde}: não pode ficar em branco.`;
  }
  if (issue.code === "too_big") {
    if (issue.origin === "array") return `${onde}: no máximo ${issue.maximum}.`;
    return `${onde}: passou de ${issue.maximum} caracteres.`;
  }
  return `${onde}: valor inválido.`;
}
