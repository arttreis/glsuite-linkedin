import Link from "next/link";

const ABAS = [
  { href: "/inbox", rotulo: "Inbox" },
  { href: "/aprovacao", rotulo: "Aprovação" },
  { href: "/tarefas", rotulo: "Tarefas manuais" },
] as const;

/** Conversas (§4.10): inbox, aprovação e tarefas manuais são abas do mesmo lugar no menu. */
export function AbasDeConversas({ atual }: { atual: (typeof ABAS)[number]["href"] }) {
  return (
    <nav aria-label="Conversas" className="segmentos mb-5">
      {ABAS.map((aba) => (
        <Link key={aba.href} href={aba.href} className="segmento" aria-current={aba.href === atual ? "page" : undefined}>
          {aba.rotulo}
        </Link>
      ))}
    </nav>
  );
}
