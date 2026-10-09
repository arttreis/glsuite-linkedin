"use client";

import {
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  FileUp,
  House,
  Inbox,
  ListFilter,
  Megaphone,
  PenLine,
  Plug,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; rotulo: string; icone: LucideIcon; soAdmin?: boolean };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/", rotulo: "Início", icone: House },
      { href: "/inbox", rotulo: "Inbox", icone: Inbox },
      { href: "/aprovacao", rotulo: "Aprovação", icone: ClipboardCheck },
      { href: "/tarefas", rotulo: "Tarefas", icone: PenLine },
    ],
  },
  {
    titulo: "Prospecção",
    itens: [
      { href: "/campanhas", rotulo: "Campanhas", icone: Megaphone },
      { href: "/triagem", rotulo: "Triagem", icone: ListFilter },
      { href: "/importar", rotulo: "Importar", icone: FileUp },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/metricas", rotulo: "Métricas", icone: ChartColumn },
      { href: "/perfis", rotulo: "Perfis", icone: Users },
      { href: "/integracoes", rotulo: "Integrações", icone: Plug, soAdmin: true },
    ],
  },
];

export function Navegacao({ admin, aoNavegar }: { admin: boolean; aoNavegar?: () => void }) {
  const caminho = usePathname();
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());

  const alternar = (titulo: string) =>
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(titulo)) novo.delete(titulo);
      else novo.add(titulo);
      return novo;
    });

  return (
    <nav aria-label="Principal" className="flex flex-col">
      {GRUPOS.map((grupo, indice) => {
        const aberto = !recolhidos.has(grupo.titulo);
        const idDaLista = `navegacao-${indice}`;
        return (
          <div key={grupo.titulo} className={indice > 0 ? "mt-3 border-t border-linha pt-3" : ""}>
            <button
              type="button"
              className="grupo-nav-titulo"
              aria-expanded={aberto}
              aria-controls={idDaLista}
              onClick={() => alternar(grupo.titulo)}
            >
              {grupo.titulo}
              <ChevronDown aria-hidden />
            </button>
            <ul id={idDaLista} className="arvore" hidden={!aberto}>
              {grupo.itens
                .filter((item) => admin || !item.soAdmin)
                .map((item) => {
                  const ativo = item.href === "/" ? caminho === "/" : caminho.startsWith(item.href);
                  const Icone = item.icone;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="item-nav"
                        aria-current={ativo ? "page" : undefined}
                        onClick={aoNavegar}
                      >
                        <Icone aria-hidden />
                        {item.rotulo}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
