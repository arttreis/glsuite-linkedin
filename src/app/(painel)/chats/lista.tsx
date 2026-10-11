import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { FILTROS_DO_CHAT, type FiltroDoChat, type ItemDoChat, type Situacao } from "@/server/chats/chats";
import { importarHistoricoDoChat } from "./acoes";

const FUSO = "America/Sao_Paulo";

/** Hora para a lista: só a hora se foi hoje, "ontem", ou a data. */
export function horaCurta(valor: Date | null, agora: Date): string {
  if (!valor) return "";
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: FUSO });
  const em = new Date(valor);
  if (dia(em) === dia(agora)) return em.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
  if (dia(em) === dia(new Date(agora.getTime() - 24 * 60 * 60 * 1000))) return "ontem";
  return em.toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
}

const SELO: Record<Situacao, { texto: string; classe: string } | null> = {
  precisa: { texto: "Precisa de você", classe: "etiqueta etiqueta-ponto etiqueta-atencao" },
  voce: { texto: "Com você", classe: "etiqueta" },
  sdr: null,
  fora: { texto: "Fora de campanha", classe: "etiqueta" },
};

const PREFIXO = { voce: "Você: ", sdr: "SDR: ", lead: "" } as const;

export const comFiltro = (href: string, filtro: FiltroDoChat) => (filtro === "all" ? href : `${href}?filter=${filtro}`);

/** A coluna da esquerda: os filtros e as conversas, a mais recente primeiro. */
export function ListaDeChats({
  itens,
  filtro,
  aberto,
  agora,
}: {
  itens: ItemDoChat[];
  filtro: FiltroDoChat;
  aberto: string | null;
  agora: Date;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <h1 className="text-lg font-semibold">Chats</h1>
        <form action={importarHistoricoDoChat}>
          <button type="submit" className="botao botao-pequeno px-2" title="Trazer conversas do LinkedIn" aria-label="Trazer conversas do LinkedIn">
            <RefreshCw aria-hidden />
          </button>
        </form>
      </div>
      <nav aria-label="Filtrar conversas" className="flex flex-wrap gap-1.5 px-3 pb-3">
        {FILTROS_DO_CHAT.map((f) => (
          <Link
            key={f.id}
            href={comFiltro("/chats", f.id)}
            aria-current={f.id === filtro ? "page" : undefined}
            className="shrink-0 rounded-full border border-linha px-3 py-1 text-[13px] whitespace-nowrap text-tinta-suave aria-[current=page]:border-destaque/40 aria-[current=page]:bg-destaque/10 aria-[current=page]:text-tinta"
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>
      {itens.length === 0 ? (
        <p className="mx-4 mb-4 rounded-xl border border-dashed border-linha-forte px-4 py-8 text-center text-sm text-tinta-suave">
          {filtro === "needs-you" ? "Nada esperando por você." : "Nenhuma conversa aqui ainda."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-linha">
          {itens.map((item) => {
            const selo = SELO[item.situacao];
            return (
              <li key={item.id}>
                <Link
                  href={comFiltro(item.href, filtro)}
                  aria-current={item.id === aberto ? "page" : undefined}
                  className="flex items-start gap-3 border-b border-linha px-4 py-3 transition-colors hover:bg-white/[0.02] aria-[current=page]:bg-superficie-alta"
                >
                  <Avatar nome={item.nome} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.nome}</span>
                      <span className="shrink-0 text-[11px] text-tinta-fraca tabular-nums">{horaCurta(item.ultimaEm, agora)}</span>
                    </p>
                    <p className="truncate text-xs text-tinta-fraca">{[item.empresa, item.conta].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 truncate text-[13px] text-tinta-suave">
                      {item.ultimoAutor ? PREFIXO[item.ultimoAutor] : ""}
                      {item.ultimoTexto ?? "sem mensagens"}
                    </p>
                    {selo && <span className={`${selo.classe} mt-1.5`}>{selo.texto}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
