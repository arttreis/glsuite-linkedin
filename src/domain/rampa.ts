import { Temporal } from "temporal-polyfill";

/**
 * Teto por perfil (§4.3): o LinkedIn conta ações por conta, então o saldo soma
 * tudo o que o perfil faz, em todas as campanhas.
 */

export type EtapaDaRampa = { semana: number; convites_dia: number; dms_dia: number };
export type LimitesDoDia = { convitesDia: number; dmsDia: number };

/** "Semana 1" conta a partir da ativação do perfil no sistema. */
export function semanaDesdeAtivacao(dataDeAtivacao: string, hoje: string): number {
  const dias = Temporal.PlainDate.from(dataDeAtivacao).until(Temporal.PlainDate.from(hoje), { largestUnit: "days" }).days;
  return Math.max(1, Math.floor(dias / 7) + 1);
}

/** A etapa de maior semana que já começou; a última vale para "3+". */
export function limitesDaSemana(rampa: readonly EtapaDaRampa[], semana: number): LimitesDoDia {
  const ordenada = [...rampa].sort((a, b) => a.semana - b.semana);
  const etapa = ordenada.filter((e) => e.semana <= semana).at(-1) ?? ordenada[0];
  if (!etapa) return { convitesDia: 0, dmsDia: 0 };
  return { convitesDia: etapa.convites_dia, dmsDia: etapa.dms_dia };
}

export type Contagem = { convitesHoje: number; dmsHoje: number; convitesUltimos7Dias: number };

/**
 * Quanto ainda cabe agora. O teto semanal é uma janela móvel de 7 dias (mais
 * conservadora que a semana do calendário, e é como o LinkedIn conta).
 */
export function calcularSaldo(limites: LimitesDoDia, tetoSemanal: number, contagem: Contagem): { convites: number; dms: number } {
  return {
    convites: Math.max(0, Math.min(limites.convitesDia - contagem.convitesHoje, tetoSemanal - contagem.convitesUltimos7Dias)),
    dms: Math.max(0, limites.dmsDia - contagem.dmsHoje),
  };
}
