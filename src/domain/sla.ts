import { somarHorasUteis, somarUmDiaUtil, type Feriados, type Janela } from "./calendario";
import { HORAS_ATE_O_LEMBRETE } from "./passagem";

/**
 * Os prazos de uma conversa que o SDR passou e ninguém respondeu (SDR-66): o
 * lembrete em 4 horas úteis e o aviso ao admin em 1 dia útil, nunca antes do
 * lembrete. Fora de `passagem.ts` porque aquele arquivo vai para o navegador.
 */
export function prazosDaPassagem(p: { passadaEm: Date; fuso: string; janela: Janela; feriados: Feriados }): { lembrete: Date; admin: Date } {
  const lembrete = somarHorasUteis(p.passadaEm, HORAS_ATE_O_LEMBRETE, p.fuso, p.janela, p.feriados);
  const admin = somarUmDiaUtil(p.passadaEm, p.fuso, p.janela, p.feriados);
  return { lembrete, admin: admin.getTime() < lembrete.getTime() ? lembrete : admin };
}

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
