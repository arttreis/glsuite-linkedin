/**
 * Marca do painel: um alvo, porque o Kakou mira um decisor por vez. Dentro do
 * painel, o nome da organização fica embaixo.
 */
export function Marca({ organizacao }: { organizacao?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect x="0.5" y="0.5" width="31" height="31" rx="9" className="fill-superficie-alta stroke-linha-forte" />
        <circle cx="16" cy="16" r="7.5" fill="none" strokeWidth="1.75" className="stroke-tinta" />
        <circle cx="16" cy="16" r="2.75" className="fill-destaque" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight">Kakou</span>
        {organizacao && <span className="truncate text-[11px] text-tinta-fraca">{organizacao}</span>}
      </span>
    </span>
  );
}
