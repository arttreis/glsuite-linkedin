import { z } from "zod";
import type { Publico } from "./publico";

const parametro = z.object({ id: z.string().regex(/^\d+$/), nome: z.string().min(1).max(160) });

/**
 * A busca do público no LinkedIn (§4.13), guardada na campanha e editável.
 * Cargos viram `advanced_keywords.title`; região e setor vão pelo id do
 * LinkedIn. Porte de empresa não tem filtro na busca clássica: fica para a
 * nota de aderência. `lista` é o filtro "Só nestas empresas" (SDR-59): com
 * ela, a busca roda por partes (`domain/lista-de-empresas.ts`). `parte` e
 * `cursor` são onde a última busca parou, para a próxima continuar dali;
 * `assinatura` é a da lista com que ela rodou; `esgotada` diz que o LinkedIn
 * já mostrou todo mundo que cabe nesses filtros. Os campos novos têm padrão:
 * busca salva antes deles continua valendo. Cargo só é obrigatório sem lista
 * (`faltaCargo`): com lista e sem cargo, a busca traz todo mundo das empresas.
 */
export const buscaDoPublico = z.object({
  cargos: z.array(z.string().min(1).max(80)).max(10),
  palavras: z.string().max(200),
  regioes: z.array(parametro).max(10),
  setores: z.array(parametro).max(10),
  lista: z.object({ id: z.uuid(), nome: z.string().min(1).max(120) }).nullable().default(null),
  parte: z.number().int().min(0).default(0),
  cursor: z.string().nullable(),
  assinatura: z.string().nullable().default(null),
  esgotada: z.boolean().default(false),
});
export type BuscaDoPublico = z.infer<typeof buscaDoPublico>;

/** Primeira versão da busca: os cargos do público. Região e setor o humano escolhe na lista do LinkedIn. */
export function buscaInicial(p: Publico): BuscaDoPublico {
  return { cargos: p.quem.cargos, palavras: "", regioes: [], setores: [], lista: null, parte: 0, cursor: null, assinatura: null, esgotada: false };
}

/** Sem lista de empresas, a busca precisa de pelo menos um cargo; com lista, cargo é opcional (SDR-121). */
export function faltaCargo(busca: Pick<BuscaDoPublico, "cargos" | "lista">): boolean {
  return busca.lista === null && busca.cargos.length === 0;
}

/** `"Head de E-commerce" OR "Diretor de E-commerce"`: qualquer um dos cargos. Sem cargo, vazio. */
export function cargoDaBusca(cargos: readonly string[]): string {
  return cargos.map((cargo) => `"${cargo.replaceAll('"', "")}"`).join(" OR ");
}

/** Mesma busca, sem olhar para onde ela parou: mudou o filtro, o cursor volta ao começo. */
export function mesmosFiltros(a: BuscaDoPublico, b: BuscaDoPublico): boolean {
  const filtros = (x: BuscaDoPublico) =>
    JSON.stringify([x.cargos, x.palavras.trim(), x.regioes.map((r) => r.id), x.setores.map((s) => s.id), x.lista?.id ?? null]);
  return filtros(a) === filtros(b);
}

/** Quanto a conta ainda pode buscar hoje (§4.3, D8). */
export function saldoDeBusca(buscadosHoje: number, tetoDoDia: number): number {
  return Math.max(0, tetoDoDia - buscadosHoje);
}

const COMPACTO = new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "long", maximumSignificantDigits: 2 });

/**
 * Quantas pessoas cabem na busca, no começo de uma frase da tela: "430
 * pessoas", "Cerca de 12 mil pessoas". A busca clássica pode parar a contagem
 * em mil [verificar com conta real], então mil vira "Mil ou mais pessoas".
 * Sem total, ou zero, não há frase.
 */
export function tamanhoDoPublico(total: number | null): string | null {
  if (total === null || total <= 0) return null;
  if (total === 1) return "1 pessoa";
  if (total < 1000) return `${total} pessoas`;
  if (total === 1000) return "Mil ou mais pessoas";
  const numero = COMPACTO.format(total);
  return `Cerca de ${numero}${/milh|bilh/.test(numero) ? " de" : ""} pessoas`;
}
