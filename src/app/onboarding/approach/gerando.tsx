import { type Etapa, Etapas } from "../etapas";

/**
 * Enquanto a abordagem é gerada, em etapas. A tela sabe só quando o público
 * está sendo escolhido e quando a escrita começou: a revisão corre dentro da
 * escrita, então fica como próxima, com o que ela faz.
 */
export function GerandoAbordagem({ etapa, className = "" }: { etapa: "publicos" | "escrita"; className?: string }) {
  const etapas: Etapa[] = [
    {
      id: "publicos",
      rotulo: "Escolhendo públicos",
      estado: etapa === "publicos" ? "atual" : "feita",
      detalhe: etapa === "publicos" ? "Pela sua análise, quem tem mais cara de comprar de você." : undefined,
    },
    {
      id: "escrita",
      rotulo: "Escrevendo o convite e as mensagens",
      estado: etapa === "escrita" ? "atual" : "futura",
      detalhe: etapa === "escrita" ? "Na voz do seu SDR, para o público escolhido." : undefined,
    },
    {
      id: "revisao",
      rotulo: "Revisando as regras",
      estado: "futura",
      detalhe: "Cada texto passa pelo limite de caracteres e pelas regras antes de aparecer aqui.",
    },
  ];
  return (
    <div role="status" className={`cartao p-6 sm:p-8 ${className}`}>
      <Etapas etapas={etapas} />
    </div>
  );
}
