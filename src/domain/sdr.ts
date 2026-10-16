import { z } from "zod";
import { explicarErroDeEdicao } from "./edicao";
import { CAUTELAS } from "./passagem";

/**
 * Onde o SDR conversa (§4.3, §4.26): no LinkedIn e, desde o Marco E, no
 * direct do Instagram, no Messenger e no privado do bot do Telegram. Sem
 * `server-only`: o chat de teste mostra o canal.
 */
export const CANAIS_DO_SDR = ["linkedin", "instagram", "facebook", "telegram"] as const;
export type CanalDoSdr = (typeof CANAIS_DO_SDR)[number];

export const NOME_DO_CANAL_DO_SDR: Record<CanalDoSdr, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Messenger",
  telegram: "Telegram",
};

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
  /**
   * O quanto o SDR arrisca sozinho antes de chamar a pessoa (§4.7). Quem
   * escolhe é a pessoa, nunca a IA. Versão sem o campo vale como "equilibrado".
   */
  cautela: z.enum(CAUTELAS).optional(),
});
export type Sdr = z.infer<typeof sdr>;

/** O que a IA devolve ao gerar ou ajustar o SDR: tudo menos o que só a pessoa decide. */
export const sdrDaIa = sdr.omit({ link_agenda: true, cautela: true });
export type SdrDaIa = z.infer<typeof sdrDaIa>;

/** O que só a pessoa decide e atravessa a geração e o ajuste pela IA sem mudar. */
export const soDaPessoa = (s: Sdr | null | undefined): Pick<Sdr, "link_agenda" | "cautela"> => ({
  link_agenda: s?.link_agenda ?? null,
  ...(s?.cautela ? { cautela: s.cautela } : {}),
});

/** A parte do SDR que a seção "Quando o SDR passa a conversa para você" edita; o editor do SDR edita o resto. */
export const CAMPOS_DA_PASSAGEM = ["quando_chamar_voce", "cautela"] as const;

const SECOES: Record<string, string> = {
  objetivo: "Objetivo",
  voz: "Voz",
  abertura: "Abertura",
  qualificacao: "Qualificação",
  objecoes: "Objeções",
  regras: "Regras",
  quando_chamar_voce: "Quando chamar você",
  link_agenda: "Link de agenda",
  cautela: "Quando ficar em dúvida",
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
