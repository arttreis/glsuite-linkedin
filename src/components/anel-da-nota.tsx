/** A nota de aderência num anel, como o alvo da marca: quanto mais perto de 100, mais fechado. */
export function AnelDaNota({ nota, corte }: { nota: number | null; corte: number }) {
  const raio = 15;
  const volta = 2 * Math.PI * raio;
  const passa = nota !== null && nota >= corte;
  return (
    <span className="relative grid size-10 shrink-0 place-items-center" title={nota === null ? "Sem nota" : `Nota ${nota} de 100`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={raio} fill="none" strokeWidth="2.5" className="stroke-linha-forte" />
        {nota !== null && (
          <circle
            cx="18"
            cy="18"
            r={raio}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${(nota / 100) * volta} ${volta}`}
            className={passa ? "stroke-destaque" : "stroke-tinta-fraca"}
          />
        )}
      </svg>
      <span className={`text-xs font-medium tabular-nums ${passa ? "text-tinta" : "text-tinta-suave"}`}>{nota ?? "?"}</span>
    </span>
  );
}
