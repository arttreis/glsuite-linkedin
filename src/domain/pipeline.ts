import { podeTransicionar, type EstadoDoLead } from "./estados";

/** As colunas do Pipeline (§4.10), do convite à reunião. Encerrado fica recolhida. */
export const COLUNAS_DO_PIPELINE = [
  { id: "na_fila", rotulo: "Na fila", estados: ["na_fila"] },
  { id: "convite_enviado", rotulo: "Convite enviado", estados: ["convite_enviado"] },
  { id: "conectado", rotulo: "Conectado", estados: ["aceito", "em_sequencia"] },
  { id: "conversando", rotulo: "Conversando", estados: ["em_conversa", "escalado_humano"] },
  { id: "qualificado", rotulo: "Qualificado", estados: ["qualificado"] },
  { id: "reuniao", rotulo: "Reunião marcada", estados: ["reuniao_marcada"] },
  { id: "encerrado", rotulo: "Encerrado", estados: ["sem_resposta", "convite_retirado", "encerrado_nao", "optout"] },
] as const satisfies readonly { id: string; rotulo: string; estados: readonly EstadoDoLead[] }[];

export type ColunaDoPipeline = (typeof COLUNAS_DO_PIPELINE)[number];

/** A coluna do lead; quem ainda está na triagem ou foi rejeitado não está no Pipeline. */
export function colunaDoEstado(estado: EstadoDoLead): ColunaDoPipeline | null {
  return COLUNAS_DO_PIPELINE.find((coluna) => (coluna.estados as readonly EstadoDoLead[]).includes(estado)) ?? null;
}

/**
 * Para onde a pessoa move um card à mão (§4.10): o resto o sistema move
 * sozinho. Encerrado à mão é "disse não".
 */
export const DESTINOS_A_MAO = ["qualificado", "reuniao_marcada", "encerrado_nao"] as const;
export type DestinoAMao = (typeof DESTINOS_A_MAO)[number];

export const ROTULO_DO_DESTINO: Record<DestinoAMao, string> = {
  qualificado: "Qualificado",
  reuniao_marcada: "Reunião marcada",
  encerrado_nao: "Encerrado (disse não)",
};

/** Os destinos à mão que valem a partir do estado do lead (§6.1). */
export function destinosPermitidos(estado: EstadoDoLead): DestinoAMao[] {
  return DESTINOS_A_MAO.filter((destino) => podeTransicionar(estado, destino));
}
