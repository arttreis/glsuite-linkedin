import { Clock } from "lucide-react";
import type { EstadoDoSla } from "@/domain/sla";

const hora = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function SeloDoSla({ sla }: { sla: EstadoDoSla | null }) {
  if (!sla) return null;
  if (sla.tipo === "respondida") return <span className="etiqueta">Respondida</span>;
  if (sla.tipo === "no_prazo") {
    return (
      <span className="etiqueta etiqueta-info">
        <Clock aria-hidden />
        SLA até {hora(sla.venceEm)}
      </span>
    );
  }
  return (
    <span className="etiqueta etiqueta-erro">
      <Clock aria-hidden />
      SLA estourado ({hora(sla.venceuEm)})
    </span>
  );
}
