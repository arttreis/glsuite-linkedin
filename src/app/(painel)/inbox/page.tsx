import Link from "next/link";
import type { EstadoDoLead } from "@/domain/estados";
import { listarConversas } from "@/server/conversas/inbox";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { SeloDoSla } from "./sla";

const FILTROS: { valor: string; rotulo: string }[] = [
  { valor: "abertas", rotulo: "Abertas" },
  { valor: "em_conversa", rotulo: "Em conversa" },
  { valor: "escalado_humano", rotulo: "Com humano" },
  { valor: "qualificado", rotulo: "Qualificadas" },
  { valor: "reuniao_marcada", rotulo: "Reunião marcada" },
  { valor: "todas", rotulo: "Todas" },
];

const quando = (valor: Date | null) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const operador = await exigirOperador();
  const params = await searchParams;
  const estado = typeof params.estado === "string" ? params.estado : "abertas";
  const perfilId = typeof params.perfil === "string" ? params.perfil : null;

  const { conversas, perfis } = await comOperador(obterDb(), operador.id, async (tx) => ({
    conversas: await listarConversas(tx, { agora: new Date(), perfilId, estado: estado as EstadoDoLead | "abertas" | "todas" }),
    perfis: await tx.query<{ id: string; nome: string }>(
      "select id, nome from public.perfis where public.pode_ver_perfil(id) order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], slug)",
    ),
  }));

  const link = (mudanca: Record<string, string | null>) => {
    const novo = new URLSearchParams();
    const atual = { estado, perfil: perfilId, ...mudanca };
    for (const [chave, valor] of Object.entries(atual)) if (valor) novo.set(chave, valor);
    return `/inbox?${novo.toString()}`;
  };

  return (
    <section className="max-w-5xl">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <p className="mt-1 text-sm text-neutral-600">Quem respondeu recebe retorno em até 4 horas úteis no fuso do perfil.</p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {FILTROS.map((filtro) => (
          <Link
            key={filtro.valor}
            href={link({ estado: filtro.valor })}
            className={`rounded-full border px-3 py-1 ${estado === filtro.valor ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300"}`}
          >
            {filtro.rotulo}
          </Link>
        ))}
        <span className="mx-1 text-neutral-300">|</span>
        <Link href={link({ perfil: null })} className={`rounded-full border px-3 py-1 ${perfilId ? "border-neutral-300" : "border-neutral-900"}`}>
          Todos os perfis
        </Link>
        {perfis.map((p) => (
          <Link key={p.id} href={link({ perfil: p.id })} className={`rounded-full border px-3 py-1 ${perfilId === p.id ? "border-neutral-900" : "border-neutral-300"}`}>
            {p.nome}
          </Link>
        ))}
      </div>

      {conversas.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Nenhuma conversa aqui.</p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {conversas.map((c) => (
            <li key={c.leadId}>
              <Link href={`/inbox/${c.leadId}`} className="flex items-start justify-between gap-4 px-4 py-3 hover:bg-neutral-50">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.pessoa}
                    <span className="ml-2 text-xs font-normal text-neutral-500">
                      {c.empresa ?? "sem empresa"} · {c.perfil} · {c.estado}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-sm text-neutral-600">
                    {c.ultimaDirecao === "saida" ? "Você: " : ""}
                    {c.ultimoTexto ?? "sem mensagens"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SeloDoSla sla={c.sla} />
                  <span className="text-xs text-neutral-400">{quando(c.ultimaEm)}</span>
                  {c.aguardandoAprovacao > 0 && <span className="text-xs text-amber-700">{c.aguardandoAprovacao} rascunho na fila</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
