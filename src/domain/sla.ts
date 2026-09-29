import { somarHorasUteis, type Feriados, type Janela } from "./calendario";

/**
 * SLA de resposta (§4.6): quem respondeu recebe retorno em até 4 horas úteis no
 * fuso do perfil. O relógio começa na mensagem da pessoa que ainda não teve
 * retorno e para quando alguém da casa responde.
 */
export type EstadoDoSla =
  | { tipo: "respondida" }
  | { tipo: "no_prazo"; venceEm: Date }
  | { tipo: "estourado"; venceuEm: Date };

export function estadoDoSla(p: {
  ultimaEntrada: Date | null;
  ultimaSaida: Date | null;
  agora: Date;
  horas: number;
  fuso: string;
  janela: Janela;
  feriados: Feriados;
}): EstadoDoSla | null {
  if (!p.ultimaEntrada) return null;
  if (p.ultimaSaida && p.ultimaSaida.getTime() > p.ultimaEntrada.getTime()) return { tipo: "respondida" };
  const vence = somarHorasUteis(p.ultimaEntrada, p.horas, p.fuso, p.janela, p.feriados);
  return p.agora.getTime() < vence.getTime() ? { tipo: "no_prazo", venceEm: vence } : { tipo: "estourado", venceuEm: vence };
}
