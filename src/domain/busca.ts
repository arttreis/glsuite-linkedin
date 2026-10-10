import { z } from "zod";
import type { Publico } from "./publico";

const parametro = z.object({ id: z.string().regex(/^\d+$/), nome: z.string().min(1).max(160) });

/**
 * A busca do público no LinkedIn (§4.13), guardada na campanha e editável.
 * Cargos viram `advanced_keywords.title`; região e setor vão pelo id do
 * LinkedIn. Porte de empresa não tem filtro na busca clássica: fica para a
 * nota de aderência. `cursor` é onde a última busca parou, para a próxima
 * continuar dali; `esgotada` diz que o LinkedIn já mostrou todo mundo que
 * cabe nesses filtros.
 */
export const buscaDoPublico = z.object({
  cargos: z.array(z.string().min(1).max(80)).min(1).max(10),
  palavras: z.string().max(200),
  regioes: z.array(parametro).max(10),
  setores: z.array(parametro).max(10),
  cursor: z.string().nullable(),
  esgotada: z.boolean().default(false),
});
export type BuscaDoPublico = z.infer<typeof buscaDoPublico>;

/** Primeira versão da busca: os cargos do público. Região e setor o humano escolhe na lista do LinkedIn. */
export function buscaInicial(p: Publico): BuscaDoPublico {
  return { cargos: p.quem.cargos, palavras: "", regioes: [], setores: [], cursor: null, esgotada: false };
}

/** `"Head de E-commerce" OR "Diretor de E-commerce"`: qualquer um dos cargos. */
export function cargoDaBusca(cargos: readonly string[]): string {
  return cargos.map((cargo) => `"${cargo.replaceAll('"', "")}"`).join(" OR ");
}

/** Mesma busca, sem olhar para onde ela parou: mudou o filtro, o cursor volta ao começo. */
export function mesmosFiltros(a: BuscaDoPublico, b: BuscaDoPublico): boolean {
  const filtros = (x: BuscaDoPublico) =>
    JSON.stringify([x.cargos, x.palavras.trim(), x.regioes.map((r) => r.id), x.setores.map((s) => s.id)]);
  return filtros(a) === filtros(b);
}

/** Quanto a conta ainda pode buscar hoje (§4.3, D8). */
export function saldoDeBusca(buscadosHoje: number, tetoDoDia: number): number {
  return Math.max(0, tetoDoDia - buscadosHoje);
}
