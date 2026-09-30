import { z } from "zod";
import { montarRelatorio, type Relatorio } from "./relatorio";
import type { Execucao } from "./rodada";
import type { Criterio, NotaDoCriterio } from "./rubrica";

/**
 * Revisão humana de uma rodada (§7.1: "a revisão humana calibra a primeira
 * rodada"). A pessoa preenche, por execução, os critérios do juiz em que
 * discorda ou que quer confirmar. A nota humana substitui a do juiz no
 * veredito, e a concordância juiz × humano diz se dá para confiar no juiz nas
 * rodadas seguintes.
 */
export const CRITERIOS_DO_JUIZ = ["sem_promessa", "reuniao_no_tempo", "tom"] as const satisfies readonly Criterio[];
type CriterioDoJuiz = (typeof CRITERIOS_DO_JUIZ)[number];

const revisaoDaExecucao = z.object({
  /** O texto passa no critério? null ou ausente = não revisado. */
  sem_promessa: z.boolean().nullable().optional(),
  reuniao_no_tempo: z.boolean().nullable().optional(),
  /** Nota de 1 a 5, como a do juiz. */
  tom: z.number().int().min(1).max(5).nullable().optional(),
  comentario: z.string().optional(),
});
export const revisao = z.record(z.string(), revisaoDaExecucao);
export type Revisao = z.infer<typeof revisao>;

export const chaveDaExecucao = (e: Pick<Execucao, "caso" | "repeticao">) => `${e.caso}#${e.repeticao}`;

/** Modelo de revisão: uma entrada por execução com texto, tudo em branco, com o texto e a nota do juiz para ler. */
export function modeloDeRevisao(execucoes: readonly Execucao[]): Record<string, Record<string, unknown>> {
  const modelo: Record<string, Record<string, unknown>> = {};
  for (const e of execucoes.filter((e) => e.texto)) {
    modelo[chaveDaExecucao(e)] = {
      _texto: e.texto,
      _juiz: Object.fromEntries(CRITERIOS_DO_JUIZ.map((c) => [c, e.notas?.[c]?.motivo ?? null])),
      sem_promessa: null,
      reuniao_no_tempo: null,
      tom: null,
      comentario: "",
    };
  }
  return modelo;
}

export type Concordancia = Record<CriterioDoJuiz, { revisadas: number; concordantes: number; taxa: number | null }>;

function notaHumana(criterio: CriterioDoJuiz, valor: boolean | number): NotaDoCriterio {
  if (criterio === "tom") {
    const nota = valor as number;
    return { passou: nota >= 4, nota: (nota - 1) / 4, motivo: `${nota}/5 (revisão humana)` };
  }
  const passou = valor as boolean;
  return { passou, nota: passou ? 1 : 0, motivo: "revisão humana" };
}

/**
 * Aplica a revisão: devolve o relatório recalculado com as notas humanas e a
 * concordância com o juiz (só onde o juiz também deu nota).
 */
export function aplicarRevisao(relatorio: Relatorio, dados: Revisao, agora: Date): { relatorio: Relatorio; concordancia: Concordancia } {
  const concordancia = Object.fromEntries(
    CRITERIOS_DO_JUIZ.map((c) => [c, { revisadas: 0, concordantes: 0, taxa: null }]),
  ) as Concordancia;

  const execucoes = relatorio.execucoes.map((e): Execucao => {
    const revisada = dados[chaveDaExecucao(e)];
    if (!revisada || !e.notas) return e;
    const notas = { ...e.notas };
    for (const criterio of CRITERIOS_DO_JUIZ) {
      const valor = revisada[criterio];
      if (valor === null || valor === undefined) continue;
      const humana = notaHumana(criterio, valor);
      const doJuiz = notas[criterio];
      if (doJuiz) {
        concordancia[criterio].revisadas += 1;
        if (doJuiz.passou === humana!.passou) concordancia[criterio].concordantes += 1;
      }
      notas[criterio] = humana;
    }
    return { ...e, notas };
  });

  for (const c of CRITERIOS_DO_JUIZ) {
    const { revisadas, concordantes } = concordancia[c];
    concordancia[c].taxa = revisadas > 0 ? concordantes / revisadas : null;
  }

  return {
    relatorio: montarRelatorio({
      execucoes,
      versaoDosPrompts: relatorio.versaoDosPrompts,
      versaoDoJuiz: relatorio.versaoDoJuiz,
      modelos: relatorio.modelos,
      repeticoes: relatorio.repeticoes,
      agora,
    }),
    concordancia,
  };
}
