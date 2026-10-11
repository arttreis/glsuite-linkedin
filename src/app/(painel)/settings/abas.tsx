"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  { href: "/settings/company", rotulo: "Empresa" },
  { href: "/settings/sdr", rotulo: "SDR" },
  { href: "/settings/linkedin", rotulo: "LinkedIn" },
  { href: "/settings/team", rotulo: "Equipe" },
] as const;

/** As abas de Configurações (§4.12): tudo o que o primeiro acesso definiu. */
export function AbasDasConfiguracoes() {
  const caminho = usePathname();
  return (
    <nav aria-label="Configurações" className="segmentos mb-6">
      {ABAS.map((aba) => (
        <Link key={aba.href} href={aba.href} className="segmento" aria-current={caminho.startsWith(aba.href) ? "page" : undefined}>
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
