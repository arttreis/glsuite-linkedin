/**
 * Os seis passos do primeiro acesso (§2.1), nesta ordem. Cada passo é uma
 * tela em `/comecar/<id>` com uma pergunta e um botão principal.
 */
export const PASSOS_DO_PRIMEIRO_ACESSO = ["site", "analise", "sdr", "leads", "abordagem", "linkedin"] as const;

export type IdDoPassoInicial = (typeof PASSOS_DO_PRIMEIRO_ACESSO)[number];

export const PASSO_INICIAL: Record<IdDoPassoInicial, { rotulo: string; pergunta: string }> = {
  site: { rotulo: "Site", pergunta: "Qual o site da sua empresa?" },
  analise: { rotulo: "Análise", pergunta: "Entendemos certo o seu negócio?" },
  sdr: { rotulo: "SDR", pergunta: "Converse com o seu SDR como se fosse um lead." },
  leads: { rotulo: "Leads", pergunta: "Quem no LinkedIn pode comprar de você?" },
  abordagem: { rotulo: "Abordagem", pergunta: "Podemos entrar em contato assim?" },
  linkedin: { rotulo: "LinkedIn", pergunta: "Vincule o seu LinkedIn para começar." },
};

export function ehPassoInicial(valor: string): valor is IdDoPassoInicial {
  return (PASSOS_DO_PRIMEIRO_ACESSO as readonly string[]).includes(valor);
}

/** O primeiro passo ainda não feito. Com todos feitos, o último. */
export function passoAtual(feitos: ReadonlySet<IdDoPassoInicial>): IdDoPassoInicial {
  return PASSOS_DO_PRIMEIRO_ACESSO.find((passo) => !feitos.has(passo)) ?? "linkedin";
}

/**
 * Dá para abrir um passo já feito (para corrigir) e o atual; os da frente, não:
 * cada um depende do anterior.
 */
export function podeAbrir(passo: IdDoPassoInicial, feitos: ReadonlySet<IdDoPassoInicial>): boolean {
  const indice = PASSOS_DO_PRIMEIRO_ACESSO.indexOf(passo);
  return indice <= PASSOS_DO_PRIMEIRO_ACESSO.indexOf(passoAtual(feitos));
}
