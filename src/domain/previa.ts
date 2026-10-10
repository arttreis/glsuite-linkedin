import { z } from "zod";

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
