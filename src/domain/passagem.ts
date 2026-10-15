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

/*
 * Passagem de bastão (SDR-66): o que acontece depois que o SDR passa a
 * conversa. Nos casos com ponte, ele manda antes uma mensagem curta, na voz
 * da conta, e para. Nos outros (reclamação, pedido de parar que não ficou
 * claro, dúvida), fica em silêncio.
 */

/** Horas úteis (janela e dias úteis do perfil) até o lembrete para quem opera a conta. */
export const HORAS_ATE_O_LEMBRETE = 4;

/** O que a pessoa lê em Configurações › SDR sobre o depois da passagem. */
export const DEPOIS_DA_PASSAGEM = [
  {
    passo: "Avisa a pessoa e para",
    detalhe:
      "Em preço, pedido fora do comum, reunião sem link de agenda e nos seus casos, ele manda antes uma mensagem curta na sua voz, como \"Boa pergunta, deixa eu ver isso direitinho e te respondo até amanhã\". Em reclamação, pedido de parar que não ficou claro e dúvida, não manda nada.",
  },
  {
    passo: "Avisa você",
    detalhe: "Por e-mail e no Dashboard, com um resumo da conversa, o motivo e uma resposta sugerida, que já vem no campo de resposta do Chats.",
  },
  { passo: "Lembra você", detalhe: "Sem resposta sua em 4 horas úteis, chega um lembrete." },
  {
    passo: "Avisa o admin",
    detalhe: "Sem resposta em 1 dia útil (24 horas sem contar fim de semana e feriado), o admin da organização é avisado.",
  },
] as const;

// Prazo menor que 1 dia útil (pt, en, es): a ponte nunca promete isso.
const PRAZO_CURTO =
  /(^|[^\p{L}])(ainda hoje|hoje|j[áa] j[áa]|daqui a pouco|em instantes|minutos?|em (uma|1|duas|2|poucas) horas?|logo mais|today|tonight|minutes?|in an hour|in a few hours|right away|shortly|hoy|en (una|1|unas) horas?|enseguida)(?![\p{L}])/iu;

// O SDR escreve como o dono da conta: a ponte nunca diz que outra pessoa vai responder.
const OUTRA_PESSOA =
  /(^|[^\p{L}])(vou (passar|encaminhar|chamar|consultar|repassar)|meus? colegas?|minhas? colegas?|nosso time|nossa equipe|a equipe|o time|algu[ée]m (do|da|de)|o respons[áa]vel|my colleagues?|my team|our team|someone from|mi compa[ñn]ero|mi equipo|nuestro equipo)(?![\p{L}])/iu;

/** As regras da casa para a ponte: até 30 palavras, numa linha só (§4.3). */
export const PALAVRAS_DA_PONTE = 30;

/**
 * Regras da ponte que o validador não cobre: o tamanho da casa, prazo menor
 * que 1 dia útil e dizer que outra pessoa vai responder. Devolve o problema,
 * ou null.
 */
export function problemaDaPonte(texto: string): string | null {
  if (texto.trim().split(/\s+/u).length > PALAVRAS_DA_PONTE) return `A ponte passa de ${PALAVRAS_DA_PONTE} palavras.`;
  if (texto.trim().includes("\n")) return "A ponte tem mais de uma linha.";
  if (PRAZO_CURTO.test(texto)) return "A ponte promete prazo menor que 1 dia útil.";
  if (OUTRA_PESSOA.test(texto)) return "A ponte diz que outra pessoa vai responder.";
  return null;
}

/** O resumo do lead em no máximo 3 linhas, sem linha em branco. */
export function resumoEmTresLinhas(texto: string): string {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
}
