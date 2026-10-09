"use client";

import {
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  FileUp,
  Globe,
  House,
  Inbox,
  ListFilter,
  Lock,
  Megaphone,
  PenLine,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * `guiado`: liberado durante os primeiros passos (§4.10); os outros ficam
 * trancados até lá. `tambem`: outras rotas em que o item aparece ativo.
 */
type Item = { href: string; rotulo: string; icone: LucideIcon; soAdmin?: boolean; guiado?: boolean; tambem?: string[] };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/", rotulo: "Início", icone: House, guiado: true },
      { href: "/inbox", rotulo: "Inbox", icone: Inbox },
      { href: "/aprovacao", rotulo: "Aprovação", icone: ClipboardCheck },
      { href: "/tarefas", rotulo: "Tarefas", icone: PenLine },
    ],
  },
  {
    titulo: "Prospecção",
    itens: [
      { href: "/oferta", rotulo: "Oferta", icone: Globe, guiado: true },
      { href: "/campanhas", rotulo: "Campanhas", icone: Megaphone, guiado: true },
      { href: "/triagem", rotulo: "Triagem", icone: ListFilter, guiado: true },
      { href: "/importar", rotulo: "Importar", icone: FileUp, guiado: true },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/metricas", rotulo: "Métricas", icone: ChartColumn },
      { href: "/configuracoes", rotulo: "Configurações", icone: Settings, guiado: true, tambem: ["/perfis", "/integracoes"] },
    ],
  },
];

export function Navegacao({
  admin,
  emPrimeirosPassos = false,
  aoNavegar,
}: {
  admin: boolean;
  emPrimeirosPassos?: boolean;
  aoNavegar?: () => void;
}) {
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
                  const ativo =
                    item.href === "/"
                      ? caminho === "/"
                      : [item.href, ...(item.tambem ?? [])].some((prefixo) => caminho.startsWith(prefixo));
                  const Icone = item.icone;
                  if (emPrimeirosPassos && !item.guiado) {
                    return (
                      <li key={item.href}>
                        <span className="item-nav cursor-not-allowed opacity-50" title="Libera depois dos primeiros passos">
                          <Lock aria-hidden />
                          {item.rotulo}
                          <span className="sr-only"> (libera depois dos primeiros passos)</span>
                        </span>
                      </li>
                    );
                  }
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
