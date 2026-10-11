import { z } from "zod";
import type { ContextoDoPerfil } from "./campanha";
import { fluxoPadrao, validarCopyDoFluxo, validarFluxo, type Fluxo } from "./fluxo";
import type { ValoresDoTemplate } from "./template";
import type { Praca } from "./validador";

/**
 * O que a IA escreve para o fluxo do público (§4.14): a nota do convite e as
 * três mensagens da régua, na ordem. A forma do fluxo é a padrão da praça.
 */
export const textosDoFluxo = z.object({
  convite: z.string(),
  mensagens: z.array(z.string()),
  motivo: z.string(),
});
export type TextosDoFluxo = z.infer<typeof textosDoFluxo>;

/**
 * casa: a régua da casa (DM 1 sem pergunta, DM 2 com uma pergunta fácil).
 * pergunta: a variante do prompt de referência, com uma pergunta curta que
 * faz pensar já na DM 1 (§4.14).
 */
export type EstiloDoFluxo = "casa" | "pergunta";

const MENSAGENS = ["T2", "T3", "T4"] as const;

/** O fluxo padrão com os textos gerados. */
export function fluxoComTextos(praca: Praca, textos: TextosDoFluxo): Fluxo {
  const padrao = fluxoPadrao(praca);
  return {
    ...padrao,
    nodes: padrao.nodes.map((node) => {
      if (node.tipo === "convite") return { ...node, template: textos.convite.trim() };
      if (node.tipo !== "mensagem") return node;
      const texto = textos.mensagens[MENSAGENS.indexOf(node.id as (typeof MENSAGENS)[number])]?.trim() ?? "";
      return { ...node, template: texto };
    }),
  };
}

const NUMERO = /\d+(?:[.,]\d+)*\s?%?/g;

/** Números que o texto cita (12%, 40 lojas, 3,5) e que nenhuma prova traz: a IA não pode inventar resultado. */
export function numerosForaDasProvas(texto: string, provas: readonly string[]): string[] {
  const citados = [...texto.matchAll(NUMERO)].map((achado) => achado[0].replace(/\s/g, ""));
  return [...new Set(citados)].filter((numero) => !provas.some((prova) => prova.replace(/\s/g, "").includes(numero)));
}

/** Por bloco de texto do fluxo, os números fora das provas do público. */
export function problemasDeProvas(fluxo: Fluxo, provas: readonly string[]): { toque: string; mensagem: string }[] {
  return fluxo.nodes.flatMap((node) => {
    const texto = node.tipo === "convite" || node.tipo === "mensagem" ? node.template : node.tipo === "tarefa" ? node.roteiro : "";
    const fora = numerosForaDasProvas(texto, provas);
    return fora.length > 0 ? [{ toque: node.id, mensagem: `Cita ${fora.join(", ")}, que não está nas provas do público.` }] : [];
  });
}

export type ProblemaDoTexto = { toque: string; mensagem: string };

/**
 * Tudo o que impede o fluxo gerado de ativar: forma do fluxo, convite vazio,
 * cada violação do validador (§4.2) e número fora das provas do público. A
 * reescrita recebe esta lista; o que sobrar chega marcado ao editor.
 */
export function problemasDoFluxoGerado(
  fluxo: Fluxo,
  perfil: ContextoDoPerfil,
  exemplo: ValoresDoTemplate,
  provas: readonly string[],
): ProblemaDoTexto[] {
  const forma = validarFluxo(fluxo).map((p) => ({ toque: p.nodeId ?? "fluxo", mensagem: p.mensagem }));
  const convite = fluxo.nodes.some((n) => n.tipo === "convite" && n.template.trim() === "")
    ? [{ toque: "T1", mensagem: "O convite ficou sem texto." }]
    : [];
  const copy = validarCopyDoFluxo(fluxo, perfil, exemplo).flatMap((p) => p.violacoes.map((v) => ({ toque: p.toque, mensagem: v.mensagem })));
  return [...forma, ...convite, ...copy, ...problemasDeProvas(fluxo, provas)];
}
