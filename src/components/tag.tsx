import type { ReactNode } from "react";
import type { CorDaTag } from "@/domain/contatos";

export const NOME_DA_COR: Record<CorDaTag, string> = {
  cinza: "Cinza",
  verde: "Verde",
  azul: "Azul",
  roxo: "Roxo",
  amarelo: "Amarelo",
  laranja: "Laranja",
  vermelho: "Vermelho",
  rosa: "Rosa",
};

/** Uma tag de contato (§4.16): o nome e o ponto da cor. */
export function Tag({ nome, cor, children }: { nome: string; cor: CorDaTag; children?: ReactNode }) {
  return (
    <span className="tag" data-cor={cor} title={nome}>
      <span className="truncate">{nome}</span>
      {children}
    </span>
  );
}

/** Até `max` tags e quantas mais há: cabe num card ou numa linha de tabela. */
export function Tags({ tags, max = 3 }: { tags: { id: string; nome: string; cor: CorDaTag }[]; max?: number }) {
  if (tags.length === 0) return null;
  const visiveis = tags.slice(0, max);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {visiveis.map((tag) => (
        <Tag key={tag.id} nome={tag.nome} cor={tag.cor} />
      ))}
      {tags.length > max && <span className="text-[11px] text-tinta-fraca">+{tags.length - max}</span>}
    </span>
  );
}
