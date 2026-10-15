import { z } from "zod";
import { sdrDaIa } from "./sdr";

/** As ações do agente (§7), como aparecem no chat de teste. */
export type AcaoDoSdr = "responder" | "propor_reuniao" | "encerrar" | "registrar_optout" | "escalar_humano";

/**
 * Um item do chat de teste (§4.3): a mensagem do SDR, a do lead (a pessoa no
 * papel de lead) ou uma nota do Kakou (o que aconteceria na produção, um ajuste
 * feito, um ajuste recusado).
 */
export type ItemDoTeste =
  | {
      id: string;
      tipo: "sdr";
      texto: string;
      em: string;
      acao: AcaoDoSdr;
      /** Na produção, esta resposta não sairia sozinha: o motivo. */
      aviso: string | null;
    }
  | { id: string; tipo: "lead"; texto: string; em: string }
  | { id: string; tipo: "nota"; nota: "desfecho" | "ajuste" | "recusa" | "desfeito"; texto: string; em: string; versao?: number };

/** O que a IA devolve num ajuste: o SDR inteiro de novo, o resumo do que mudou ou a recusa. */
export const ajusteDoSdr = z.object({
  sdr: sdrDaIa,
  resumo: z.string().min(1).max(200),
  /** Preenchida quando o pedido contraria uma regra da casa: nada muda. */
  recusa: z.string().min(1).max(300).nullable(),
});
export type AjusteDoSdr = z.infer<typeof ajusteDoSdr>;

/**
 * As regras da casa (§4.3) em uma linha cada, para o ajuste saber o que não se
 * negocia. As completas estão no prompt do agente.
 */
export const REGRAS_DA_CASA = [
  "no máximo 30 palavras por mensagem, numa linha só",
  "no máximo uma pergunta por mensagem e duas na conversa inteira",
  "sem travessão nem meia-risca",
  "sem palavras vazias (impressionado, inspirador, admiro, adoro, fascinante, notei)",
  "sem frase de efeito: a primeira mensagem termina com uma pergunta fácil de responder",
  "sem prometer resultado nem número",
  "sem levar a conversa para WhatsApp, e-mail ou telefone, a não ser que a pessoa peça",
  "nunca dizer que escreveu à mão ou que não é um robô",
  "dizer a verdade sobre de onde veio o contato: o perfil público no LinkedIn",
  "nunca criticar concorrente pelo nome",
  "nenhum link, a não ser o de agenda, e só depois que a pessoa aceitou conversar",
] as const;

/** O tipo de lead que a pessoa faz no teste, quando a análise não tem segmentos. */
export const SEGMENTO_PADRAO = "Um cliente típico";

/**
 * A nota que o chat mostra sobre o que aconteceria na produção, quando não é
 * uma resposta comum. Resposta com ressalva (preço, validador) leva a ressalva
 * no próprio balão (`aviso`), não aqui.
 */
export function notaDoDesfecho(
  desfecho: { tipo: "optout" } | { tipo: "sem_resposta" } | { tipo: "escalar"; motivo: string } | { tipo: "rascunho"; acao: AcaoDoSdr },
  nome: string,
): string | null {
  if (desfecho.tipo === "optout") return "Aqui o SDR registraria o opt-out: nunca mais falaria com essa pessoa.";
  if (desfecho.tipo === "sem_resposta") return "Resposta automática de ausência: o SDR não responderia.";
  if (desfecho.tipo === "escalar") return `Aqui o SDR pararia e chamaria ${nome}: ${desfecho.motivo}.`;
  if (desfecho.acao === "encerrar") return "O SDR encerraria a conversa aqui.";
  return null;
}

/** O nome do lead que a pessoa faz no teste, no idioma da análise. */
export function nomeDoLeadDeTeste(idioma: "pt" | "en" | "es"): string {
  return { pt: "Marina", en: "Sarah", es: "Lucía" }[idioma];
}
