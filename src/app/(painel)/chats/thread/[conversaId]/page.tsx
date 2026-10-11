import { randomUUID } from "node:crypto";
import { ArrowLeft, ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import { lerFiltro, listarChats, quemEscreveu, type ItemDoFio } from "@/server/chats/chats";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { responderExterna } from "../../acoes";
import { RolarParaOFim } from "../../ao-vivo";
import { Fio } from "../../fio";
import { comFiltro, ListaDeChats } from "../../lista";
import { MolduraDoChat } from "../../moldura";

type Conversa = { id: string; nome: string | null; url: string | null; conta: string; conta_status: string; campanha: string | null };

/** Conversa do LinkedIn fora de campanha (§4.8): só leitura e resposta sua; o SDR não entra. */
export default async function ConversaForaDeCampanhaPage({ params, searchParams }: PageProps<"/chats/thread/[conversaId]">) {
  const operador = await exigirOperadorNoApp();
  const { conversaId } = await params;
  const { filter, msg } = await searchParams;
  const filtro = lerFiltro(filter);

  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const [conversa] = await tx.query<Conversa>(
      `select c.id, c.contraparte_nome as nome, c.contraparte_url as url, pf.nome as conta, pf.status as conta_status,
              (select ca.nome from public.leads l
                 join public.pessoas pe on pe.id = l.pessoa_id
                 join public.campanhas ca on ca.id = l.campanha_id
                where l.perfil_id = c.perfil_id and pe.provider_id = c.contraparte_provider_id
                  and l.estado not in ('triagem', 'rejeitado')
                order by l.criado_em desc limit 1) as campanha
         from public.conversas c join public.perfis pf on pf.id = c.perfil_id
        where c.id = $1::uuid and c.lead_id is null and not pf.casa`,
      [conversaId],
    );
    if (!conversa) return null;
    const mensagens = await tx.query<{ id: string; direcao: "entrada" | "saida"; autor: string; texto: string; em: Date }>(
      "select id, direcao, autor, texto, em from public.mensagens where conversa_id = $1::uuid order by em",
      [conversaId],
    );
    return { conversa, mensagens, itens: await listarChats(tx, { filtro }) };
  });
  if (!dados) notFound();
  const { conversa, mensagens, itens } = dados;
  const pausada = conversa.conta_status !== "ativo";
  const fio: ItemDoFio[] = mensagens.map((m) => ({ tipo: "mensagem", id: m.id, quem: quemEscreveu(m.direcao, m.autor), texto: m.texto, em: m.em }));
  const nome = conversa.nome ?? "Conversa do LinkedIn";

  return (
    <MolduraDoChat aberta lista={<ListaDeChats itens={itens} filtro={filtro} aberto={conversa.id} agora={new Date()} />}>
      <section className="cartao flex flex-col overflow-hidden lg:h-full lg:min-h-0" aria-label={`Conversa com ${nome}`}>
        <header className="flex items-center gap-3 border-b border-linha px-4 py-3">
          <Link href={comFiltro("/chats", filtro)} className="botao botao-pequeno px-2 lg:hidden" aria-label="Voltar para os chats">
            <ArrowLeft aria-hidden />
          </Link>
          <Avatar nome={nome} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{nome}</p>
            <p className="truncate text-xs text-tinta-fraca">Fora de campanha · {conversa.conta}</p>
          </div>
          {conversa.url && (
            <a href={conversa.url} target="_blank" rel="noreferrer" className="botao botao-pequeno shrink-0">
              <ExternalLink aria-hidden />
              LinkedIn
            </a>
          )}
        </header>

        {typeof msg === "string" && <Aviso className="mx-4 mt-3">{msg}</Aviso>}
        {conversa.campanha && (
          <Aviso className="mx-4 mt-3">
            Esta pessoa está na campanha {conversa.campanha}. Na próxima mensagem dela, a conversa passa para a campanha.
          </Aviso>
        )}

        <ol className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {fio.length === 0 && <li className="py-8 text-center text-sm text-tinta-fraca">Sem mensagens guardadas.</li>}
          <Fio itens={fio} />
          <li aria-hidden>
            <RolarParaOFim chave={String(fio.length)} />
          </li>
        </ol>

        <form action={responderExterna} className="flex flex-col gap-2.5 border-t border-linha p-3 sm:p-4">
          <input type="hidden" name="conversaId" value={conversa.id} />
          <input type="hidden" name="chave" value={randomUUID()} />
          <textarea
            name="texto"
            rows={3}
            required
            disabled={pausada}
            aria-label={`Resposta para ${nome}`}
            placeholder={pausada ? "A conta está pausada." : "Escreva uma mensagem"}
            className="campo w-full resize-y"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-tinta-fraca">
              {pausada ? "Retome a conta no Dashboard para responder." : "O SDR não entra nesta conversa: só você responde."}
            </p>
            <button type="submit" className="botao botao-primario" disabled={pausada}>
              <Send aria-hidden />
              Enviar
            </button>
          </div>
        </form>
      </section>
    </MolduraDoChat>
  );
}
