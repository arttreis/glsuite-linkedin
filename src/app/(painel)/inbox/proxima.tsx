import { CircleCheck, Reply } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import type { ConversaDaInbox } from "@/server/conversas/inbox";
import { SeloDoSla } from "./sla";

/**
 * O topo da Inbox: a conversa de campanha com o prazo mais apertado (a lista
 * já vem nessa ordem). Sem ninguém esperando, diz isso e o que acontece quando
 * alguém responder.
 */
export function ProximaResposta({ conversas }: { conversas: ConversaDaInbox[] }) {
  const proxima = conversas.find((c) => c.sla?.tipo === "estourado" || c.sla?.tipo === "no_prazo");
  const esperando = conversas.filter((c) => c.sla?.tipo === "estourado" || c.sla?.tipo === "no_prazo").length;

  if (!proxima) {
    return (
      <section className="cartao proxima-resposta mb-8 flex items-center gap-4 px-6 py-5" aria-label="Próxima resposta">
        <CircleCheck className="size-6 shrink-0 text-destaque" aria-hidden />
        <div>
          <p className="font-medium">Ninguém esperando resposta.</p>
          <p className="mt-0.5 text-[13px] text-tinta-suave">
            Quando alguém responder uma campanha, a conversa aparece aqui com o prazo de 4 horas úteis.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="cartao proxima-resposta mb-8 p-6" aria-labelledby="titulo-proxima-resposta">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-proxima-resposta" className="text-[13px] text-tinta-suave">
          {esperando === 1 ? "Esperando a sua resposta" : `${esperando} esperando resposta, esta primeiro`}
        </h2>
        <SeloDoSla sla={proxima.sla} />
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="flex min-w-0 flex-1 basis-80 items-start gap-4">
          <Avatar nome={proxima.pessoa} />
          <div className="min-w-0">
            <p className="text-xl font-medium tracking-tight">{proxima.pessoa}</p>
            <p className="text-[13px] text-tinta-fraca">
              {[proxima.cargo, proxima.empresa].filter(Boolean).join(", ") || "sem empresa"}, perfil {proxima.perfil}
            </p>
            {proxima.ultimoTexto && (
              <p className="mt-3 line-clamp-2 max-w-2xl text-[15px] leading-relaxed text-tinta">“{proxima.ultimoTexto}”</p>
            )}
          </div>
        </div>
        <Link href={`/inbox/${proxima.leadId}`} className="botao botao-primario shrink-0">
          <Reply aria-hidden />
          Responder
        </Link>
      </div>
    </section>
  );
}
