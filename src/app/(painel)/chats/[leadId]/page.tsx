import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Avatar } from "@/components/avatar";
import type { EstadoDoLead } from "@/domain/estados";
import { abrirChat, lerFiltro, listarChats, type PassagemDoChat } from "@/server/chats/chats";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperadorNoApp } from "@/server/supabase/servidor";
import { RolarParaOFim } from "../ao-vivo";
import { Fio } from "../fio";
import { comFiltro, ListaDeChats } from "../lista";
import { MolduraDoChat } from "../moldura";
import { PainelDoLead } from "../painel-do-lead";
import { RespostaParaAprovar } from "../pendente";
import { FormularioDeResposta } from "../resposta";

/** Estados em que a pessoa é conexão de 1º grau (DM só para 1º grau, §4.13). */
const CONECTADOS: EstadoDoLead[] = ["aceito", "em_sequencia", "sem_resposta", "em_conversa", "qualificado", "reuniao_marcada", "escalado_humano"];

const SITUACAO = {
  sdr: { texto: "O SDR está conversando", classe: "etiqueta etiqueta-ponto etiqueta-ok" },
  voce: { texto: "Com você", classe: "etiqueta etiqueta-ponto" },
  precisa: { texto: "Precisa de você", classe: "etiqueta etiqueta-ponto etiqueta-atencao" },
} as const;

/** O que o SDR deixou ao passar a conversa (SDR-66): motivo, resumo e o que ele disse à pessoa. */
function PassagemDoSdr({ passagem, ponteSaiu }: { passagem: PassagemDoChat; ponteSaiu: boolean }) {
  return (
    <div className="border-t border-linha bg-destaque/[0.04] px-4 py-3 text-[13px]">
      <p className="font-medium text-destaque">O SDR passou a conversa para você{passagem.motivo ? `: ${passagem.motivo}` : ""}</p>
      {passagem.resumo && <p className="mt-1 whitespace-pre-line leading-relaxed">{passagem.resumo}</p>}
      {passagem.ponte && !passagem.ponteExcecao && (
        <p className="mt-1 text-tinta-suave">
          {ponteSaiu ? "Antes de parar, ele avisou a pessoa" : "A mensagem que avisa a pessoa ainda não saiu"}: &ldquo;{passagem.ponte}&rdquo;
        </p>
      )}
      {passagem.ponteExcecao && <p className="mt-1 text-tinta-suave">Ele não avisou a pessoa ({passagem.ponteExcecao}).</p>}
    </div>
  );
}

export default async function ChatDoLeadPage({ params, searchParams }: PageProps<"/chats/[leadId]">) {
  const operador = await exigirOperadorNoApp();
  const { leadId } = await params;
  const { filter, msg } = await searchParams;
  const filtro = lerFiltro(filter);

  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const chat = await abrirChat(tx, leadId);
    if (!chat) return null;
    return { chat, itens: await listarChats(tx, { filtro }), contexto: await contextoDoPerfil(tx, chat.lead.contaId) };
  });
  if (!dados) notFound();
  const { chat, itens, contexto } = dados;
  const { lead } = chat;

  const bloqueio = lead.optout
    ? "A pessoa pediu para não ser contatada."
    : lead.estado === "encerrado_nao"
      ? "A pessoa disse não: a conversa está encerrada."
      : !lead.contaAtiva
        ? `A conta de ${lead.conta} está pausada. Retome no Dashboard para responder.`
        : !CONECTADOS.includes(lead.estado) && !lead.chatId
          ? "Ainda não é conexão de 1º grau: mensagem só depois do aceite."
          : null;
  const aviso = ["aceito", "em_sequencia", "em_conversa", "qualificado"].includes(lead.estado)
    ? "Ao responder, você assume a conversa: o SDR para de responder aqui até você devolver."
    : null;
  const situacao = SITUACAO[chat.situacao];

  return (
    <MolduraDoChat aberta lista={<ListaDeChats itens={itens} filtro={filtro} aberto={lead.id} agora={new Date()} />}>
      <div className="grid gap-3 lg:h-full lg:min-h-0 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="cartao flex flex-col overflow-hidden lg:h-full lg:min-h-0" aria-label={`Conversa com ${lead.nome}`}>
          <header className="flex items-center gap-3 border-b border-linha px-4 py-3">
            <Link href={comFiltro("/chats", filtro)} className="botao botao-pequeno px-2 lg:hidden" aria-label="Voltar para os chats">
              <ArrowLeft aria-hidden />
            </Link>
            <Avatar nome={lead.nome} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{lead.nome}</p>
              <p className="truncate text-xs text-tinta-fraca">{[lead.cargo, lead.empresa].filter(Boolean).join(" · ")}</p>
            </div>
            <span className={`${situacao.classe} shrink-0`}>{situacao.texto}</span>
          </header>

          <details className="border-b border-linha px-4 py-3 xl:hidden">
            <summary className="cursor-pointer text-[13px] text-tinta-suave">Dados do lead</summary>
            <div className="mt-3">
              <PainelDoLead chat={chat} />
            </div>
          </details>

          {typeof msg === "string" && <Aviso className="mx-4 mt-3">{msg}</Aviso>}

          <ol className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {chat.fio.length === 0 && <li className="py-8 text-center text-sm text-tinta-fraca">Sem mensagens ainda.</li>}
            <Fio itens={chat.fio} />
            {chat.pendentes.map((pendente) => (
              <RespostaParaAprovar key={pendente.id} pendente={pendente} />
            ))}
            <li aria-hidden>
              <RolarParaOFim chave={`${chat.fio.length}-${chat.pendentes.length}`} />
            </li>
          </ol>

          {chat.passagem && !bloqueio && (
            <PassagemDoSdr
              passagem={chat.passagem}
              ponteSaiu={chat.fio.some((item) => item.tipo === "mensagem" && item.quem === "sdr" && item.texto.trim() === chat.passagem?.ponte?.trim())}
            />
          )}
          <FormularioDeResposta
            key={chat.passagem ? `passagem-${new Date(chat.passagem.em).getTime()}` : "resposta"}
            leadId={lead.id}
            contexto={contexto}
            bloqueio={bloqueio}
            aviso={aviso}
            sugestao={chat.passagem?.sugestao ?? null}
          />
        </section>

        <aside className="cartao hidden overflow-y-auto p-5 xl:block">
          <PainelDoLead chat={chat} />
        </aside>
      </div>
    </MolduraDoChat>
  );
}
