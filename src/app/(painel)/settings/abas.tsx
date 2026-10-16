"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** As abas de Configurações (§4.12): só as dos módulos que a organização tem (§4.14). */
export function AbasDasConfiguracoes({ abas }: { abas: { href: string; rotulo: string }[] }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Configurações" className="segmentos mb-6">
      {abas.map((aba) => (
        <Link key={aba.href} href={aba.href} className="segmento" aria-current={caminho.startsWith(aba.href) ? "page" : undefined}>
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
