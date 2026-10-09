/** Estados do lead (§6.1). */
export const ESTADOS_DO_LEAD = [
  "importado",
  "triagem",
  "rejeitado",
  "na_fila",
  "convite_enviado",
  "aceito",
  "em_sequencia",
  "sem_resposta",
  "convite_retirado",
  "em_conversa",
  "qualificado",
  "reuniao_marcada",
  "encerrado_nao",
  "optout",
  "escalado_humano",
] as const;

export type EstadoDoLead = (typeof ESTADOS_DO_LEAD)[number];

/** Como cada estado aparece no painel. */
export const ROTULO_DO_ESTADO: Record<EstadoDoLead, string> = {
  importado: "Importado",
  triagem: "Em triagem",
  rejeitado: "Rejeitado",
  na_fila: "Na fila",
  convite_enviado: "Convite enviado",
  aceito: "Aceitou o convite",
  em_sequencia: "Na sequência",
  sem_resposta: "Sem resposta",
  convite_retirado: "Convite retirado",
  em_conversa: "Em conversa",
  qualificado: "Qualificado",
  reuniao_marcada: "Reunião marcada",
  encerrado_nao: "Disse não",
  optout: "Opt-out",
  escalado_humano: "Com humano",
};

/** Estados em que a pessoa está numa régua ativa (mesmo índice parcial do banco). */
export const ESTADOS_ATIVOS: readonly EstadoDoLead[] = [
  "na_fila",
  "convite_enviado",
  "aceito",
  "em_sequencia",
  "em_conversa",
  "qualificado",
  "reuniao_marcada",
  "escalado_humano",
];

/** Estados depois do convite em que uma mensagem recebida vira `em_conversa`. */
export const ESTADOS_QUE_RESPONDEM: readonly EstadoDoLead[] = [
  "na_fila",
  "convite_enviado",
  "aceito",
  "em_sequencia",
  "sem_resposta",
  "convite_retirado",
];

const TRANSICOES: Record<EstadoDoLead, readonly EstadoDoLead[]> = {
  importado: ["triagem", "rejeitado"],
  triagem: ["na_fila", "rejeitado"],
  rejeitado: ["triagem"],
  // na_fila → aceito: o fluxo pergunta "Já é conexão?" e a resposta é sim (SDR-21).
  na_fila: ["convite_enviado", "aceito", "rejeitado", "em_conversa", "escalado_humano"],
  convite_enviado: ["aceito", "convite_retirado", "em_conversa", "escalado_humano"],
  // aceito → sem_resposta: o fluxo pode terminar logo depois do aceite (SDR-21).
  aceito: ["em_sequencia", "sem_resposta", "em_conversa", "escalado_humano"],
  em_sequencia: ["sem_resposta", "em_conversa", "escalado_humano"],
  sem_resposta: ["em_conversa"],
  convite_retirado: ["aceito", "em_conversa"],
  em_conversa: ["qualificado", "reuniao_marcada", "encerrado_nao", "escalado_humano"],
  qualificado: ["reuniao_marcada", "encerrado_nao", "escalado_humano"],
  reuniao_marcada: ["encerrado_nao"],
  encerrado_nao: [],
  optout: [],
  escalado_humano: ["em_conversa", "qualificado", "reuniao_marcada", "encerrado_nao"],
};

/** Opt-out vale a qualquer momento (§4.6), vindo de qualquer estado. */
export function estadosDeOrigemPara(destino: EstadoDoLead): EstadoDoLead[] {
  if (destino === "optout") return ESTADOS_DO_LEAD.filter((estado) => estado !== "optout");
  return ESTADOS_DO_LEAD.filter((origem) => TRANSICOES[origem].includes(destino));
}

export function podeTransicionar(de: EstadoDoLead, para: EstadoDoLead): boolean {
  return estadosDeOrigemPara(para).includes(de);
}
