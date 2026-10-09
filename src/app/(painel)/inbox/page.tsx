import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Cabecalho } from "@/components/cabecalho";
import { ROTULO_DO_ESTADO, type EstadoDoLead } from "@/domain/estados";
import { listarConversas } from "@/server/conversas/inbox";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorLiberado } from "@/server/supabase/servidor";
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
  const operador = await exigirOperadorLiberado();
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
    <>
      <Cabecalho titulo="Inbox" descricao="Quem respondeu recebe retorno em até 4 horas úteis no fuso do perfil." />
      <div className="max-w-5xl">
        <div className="flex flex-col gap-2.5">
          <nav aria-label="Situação da conversa" className="segmentos">
            {FILTROS.map((filtro) => (
              <Link
                key={filtro.valor}
                href={link({ estado: filtro.valor })}
                className="segmento"
                aria-current={estado === filtro.valor ? "page" : undefined}
              >
                {filtro.rotulo}
              </Link>
            ))}
          </nav>
          <nav aria-label="Perfil" className="segmentos">
            <Link href={link({ perfil: null })} className="segmento" aria-current={perfilId ? undefined : "page"}>
              Todos os perfis
            </Link>
            {perfis.map((p) => (
              <Link key={p.id} href={link({ perfil: p.id })} className="segmento" aria-current={perfilId === p.id ? "page" : undefined}>
                {p.nome}
              </Link>
            ))}
          </nav>
        </div>

        {conversas.length === 0 ? (
          <p className="vazio mt-6">Nenhuma conversa com esse filtro.</p>
        ) : (
          <ul className="cartao mt-6 divide-y divide-linha overflow-hidden">
            {conversas.map((c) => (
              <li key={c.leadId}>
                <Link href={`/inbox/${c.leadId}`} className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02]">
                  <Avatar nome={c.pessoa} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{c.pessoa}</span>
                      <span className="text-xs text-tinta-fraca">
                        {c.empresa ?? "sem empresa"}, {c.perfil}, {ROTULO_DO_ESTADO[c.estado]}
                      </span>
                    </p>
                    <p className="mt-1 truncate text-sm text-tinta-suave">
                      {c.ultimaDirecao === "saida" ? "Você: " : ""}
                      {c.ultimoTexto ?? "sem mensagens"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <SeloDoSla sla={c.sla} />
                    <span className="text-xs text-tinta-fraca">{quando(c.ultimaEm)}</span>
                    {c.aguardandoAprovacao > 0 && (
                      <span className="etiqueta etiqueta-atencao">
                        {c.aguardandoAprovacao === 1 ? "1 rascunho na fila" : `${c.aguardandoAprovacao} rascunhos na fila`}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
