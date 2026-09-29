"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITENS = [
  { href: "/", rotulo: "Início" },
  { href: "/campanhas", rotulo: "Campanhas" },
  { href: "/triagem", rotulo: "Triagem" },
  { href: "/importar", rotulo: "Importar" },
  { href: "/perfis", rotulo: "Perfis" },
] as const;

export function Navegacao() {
  const caminho = usePathname();
  return (
    <nav className="mt-6 flex flex-col gap-0.5">
      {ITENS.map((item) => {
        const ativo = item.href === "/" ? caminho === "/" : caminho.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-2 py-1.5 text-sm ${
              ativo ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
