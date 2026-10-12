import { z } from "zod";
import { renderizarTemplate, tokensDoTemplate, TOKENS_PERMITIDOS, type Token, type ValoresDoTemplate } from "./template";

/**
 * Uma pessoa da prévia do primeiro acesso (§4.4): o que a busca da conta da
 * casa trouxe, a nota de aderência e se ela vai para a abordagem. Só vira lead
 * quando a organização vincula o LinkedIn dela.
 */
export const pessoaDaPrevia = z.object({
  providerId: z.string().min(1),
  publicIdentifier: z.string().nullable(),
  urlPublica: z.string(),
  nome: z.string(),
  primeiroNome: z.string().nullable(),
  cargo: z.string().nullable(),
  empresa: z.string().nullable(),
  localizacao: z.string().nullable(),
  nota: z.number().int().min(0).max(100).nullable(),
  motivo: z.string().nullable(),
  marcada: z.boolean(),
});
export type PessoaDaPrevia = z.infer<typeof pessoaDaPrevia>;

/** Quantas pessoas a organização ainda pode trazer na prévia (D2): o teto soma todas as buscas. */
export function saldoDaPrevia(buscadas: number, maximo: number): number {
  return Math.max(0, maximo - buscadas);
}

/**
 * Marca quem está na nota de corte ou acima (§4.4) e ordena pela nota, de cima
 * para baixo; sem nota vai para o fim e não vem marcado.
 */
export function ordenarEMarcar(pessoas: readonly PessoaDaPrevia[], corte: number): PessoaDaPrevia[] {
  return pessoas
    .map((pessoa) => ({ ...pessoa, marcada: pessoa.nota !== null && pessoa.nota >= corte }))
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
}

/** Quem da prévia aparece como exemplo na abordagem: o que entra no lugar dos tokens. */
export type PessoaDeExemplo = Pick<PessoaDaPrevia, "providerId" | "nome" | "primeiroNome" | "empresa">;

/** O que a pessoa recebe no lugar de `{{first_name}}` e `{{company}}`, como no envio. */
export const valoresDaPessoa = (pessoa: PessoaDeExemplo): ValoresDoTemplate => ({
  first_name: pessoa.primeiroNome,
  company: pessoa.empresa,
});

/**
 * Para cada token que os textos usam, quantas pessoas não têm o dado para
 * preencher. Com elas o texto não sai pela metade: a ação espera revisão
 * (§4.13). Usa o mesmo preenchimento do envio.
 */
export function faltasParaPreencher(textos: readonly string[], pessoas: readonly PessoaDeExemplo[]): { token: Token; pessoas: number }[] {
  const usados = new Set(textos.flatMap(tokensDoTemplate));
  return TOKENS_PERMITIDOS.filter((token) => usados.has(token)).flatMap((token) => {
    const semDado = pessoas.filter((pessoa) => !renderizarTemplate(`{{${token}}}`, valoresDaPessoa(pessoa)).ok).length;
    return semDado > 0 ? [{ token, pessoas: semDado }] : [];
  });
}

/** Motivos da prévia sem nomes, como a tela mostra. */
export const MOTIVO_SEM_NOMES = {
  sem_conta: "A busca de nomes não está disponível agora.",
  conta_fora: "A conta que faz a busca está fora do ar agora.",
  limite_da_conta: "A busca de nomes chegou ao limite de hoje.",
  limite_da_previa: "Você já viu todas as pessoas que a prévia mostra.",
  sem_regiao: "Não achei a região do seu público no LinkedIn.",
  falhou: "O LinkedIn não respondeu à busca agora.",
  ninguem: "A busca não trouxe ninguém com esses cargos e essa região.",
} as const;
