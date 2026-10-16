import type { CorDaTag } from "@/domain/contatos";

/** A mesma paleta das tags (`.tag[data-cor]` no globals.css). */
const FUNDO_DA_COR: Record<CorDaTag, string> = {
  cinza: "var(--color-tinta-fraca)",
  verde: "#7ccf8a",
  azul: "#6ea8fe",
  roxo: "#b197fc",
  amarelo: "#e9c46a",
  laranja: "#f4a261",
  vermelho: "#ef7b7b",
  rosa: "#f08fc0",
};

/**
 * O selo de uma marca (§4.30): a inicial sobre a cor, sempre com o nome escrito
 * ao lado. Não confundir com `Marca`, o logo do Kakou.
 */
export function SeloDaMarca({ marca, className = "" }: { marca: { nome: string; cor: CorDaTag; inicial: string }; className?: string }) {
  return (
    <span className={`flex min-w-0 items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-[5px] text-[11px] font-semibold leading-none text-black/80"
        style={{ background: FUNDO_DA_COR[marca.cor] }}
      >
        {marca.inicial}
      </span>
      <span className="truncate text-sm font-semibold tracking-tight">{marca.nome}</span>
    </span>
  );
}
