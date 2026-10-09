import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Cabeçalho da página: título, uma linha de contexto e as ações da tela. */
export function Cabecalho({
  titulo,
  descricao,
  voltar,
  children,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  voltar?: { href: string; rotulo: string };
  children?: ReactNode;
}) {
  return (
    <header className="cabecalho flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {voltar && (
          <Link
            href={voltar.href}
            className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-tinta-suave transition-colors hover:text-tinta"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {voltar.rotulo}
          </Link>
        )}
        <h1 className="text-[1.375rem] font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-tinta-suave">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
