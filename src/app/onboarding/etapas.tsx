import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type EstadoDaEtapa = "feita" | "atual" | "futura";

export type Etapa = {
  id: string;
  rotulo: string;
  estado: EstadoDaEtapa;
  /** Uma linha embaixo do rótulo: o que acontece nesta etapa. */
  detalhe?: ReactNode;
  /** O que acompanha a etapa, como as páginas lidas. */
  conteudo?: ReactNode;
};

const PARA_LEITOR_DE_TELA: Record<EstadoDaEtapa, string> = { feita: "feita", atual: "agora", futura: "a seguir" };

function Marcador({ estado }: { estado: EstadoDaEtapa }) {
  if (estado === "feita") {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-destaque/50 bg-destaque/10 text-destaque">
        <Check className="size-3.5" aria-hidden />
      </span>
    );
  }
  if (estado === "atual") {
    return (
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        <span className="absolute size-6 animate-ping rounded-full bg-destaque/25" />
        <span className="absolute size-6 rounded-full border border-destaque/60" />
        <span className="size-2.5 rounded-full bg-destaque" />
      </span>
    );
  }
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-linha-forte">
      <span className="size-1.5 rounded-full bg-linha-forte" />
    </span>
  );
}

/**
 * Um trabalho demorado em etapas, de cima para baixo: as feitas com check, a
 * atual destacada e as próximas apagadas. A linha entre as etapas acende até
 * onde já chegou.
 */
export function Etapas({ etapas, className = "" }: { etapas: Etapa[]; className?: string }) {
  return (
    <ol className={`flex flex-col gap-5 ${className}`}>
      {etapas.map((etapa, indice) => (
        <li key={etapa.id} aria-current={etapa.estado === "atual" ? "step" : undefined} className="relative flex gap-4">
          {indice < etapas.length - 1 && (
            <span
              aria-hidden
              className={`absolute -bottom-4 left-[11.5px] top-7 w-px ${etapa.estado === "feita" ? "bg-destaque/40" : "bg-linha"}`}
            />
          )}
          <Marcador estado={etapa.estado} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p
              className={
                etapa.estado === "atual"
                  ? "font-medium text-tinta"
                  : etapa.estado === "feita"
                    ? "text-tinta-suave"
                    : "text-tinta-fraca"
              }
            >
              {etapa.rotulo}
              <span className="sr-only"> ({PARA_LEITOR_DE_TELA[etapa.estado]})</span>
            </p>
            {etapa.detalhe && (
              <p className={`mt-1 text-sm ${etapa.estado === "atual" ? "text-tinta-suave" : "text-tinta-fraca"}`}>{etapa.detalhe}</p>
            )}
            {etapa.conteudo}
          </div>
        </li>
      ))}
    </ol>
  );
}
