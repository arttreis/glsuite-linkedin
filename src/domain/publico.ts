import { z } from "zod";
import type { Dossie } from "./dossie";
import { explicarErroDeEdicao } from "./edicao";

const quem = z.object({
  cargos: z.array(z.string().min(1).max(80)).min(1).max(10),
  senioridade: z.string().max(200),
});

const empresa = z.object({
  setores: z.array(z.string().min(1).max(80)).max(8),
  porte: z.string().max(200),
  regiao: z.string().min(1).max(200),
});

const porQue = z.object({
  dor: z.string().min(1).max(400),
  gatilho: z.string().max(400),
  resultado: z.string().min(1).max(400),
});

/**
 * Público (§4.12): uma hipótese de venda, quem compra e por quê. O dossiê é
 * fato do site; o público é interpretação. Pode dizer por que alguém precisa,
 * mas prova só vem do dossiê.
 */
export const publico = z.object({
  nome: z.string().min(1).max(80),
  quem,
  empresa,
  por_que: porQue,
  angulo: z.string().min(1).max(300),
  /** Textos de provas do dossiê confirmado. */
  provas: z.array(z.string().min(1).max(300)).max(12),
  quem_nao_e: z.string().max(400),
});
export type Publico = z.infer<typeof publico>;

/**
 * Quanto o público se encaixa na oferta pelo que o dossiê mostra, de 0 a 100,
 * com o motivo numa frase. É julgamento da IA, não tamanho de mercado nem
 * chance de fechar. Só a sugestão tem: o público editado por um humano perde.
 */
export type Aderencia = { nota: number; motivo: string };

/**
 * O que a IA devolve: o mesmo público, com as provas pelo número da lista do
 * dossiê (assim ela não tem como escrever uma prova que não está lá) e a
 * aderência.
 */
export const sugestaoDePublicos = z.object({
  publicos: z.array(
    publico.omit({ provas: true }).extend({
      provas: z.array(z.number().int()),
      aderencia: z.object({ nota: z.number().int(), motivo: z.string() }),
    }),
  ),
});
export type SugestaoDePublicos = z.infer<typeof sugestaoDePublicos>;

export const MAX_SUGESTOES = 5;

export type PublicoSugerido = Publico & { aderencia: Aderencia | null };

/** Nota fora de 0 a 100 ou sem motivo não vale: o público fica sem aderência, mas fica. */
function aderenciaValida(aderencia: { nota: number; motivo: string }): Aderencia | null {
  const motivo = aderencia.motivo.trim();
  const { nota } = aderencia;
  return Number.isInteger(nota) && nota >= 0 && nota <= 100 && motivo ? { nota, motivo: motivo.slice(0, 300) } : null;
}

/**
 * Converte a sugestão da IA em públicos: as provas viram os textos do dossiê
 * (número fora da lista é ignorado), e sai o que não cabe no esquema ou cai
 * numa praça sem conta da organização. No máximo 5.
 */
export function publicosDaSugestao(
  sugestao: SugestaoDePublicos,
  d: Dossie,
): { publicos: PublicoSugerido[]; descartados: number } {
  const publicos: PublicoSugerido[] = [];
  let descartados = 0;
  for (const item of sugestao.publicos) {
    const provas = [...new Set(item.provas)].flatMap((n) => (d.provas[n] ? [d.provas[n].texto] : []));
    const lido = publico.safeParse({ ...item, provas });
    if (!lido.success || publicos.length >= MAX_SUGESTOES) {
      descartados++;
      continue;
    }
    publicos.push({ ...lido.data, aderencia: aderenciaValida(item.aderencia) });
  }
  return { publicos, descartados };
}

/** Provas do público que não estão no dossiê confirmado. Tem que ser vazio para salvar. */
export function provasForaDoDossie(p: Publico, d: Dossie): string[] {
  const doDossie = new Set(d.provas.map((prova) => prova.texto));
  return p.provas.filter((prova) => !doDossie.has(prova));
}

const SECOES: Record<string, string> = {
  nome: "Nome",
  quem: "Quem",
  empresa: "Empresa",
  por_que: "Por que precisa",
  angulo: "Ângulo",
  provas: "Provas",
  quem_nao_e: "Quem não é",
};

const CAMPOS: Record<string, string> = {
  cargos: "cargos",
  senioridade: "senioridade",
  setores: "setores",
  porte: "porte",
  regiao: "região",
  dor: "dor",
  gatilho: "gatilho",
  resultado: "resultado",
};

/** O primeiro problema da validação do público, numa frase para quem editou. */
export const explicarErroDoPublico = (erro: z.ZodError) => explicarErroDeEdicao(erro, { secoes: SECOES, campos: CAMPOS });
