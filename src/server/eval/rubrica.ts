import type { Desfecho } from "@/server/agente/decidir";
import type { AcaoFinal, CasoDoEval } from "./dataset";
import type { Avaliacao } from "./juiz";

/** Rubrica da §7.1, na ordem do épico. */
export const CRITERIOS = ["validador", "acao", "sem_promessa", "reuniao_no_tempo", "tom"] as const;
export type Criterio = (typeof CRITERIOS)[number];

export const NOMES_DOS_CRITERIOS: Record<Criterio, string> = {
  validador: "Respeita o validador",
  acao: "Decide a ação certa",
  sem_promessa: "Não promete resultado nem número",
  reuniao_no_tempo: "Não pede reunião cedo demais",
  tom: "Tom de voz do perfil",
};

/**
 * Taxa mínima de acerto por critério para o eval da praça passar (gate do
 * automático, §7.1). Promessa de resultado não tem tolerância; tom tem mais
 * folga porque é o critério mais subjetivo.
 */
export const LIMIARES: Record<Criterio, number> = {
  validador: 0.95,
  acao: 0.9,
  sem_promessa: 1,
  reuniao_no_tempo: 0.95,
  tom: 0.8,
};

/** Nota de um critério num caso: passou ou não, nota de 0 a 1 e o porquê. null = não se aplica. */
export type NotaDoCriterio = { passou: boolean; nota: number; motivo: string } | null;
export type Notas = Record<Criterio, NotaDoCriterio>;

export function acaoFinal(desfecho: Desfecho): AcaoFinal {
  switch (desfecho.tipo) {
    case "optout":
      return "registrar_optout";
    case "sem_resposta":
      return "nenhuma";
    case "escalar":
      return "escalar_humano";
    case "rascunho":
      return desfecho.decisao.acao;
  }
}

/** A conversa fica com um humano: escalada, ou rascunho com exceção (não sai sozinho no automático). */
export function vaiParaHumano(desfecho: Desfecho): boolean {
  return desfecho.tipo === "escalar" || (desfecho.tipo === "rascunho" && desfecho.excecao !== null);
}

export function textoDoDesfecho(desfecho: Desfecho): string | null {
  return desfecho.tipo === "rascunho" ? desfecho.texto : null;
}

// Percentual é sempre afirmação de desempenho nesta conversa; o resto fica com o juiz.
const PERCENTUAL = /\d\s?%/u;

const binaria = (passou: boolean, motivo: string): NotaDoCriterio => ({ passou, nota: passou ? 1 : 0, motivo });

/**
 * Notas de um caso. Validador e ação saem por regra; promessa, reunião e tom
 * usam o juiz, com uma checagem por regra por cima (percentual, link de agenda
 * ou proposta de reunião sem interesse reprovam sem depender dele). Sem texto,
 * só a ação é avaliada.
 */
export function avaliarCaso(caso: CasoDoEval, desfecho: Desfecho, juiz: Avaliacao | null): Notas {
  const acao = acaoFinal(desfecho);
  const humano = vaiParaHumano(desfecho);
  const acaoOk = caso.esperado.acoes.includes(acao) && (!caso.esperado.humano || humano);
  const notas: Notas = {
    validador: null,
    acao: binaria(
      acaoOk,
      acaoOk
        ? `${acao}${humano ? " (com humano)" : ""}`
        : `decidiu ${acao}${humano ? " (com humano)" : ""}; esperado ${caso.esperado.acoes.join(" ou ")}${caso.esperado.humano ? " com humano" : ""}`,
    ),
    sem_promessa: null,
    reuniao_no_tempo: null,
    tom: null,
  };

  const texto = textoDoDesfecho(desfecho);
  if (desfecho.tipo !== "rascunho" || !texto) return notas;

  const violacoes = desfecho.validacao?.violacoes ?? [];
  notas.validador = binaria(violacoes.length === 0, violacoes.map((v) => v.mensagem).join(" ") || "ok");

  const link = caso.entrada.linkDeAgenda;
  const reuniaoPorRegra = acao === "propor_reuniao" || (link !== null && texto.includes(link));
  if (!caso.esperado.reuniao && reuniaoPorRegra) {
    notas.reuniao_no_tempo = binaria(false, "propôs reunião ou mandou o link sem interesse real");
  } else if (juiz) {
    notas.reuniao_no_tempo = binaria(!juiz.reuniao_cedo.violou, juiz.reuniao_cedo.motivo);
  }

  if (PERCENTUAL.test(texto)) {
    notas.sem_promessa = binaria(false, "cita percentual");
  } else if (juiz) {
    notas.sem_promessa = binaria(!juiz.promete_resultado.violou, juiz.promete_resultado.motivo);
  }

  if (juiz) {
    notas.tom = { passou: juiz.tom.nota >= 4, nota: (juiz.tom.nota - 1) / 4, motivo: `${juiz.tom.nota}/5: ${juiz.tom.motivo}` };
  }
  return notas;
}
