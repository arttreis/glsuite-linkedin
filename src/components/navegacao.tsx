"use client";

import { Building2, Kanban, LayoutDashboard, Megaphone, MessagesSquare, Rocket, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { liberado, type ExigenciaDeModulo, type Modulo } from "@/domain/modulos";

/**
 * As telas do app (§2.2), nesta ordem. `modulo`: só aparece com ele (§4.14).
 * `tambem`: rotas antigas em que o item aparece ativo até a tela nova tomar o
 * lugar delas (SDR-53).
 */
type Item = { href: string; rotulo: string; icone: LucideIcon; modulo?: ExigenciaDeModulo; tambem?: string[] };

const ITENS: Item[] = [
  { href: "/", rotulo: "Dashboard", icone: LayoutDashboard },
  { href: "/chats", rotulo: "Chats", icone: MessagesSquare, modulo: "linkedin" },
  { href: "/pipeline", rotulo: "Pipeline", icone: Kanban, modulo: "linkedin" },
  { href: "/campaigns", rotulo: "Campanhas", icone: Megaphone, modulo: "linkedin" },
  { href: "/settings", rotulo: "Configurações", icone: Settings },
];

/** Com o SDR no LinkedIn ainda no primeiro acesso, as telas dele dão lugar a este item. */
const CONFIGURAR_O_SDR: Item = { href: "/onboarding", rotulo: "Configurar o SDR", icone: Rocket };

const PLATAFORMA: Item = { href: "/platform", rotulo: "Plataforma", icone: Building2 };

function ativo(item: Item, caminho: string): boolean {
  if (item.href === "/" ? caminho === "/" : caminho.startsWith(item.href)) return true;
  return (item.tambem ?? []).some((prefixo) => caminho.startsWith(prefixo));
}

/** Os itens que a organização vê: os da base e os dos módulos contratados. */
export function itensDoMenu(p: { modulos: readonly Modulo[]; linkedinNoPrimeiroAcesso: boolean; plataforma: boolean }): Item[] {
  const itens: Item[] = [];
  for (const item of ITENS) {
    if (!liberado(p.modulos, item.modulo)) continue;
    if (item.modulo === "linkedin" && p.linkedinNoPrimeiroAcesso) {
      if (!itens.includes(CONFIGURAR_O_SDR)) itens.push(CONFIGURAR_O_SDR);
      continue;
    }
    itens.push(item);
  }
  if (p.plataforma) itens.push(PLATAFORMA);
  return itens;
}

export function Navegacao({
  modulos,
  linkedinNoPrimeiroAcesso,
  plataforma,
  aoNavegar,
}: {
  modulos: readonly Modulo[];
  linkedinNoPrimeiroAcesso: boolean;
  plataforma: boolean;
  aoNavegar?: () => void;
}) {
  const caminho = usePathname();

  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-1">
        {itensDoMenu({ modulos, linkedinNoPrimeiroAcesso, plataforma }).map((item) => {
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
