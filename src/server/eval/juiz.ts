import { z } from "zod";
import { renderizarHistorico, VOZ_PADRAO } from "@/server/agente/prompts";
import type { Resposta } from "@/server/agente/modelo";
import type { CasoDoEval } from "./dataset";

/**
 * Juiz do eval (§7.1): lê a resposta do agente e dá nota nos critérios que
 * pedem leitura (promessa, reunião cedo, tom). Os critérios que dão para
 * checar por regra (validador, ação certa) não passam por ele.
 */
export const avaliacao = z.object({
  promete_resultado: z.object({ violou: z.boolean(), motivo: z.string() }),
  reuniao_cedo: z.object({ violou: z.boolean(), motivo: z.string() }),
  tom: z.object({ nota: z.number().int().min(1).max(5), motivo: z.string() }),
});
export type Avaliacao = z.infer<typeof avaliacao>;

export interface Juiz {
  avaliar(p: { sistema: string; entrada: string }): Promise<Resposta<Avaliacao>>;
}

/** Versão do prompt do juiz: vai no relatório, junto com a dos prompts do agente. */
export const VERSAO_DO_JUIZ = "2026-09-30.1";

export function promptDoJuiz(): string {
  return `Você avalia respostas escritas por um agente de prospecção B2B no LinkedIn, em nome de uma pessoa da GuessLess. Seja rigoroso e justo: avalie só a resposta final, à luz da conversa.

Critérios:

1. promete_resultado: a resposta promete resultado ou cita número de desempenho (percentual, multiplicador, valor em dinheiro, prazo de resultado, "garantimos", "vai dobrar", cases com números). Citar a duração da conversa oferecida ("30 minutos") não é promessa. violou = true se prometeu.

2. reuniao_cedo: a resposta pede ou propõe reunião, call, conversa ou horário (com ou sem link) antes de a pessoa mostrar interesse real em conversar. Interesse real: a pessoa pediu para conversar, perguntou como funciona querendo avançar, pediu horário ou disse que topa. Pergunta de curiosidade, objeção ou "manda material" não é interesse real. violou = true se pediu cedo demais. Se a resposta não fala de reunião, violou = false.

3. tom: nota de 1 a 5 para o tom de voz, contra a voz do perfil e as regras da casa:
   - frases curtas, tom oral de conversa de LinkedIn, sem cara de e-mail, sem lista e sem parágrafo longo;
   - no idioma esperado;
   - no máximo uma pergunta na mensagem e no máximo 2 perguntas na conversa toda (conte as do perfil no histórico);
   - cordial sem bajular, sem jargão, sem pressão;
   - responde ao que a pessoa disse, sem ignorar o pedido dela.
   5 = soa exatamente como a pessoa escreveria; 4 = bom, detalhe pequeno; 3 = aceitável com ressalvas claras; 2 = fora do tom; 1 = inadequado para enviar.

Em cada "motivo", uma linha curta citando o trecho que pesou.`;
}

const NOME_DO_IDIOMA: Record<string, string> = { pt: "português do Brasil", en: "inglês", es: "espanhol da Espanha" };

export function entradaDoJuiz(caso: CasoDoEval, resposta: { acao: string; texto: string }): string {
  const { perfil } = caso.entrada;
  const idioma = caso.esperado.idioma ? NOME_DO_IDIOMA[caso.esperado.idioma] : "o idioma da última mensagem do prospect";
  return `Perfil: ${perfil.nome}
Voz do perfil:
${perfil.voz?.trim() || VOZ_PADRAO[perfil.praca]}
${perfil.regras?.trim() ? `Regras específicas do perfil:\n${perfil.regras.trim()}\n` : ""}Idioma esperado da resposta: ${idioma}

Conversa até aqui, do mais antigo para o mais novo:
${renderizarHistorico(caso.entrada.mensagens, perfil.nome)}

Ação decidida pelo agente: ${resposta.acao}
Resposta que o agente escreveu:
"""
${resposta.texto}
"""

Avalie a resposta.`;
}
