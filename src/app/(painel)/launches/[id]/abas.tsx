"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * As abas do lançamento (§4.21). A primeira (Hoje) é a raiz do lançamento:
 * fica ativa só nela; as outras, também nas páginas de dentro.
 */
export function AbasDoLancamento({ abas }: { abas: { href: string; rotulo: string }[] }) {
  const caminho = usePathname();
  const ativa = (href: string, indice: number) => caminho === href || (indice > 0 && caminho.startsWith(`${href}/`));
  return (
    <nav aria-label="Lançamento" className="segmentos mb-6">
      {abas.map((aba, indice) => (
        <Link key={aba.href} href={aba.href} className="segmento" aria-current={ativa(aba.href, indice) ? "page" : undefined}>
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
