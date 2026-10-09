import { Megaphone, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { Cabecalho } from "@/components/cabecalho";
import { ROTULO_DO_ESTADO, type EstadoDoLead } from "@/domain/estados";
import { listarConversasExternas } from "@/server/conversas/externas";
import { listarConversas } from "@/server/conversas/inbox";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorLiberado } from "@/server/supabase/servidor";
import { importarHistoricoDoPainel } from "./acoes";
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
  // As conversas fora de campanha não têm estado de lead: aparecem em "Abertas" e "Todas".
  const mostrarExternas = estado === "abertas" || estado === "todas";
  const perfilId = typeof params.perfil === "string" ? params.perfil : null;

  const { conversas, externas, perfis } = await comOperador(obterDb(), operador.id, async (tx) => ({
    conversas: await listarConversas(tx, { agora: new Date(), perfilId, estado: estado as EstadoDoLead | "abertas" | "todas" }),
    externas: mostrarExternas ? await listarConversasExternas(tx, { perfilId }) : [],
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
      <Cabecalho
        titulo="Inbox"
        descricao="Todas as conversas do LinkedIn dos perfis que você opera. As de campanha vêm primeiro: quem respondeu recebe retorno em até 4 horas úteis no fuso do perfil."
      >
        <form action={importarHistoricoDoPainel}>
          {perfilId && <input type="hidden" name="perfilId" value={perfilId} />}
          <button type="submit" className="botao">
            <RefreshCw aria-hidden />
            Trazer conversas do LinkedIn
          </button>
        </form>
      </Cabecalho>
      <div className="max-w-5xl">
        {typeof params.msg === "string" && <Aviso className="mb-5">{params.msg}</Aviso>}
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

        <h2 className="mt-8 flex items-center gap-2 text-[15px] font-semibold">
          <Megaphone className="size-4 text-destaque" aria-hidden />
          De campanha ({conversas.length})
        </h2>
        {conversas.length === 0 ? (
          <p className="vazio mt-3">Nenhuma conversa de campanha com esse filtro.</p>
        ) : (
          <ul className="cartao mt-3 divide-y divide-linha overflow-hidden border-destaque/40">
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

        {mostrarExternas && (
          <>
            <h2 className="mt-10 text-[15px] font-semibold">Outras conversas do LinkedIn ({externas.length})</h2>
            <p className="mt-1 text-[13px] text-tinta-suave">
              Conversas que não vieram de campanha. Ficam só para leitura e resposta sua: sem IA, sem prazo e sem CRM.
            </p>
            {externas.length === 0 ? (
              <p className="vazio mt-3">
                Nenhuma ainda. Use &quot;Trazer conversas do LinkedIn&quot; para buscar o histórico; as novas chegam sozinhas.
              </p>
            ) : (
              <ul className="cartao mt-3 divide-y divide-linha overflow-hidden">
                {externas.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/inbox/conversa/${c.id}`}
                      className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02]"
                    >
                      <Avatar nome={c.nome ?? "?"} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{c.nome ?? "Sem nome"}</span>
                          <span className="text-xs text-tinta-fraca">perfil {c.perfil}</span>
                        </p>
                        <p className="mt-1 truncate text-sm text-tinta-suave">
                          {c.ultimaDirecao === "saida" ? "Você: " : ""}
                          {c.ultimoTexto ?? "sem mensagens"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-xs text-tinta-fraca">{quando(c.ultimaEm)}</span>
                        {c.campanha && <span className="etiqueta etiqueta-destaque">Na campanha {c.campanha}</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
