import Link from "next/link";

const ABAS = [
  { href: "/chats", rotulo: "Chats" },
  { href: "/aprovacao", rotulo: "Aprovação" },
  { href: "/tarefas", rotulo: "Tarefas manuais" },
] as const;

/** Chats, aprovação e tarefas manuais são abas do mesmo lugar no menu, até a aprovação e as tarefas saírem (SDR-53). */
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
