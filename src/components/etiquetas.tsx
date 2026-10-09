import { ROTULO_DO_ESTADO, type EstadoDoLead } from "@/domain/estados";
import type { StatusDaCampanha } from "@/server/campanhas/campanhas";

const TOM_DO_ESTADO: Partial<Record<EstadoDoLead, string>> = {
  em_conversa: "etiqueta-info",
  qualificado: "etiqueta-ok",
  reuniao_marcada: "etiqueta-ok",
  escalado_humano: "etiqueta-atencao",
  optout: "etiqueta-erro",
};

export function EtiquetaDoEstado({ estado }: { estado: EstadoDoLead }) {
  return <span className={`etiqueta ${TOM_DO_ESTADO[estado] ?? ""}`}>{ROTULO_DO_ESTADO[estado] ?? estado}</span>;
}

const CAMPANHA: Record<StatusDaCampanha, { rotulo: string; tom: string }> = {
  rascunho: { rotulo: "Rascunho", tom: "" },
  ativa: { rotulo: "Ativa", tom: "etiqueta-ponto etiqueta-ok" },
  pausada: { rotulo: "Pausada", tom: "etiqueta-ponto etiqueta-atencao" },
  encerrada: { rotulo: "Encerrada", tom: "opacity-70" },
};

export function EtiquetaDaCampanha({ status }: { status: StatusDaCampanha }) {
  const { rotulo, tom } = CAMPANHA[status];
  return <span className={`etiqueta ${tom}`}>{rotulo}</span>;
}

/** Perfil que nunca foi ativado não está "pausado": ainda espera o checklist de ativação. */
export function EtiquetaDoPerfil({ status, nuncaAtivado = false }: { status: "ativo" | "pausado"; nuncaAtivado?: boolean }) {
  if (nuncaAtivado && status === "pausado") return <span className="etiqueta etiqueta-ponto">Não ativado</span>;
  return status === "ativo" ? (
    <span className="etiqueta etiqueta-ponto etiqueta-ok">Ativo</span>
  ) : (
    <span className="etiqueta etiqueta-ponto etiqueta-atencao">Pausado</span>
  );
}
