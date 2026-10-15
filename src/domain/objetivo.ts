import { z } from "zod";
import type { Dossie } from "./dossie";
import { explicarErroDeEdicao } from "./edicao";

/**
 * O que o SDR deve fazer com o lead (§4.2.1). "Agendar a reunião direto na
 * agenda" vem no SDR-69, com o Google: até lá aparece na tela como "em
 * breve" e não é um valor que se grava.
 */
export const ACOES_DO_SDR = ["qualificar", "propor_conversa"] as const;
export type AcaoDoSdr = (typeof ACOES_DO_SDR)[number];

export const ACAO_PADRAO: AcaoDoSdr = "propor_conversa";

export const OPCOES_DE_ACAO: Record<AcaoDoSdr | "agendar", { rotulo: string; descricao: string }> = {
  qualificar: {
    rotulo: "Qualificar e passar para você",
    descricao: "Ele conversa, entende se o lead serve e chama você quando serve.",
  },
  propor_conversa: {
    rotulo: "Propor uma conversa e mandar o link de agenda",
    descricao: "Quando o lead mostra interesse, ele propõe a conversa e manda o seu link.",
  },
  agendar: {
    rotulo: "Agendar a reunião direto na sua agenda",
    descricao: "Ele marca o horário na sua agenda do Google, sem você no meio.",
  },
};

export const DURACOES = [15, 20, 30, 45] as const;
export type Duracao = (typeof DURACOES)[number];
export const DURACAO_PADRAO: Duracao = 20;

const LIMITE_DO_PRODUTO = 120;

/**
 * As respostas do passo Objetivo (§4.2.1): o que vender (um ou mais, um é o
 * principal), o que o SDR faz, com quem é a conversa e quanto dura, e o que
 * ele nunca faz. Os produtos vão pelo nome: os da análise ou um "outro".
 */
export const respostasDoObjetivo = z
  .object({
    produtos: z.array(z.string().trim().min(1).max(LIMITE_DO_PRODUTO)).min(1).max(9),
    principal: z.string().trim().min(1).max(LIMITE_DO_PRODUTO),
    acao: z.enum(ACOES_DO_SDR),
    quem_atende: z.string().trim().min(1).max(80),
    duracao: z.literal(DURACOES),
    nunca: z.string().trim().max(300).nullable(),
  })
  .transform((r) => ({ ...r, produtos: [...new Set(r.produtos)], nunca: r.nunca || null }))
  .refine((r) => r.produtos.includes(r.principal), { path: ["principal"], message: "O principal precisa estar marcado." });
export type RespostasDoObjetivo = z.infer<typeof respostasDoObjetivo>;

/** O objetivo confirmado: as respostas e o resumo que a pessoa validou. */
export type ObjetivoConfirmado = RespostasDoObjetivo & { resumo: string };

/** O objetivo confirmado como está gravado, ou null se não houver ou não fechar com o esquema. */
export function lerObjetivoConfirmado(valor: unknown): ObjetivoConfirmado | null {
  if (valor === null || typeof valor !== "object") return null;
  const respostas = respostasDoObjetivo.safeParse(valor);
  const resumo = z.string().min(1).safeParse((valor as { resumo?: unknown }).resumo);
  return respostas.success && resumo.success ? { ...respostas.data, resumo: resumo.data } : null;
}

const SECOES: Record<string, string> = {
  produtos: "O que você quer vender",
  principal: "Produto principal",
  acao: "O que o SDR deve fazer",
  quem_atende: "Quem atende",
  duracao: "Duração",
  nunca: "O que o SDR nunca deve fazer",
};

/** O primeiro problema das respostas, numa frase para quem respondeu. */
export function explicarErroDoObjetivo(erro: z.ZodError): string {
  const issue = erro.issues[0];
  if (issue?.code === "custom") return `${SECOES[String(issue.path[0])] ?? "Resposta"}: ${issue.message}`;
  return explicarErroDeEdicao(erro, { secoes: SECOES, campos: {} });
}

/**
 * Respostas para começar, da análise confirmada: o primeiro produto marcado e
 * principal, propor conversa de 20 minutos, com quem está configurando.
 */
export function respostasIniciais(d: Dossie, nome: string): RespostasDoObjetivo {
  const primeiro = d.produtos[0]?.nome ?? "";
  return {
    produtos: primeiro ? [primeiro] : [],
    principal: primeiro,
    acao: ACAO_PADRAO,
    quem_atende: nome,
    duracao: DURACAO_PADRAO,
    nunca: null,
  };
}

/** O que a IA devolve ao resumir o objetivo. Sem limite de tamanho de propósito: ver `limparResumo`. */
export const resumoDaIa = z.object({ resumo: z.string() });
export type ResumoDaIa = z.infer<typeof resumoDaIa>;

export const MAX_FRASES_DO_RESUMO = 4;
export const LIMITE_DO_RESUMO = 600;

/**
 * O resumo da IA pronto para a tela. A saída estruturada não cumpre limite de
 * tamanho e o SDK valida a resposta com o esquema inteiro (SDR-63): por isso
 * o esquema da IA não tem limite, e o que passa é cortado aqui, nunca
 * recusado. Fica com até 4 frases e 600 caracteres; vazio vira null.
 */
export function limparResumo(texto: string): string | null {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return null;
  const frases = limpo.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g) ?? [limpo];
  const curtas = frases
    .slice(0, MAX_FRASES_DO_RESUMO)
    .map((frase) => frase.trim())
    .join(" ");
  if (curtas.length <= LIMITE_DO_RESUMO) return curtas;
  const corte = curtas.slice(0, LIMITE_DO_RESUMO - 1);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${(ultimoEspaco > LIMITE_DO_RESUMO / 2 ? corte.slice(0, ultimoEspaco) : corte).replace(/[\s,;:]+$/, "")}…`;
}

/** Duas respostas iguais: o resumo de uma vale para a outra. */
export function mesmasRespostas(a: RespostasDoObjetivo, b: RespostasDoObjetivo): boolean {
  return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
}

const normalizar = (r: RespostasDoObjetivo) => ({
  produtos: [...r.produtos].sort(),
  principal: r.principal,
  acao: r.acao,
  quem_atende: r.quem_atende,
  duracao: r.duracao,
  nunca: r.nunca,
});

/** O objetivo como texto, para o prompt do resumo e o da geração do SDR. */
export function textoDoObjetivo(r: RespostasDoObjetivo): string {
  const outros = r.produtos.filter((p) => p !== r.principal);
  const acao =
    r.acao === "qualificar"
      ? `qualificar o lead e passar a conversa para ${r.quem_atende} quando ele servir; a conversa com ${r.quem_atende} é de ${r.duracao} minutos`
      : `propor uma conversa de ${r.duracao} minutos com ${r.quem_atende} e mandar o link de agenda quando o lead aceitar`;
  return [
    `Produto principal: ${r.principal}`,
    outros.length > 0 ? `Também vende pelo LinkedIn: ${outros.join("; ")}` : null,
    `O que o SDR deve fazer: ${acao}`,
    `Nunca: ${r.nunca ?? "(nada a mais)"}`,
  ]
    .filter((linha): linha is string => linha !== null)
    .join("\n");
}
