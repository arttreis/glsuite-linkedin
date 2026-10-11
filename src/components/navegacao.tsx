"use client";

import { Kanban, LayoutDashboard, Megaphone, MessagesSquare, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * As telas do app (§2.2), nesta ordem. `tambem`: rotas antigas em que o item
 * aparece ativo até a tela nova tomar o lugar delas (SDR-53).
 */
type Item = { href: string; rotulo: string; icone: LucideIcon; tambem?: string[] };

const ITENS: Item[] = [
  { href: "/", rotulo: "Dashboard", icone: LayoutDashboard, tambem: ["/metricas"] },
  { href: "/chats", rotulo: "Chats", icone: MessagesSquare, tambem: ["/aprovacao", "/tarefas"] },
  { href: "/pipeline", rotulo: "Pipeline", icone: Kanban },
  { href: "/campaigns", rotulo: "Campanhas", icone: Megaphone, tambem: ["/publicos", "/triagem", "/importar"] },
  { href: "/settings", rotulo: "Configurações", icone: Settings },
];

function ativo(item: Item, caminho: string): boolean {
  if (item.href === "/" ? caminho === "/" : caminho.startsWith(item.href)) return true;
  return (item.tambem ?? []).some((prefixo) => caminho.startsWith(prefixo));
}

export function Navegacao({ aoNavegar }: { aoNavegar?: () => void }) {
  const caminho = usePathname();

  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-1">
        {ITENS.map((item) => {
          const Icone = item.icone;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="item-nav"
                aria-current={ativo(item, caminho) ? "page" : undefined}
                onClick={aoNavegar}
              >
                <Icone aria-hidden />
                {item.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
