import type { EstadoDoSla } from "@/domain/sla";

const hora = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function SeloDoSla({ sla }: { sla: EstadoDoSla | null }) {
  if (!sla) return null;
  if (sla.tipo === "respondida") return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">respondida</span>;
  if (sla.tipo === "no_prazo") {
    return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">SLA até {hora(sla.venceEm)}</span>;
  }
  return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">SLA estourado ({hora(sla.venceuEm)})</span>;
}
