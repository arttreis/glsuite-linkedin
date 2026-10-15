/**
 * A passagem da conversa do SDR para a pessoa (§4.7): o que sempre faz o SDR
 * parar, o quanto ele arrisca sozinho e os casos prontos para testar no chat.
 * Os casos da própria pessoa moram no SDR (`quando_chamar_voce`).
 */

/** O quanto o SDR precisa estar seguro da decisão para seguir sozinho. */
export const CAUTELAS = ["cauteloso", "equilibrado", "solto"] as const;
export type Cautela = (typeof CAUTELAS)[number];

export const CAUTELA_PADRAO: Cautela = "equilibrado";

/** Abaixo do limiar, o SDR chama você ("baixa confiança"). */
export const NIVEIS_DE_CAUTELA: Record<Cautela, { rotulo: string; descricao: string; limiar: number }> = {
  cauteloso: {
    rotulo: "Mais cauteloso",
    descricao: "Chama você sempre que não tiver bem certeza. Mais conversas passam para você.",
    limiar: 0.8,
  },
  equilibrado: {
    rotulo: "Equilibrado",
    descricao: "Responde o que está claro e chama você na dúvida. É o padrão.",
    limiar: 0.7,
  },
  solto: {
    rotulo: "Mais solto",
    descricao: "Só chama você quando está bem inseguro. Ele responde mais sozinho.",
    limiar: 0.6,
  },
};

export const limiarDaCautela = (cautela: Cautela | undefined): number => NIVEIS_DE_CAUTELA[cautela ?? CAUTELA_PADRAO].limiar;

/**
 * O que faz o SDR chamar você em qualquer conta e modo, e que não se desliga.
 * O mesmo que `decidirResposta` aplica, dito para quem lê a tela.
 */
export const SEMPRE_CHAMA = [
  { caso: "Pergunta de preço", detalhe: "Valor, preço ou orçamento, de qualquer jeito que a pessoa pergunte." },
  { caso: "Reclamação", detalhe: "A pessoa está incomodada com o contato." },
  { caso: "Pedido fora do comum", detalhe: "Algo que o SDR não sabe responder com o que tem." },
  {
    caso: "Pedido para parar que não ficou claro",
    detalhe: "Quando fica claro, ele não chama: registra e nunca mais fala com a pessoa.",
  },
] as const;

type Idioma = "pt" | "en" | "es";

/** Mensagens de lead prontas para ver, no chat de teste, se o SDR passa a conversa. */
export const CASOS_DE_TESTE: readonly { rotulo: string; texto: Record<Idioma, string> }[] = [
  {
    rotulo: "Pergunta o preço",
    texto: { pt: "Interessante. Quanto custa?", en: "Interesting. How much does it cost?", es: "Interesante. ¿Cuánto cuesta?" },
  },
  {
    rotulo: "Reclama do contato",
    texto: {
      pt: "Não lembro de ter pedido esse contato. Bem chato receber isso.",
      en: "I don't remember asking to be contacted. This is pretty annoying.",
      es: "No recuerdo haber pedido este contacto. Es bastante molesto.",
    },
  },
  {
    rotulo: "Pede algo fora do comum",
    texto: {
      pt: "Vocês fariam um contrato de exclusividade só para a minha região?",
      en: "Would you sign an exclusivity deal just for my region?",
      es: "¿Harían un contrato de exclusividad solo para mi región?",
    },
  },
  {
    rotulo: "Quer marcar uma conversa",
    texto: {
      pt: "Pode ser, vamos conversar. Que horário você tem?",
      en: "Sure, let's talk. What times work for you?",
      es: "Vale, hablemos. ¿Qué horario tienes?",
    },
  },
];
