import { z } from "zod";

/** Passo 1 (§7): classificação da última mensagem da pessoa. */
export const classificacao = z.object({
  categoria: z.enum(["interesse", "pergunta", "objecao", "nao", "optout", "fora_do_escritorio", "irrelevante"]),
  confianca: z.number().min(0).max(1),
  sinais: z.object({
    preco: z.boolean(),
    reclamacao: z.boolean(),
    idioma: z.string(),
  }),
});
export type Classificacao = z.infer<typeof classificacao>;

/** Passo 2 (§7): decisão e rascunho. Mesmo formato do épico. */
export const decisao = z.object({
  acao: z.enum(["responder", "propor_reuniao", "encerrar", "registrar_optout", "escalar_humano"]),
  mensagem: z.string().nullable(),
  motivo: z.string(),
  estagio_sugerido: z.enum(["03", "04", "05"]).nullable(),
  confianca: z.number().min(0).max(1),
});
export type Decisao = z.infer<typeof decisao>;

export type Uso = {
  entrada: number;
  saida: number;
  cacheLeitura: number;
  cacheEscrita: number;
};

export type Resposta<T> = { saida: T; uso: Uso; modelo: string };

/**
 * O modelo de linguagem do agente. Em produção é o Claude (`claude.ts`); nos
 * testes e no eval, qualquer implementação com o mesmo contrato.
 */
export interface ModeloDeLinguagem {
  classificar(p: { sistema: string; entrada: string }): Promise<Resposta<Classificacao>>;
  rascunhar(p: { sistema: string; entrada: string }): Promise<Resposta<Decisao>>;
}

/** O modelo recusou ou não devolveu o formato: a conversa vai para um humano. */
export class ErroDoModelo extends Error {}
