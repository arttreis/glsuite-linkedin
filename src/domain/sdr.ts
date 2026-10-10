import { z } from "zod";
import { explicarErroDeEdicao } from "./edicao";

/**
 * O SDR da organização (§4.3): como ela conversa no LinkedIn. Nasce da análise
 * do site confirmada, ganha versão a cada ajuste e é ele que o agente usa no
 * lugar da voz e das regras do perfil. As regras da casa ficam por cima e não
 * moram aqui: nenhum SDR desliga uma delas.
 */
export const sdr = z.object({
  /** O que conta como sucesso, ex.: "marcar 20 minutos com o Arthur". */
  objetivo: z.string().min(1).max(300),
  voz: z.string().min(1).max(600),
  /** O jeito da primeira mensagem depois do convite aceito. */
  abertura: z.string().min(1).max(400),
  /** Sinais e perguntas que mostram que o lead serve. */
  qualificacao: z.array(z.string().min(1).max(200)).max(6),
  objecoes: z.array(z.object({ objecao: z.string().min(1).max(200), resposta: z.string().min(1).max(300) })).max(8),
  /** As regras da pessoa ("não falo de preço por mensagem"). */
  regras: z.array(z.string().min(1).max(200)).max(12),
  /** O que faz o SDR parar e passar a conversa para a pessoa. */
  quando_chamar_voce: z.array(z.string().min(1).max(200)).max(8),
  /** Vai só depois que o lead aceitar conversar. Quem preenche é a pessoa, nunca a IA. */
  link_agenda: z.url({ protocol: /^https$/ }).nullable(),
});
export type Sdr = z.infer<typeof sdr>;

/** O que a IA devolve ao gerar o SDR: tudo menos o link de agenda, que ela não tem como saber. */
export const sdrDaIa = sdr.omit({ link_agenda: true });
export type SdrDaIa = z.infer<typeof sdrDaIa>;

const SECOES: Record<string, string> = {
  objetivo: "Objetivo",
  voz: "Voz",
  abertura: "Abertura",
  qualificacao: "Qualificação",
  objecoes: "Objeções",
  regras: "Regras",
  quando_chamar_voce: "Quando chamar você",
  link_agenda: "Link de agenda",
};

const CAMPOS: Record<string, string> = { objecao: "objeção", resposta: "resposta" };

/** O primeiro problema da validação do SDR, numa frase para quem editou. */
export const explicarErroDoSdr = (erro: z.ZodError) => explicarErroDeEdicao(erro, { secoes: SECOES, campos: CAMPOS });

const lista = (itens: readonly string[]) => itens.map((item) => `- ${item}`).join("\n");

/**
 * O SDR como bloco do prompt de sistema do agente (§7). Estável para a mesma
 * versão: o prompt vai para o cache.
 */
export function textoDoSdr(s: Sdr, nome: string): string {
  const partes = [
    `Objetivo: ${s.objetivo}`,
    `Voz de ${nome}:\n${s.voz}`,
    `Como ${nome} abre a conversa: ${s.abertura}`,
    s.qualificacao.length > 0 ? `O que mostra que o lead serve:\n${lista(s.qualificacao)}` : null,
    s.objecoes.length > 0
      ? `Objeções e como ${nome} responde:\n${s.objecoes.map((o) => `- "${o.objecao}": ${o.resposta}`).join("\n")}`
      : null,
    s.regras.length > 0 ? `Regras de ${nome}:\n${lista(s.regras)}` : null,
    s.quando_chamar_voce.length > 0
      ? `Quando parar e passar a conversa para ${nome} (use escalar_humano):\n${lista(s.quando_chamar_voce)}`
      : null,
  ];
  return partes.filter((parte): parte is string => parte !== null).join("\n\n");
}
