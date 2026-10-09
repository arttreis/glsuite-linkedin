import { CalendarCheck, ExternalLink, Hand, Star, X } from "lucide-react";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/aviso";
import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaDoEstado } from "@/components/etiquetas";
import type { EstadoDoLead } from "@/domain/estados";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { exigirOperador } from "@/server/supabase/servidor";
import { marcarConversa, registrarOptoutDaConversa } from "../acoes";
import { FormularioDeResposta } from "./resposta";

type Lead = {
  id: string;
  estado: EstadoDoLead;
  angulo: string | null;
  reuniao_em: Date | null;
  chat_id: string | null;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  url_publica: string;
  localizacao: string | null;
  optout_em: Date | null;
  campanha: string;
  perfil_id: string;
  perfil: string;
  perfil_status: string;
};

type Mensagem = { id: string; direcao: "entrada" | "saida"; autor: string; texto: string; em: Date };

const AUTORES: Record<string, string> = { prospect: "", humano: "Humano", ia: "IA", sistema: "Régua" };
const hora = (valor: Date) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const CONECTADOS: EstadoDoLead[] = ["aceito", "em_sequencia", "sem_resposta", "em_conversa", "qualificado", "reuniao_marcada", "escalado_humano"];

export default async function ConversaPage({ params, searchParams }: PageProps<"/inbox/[leadId]">) {
  const operador = await exigirOperador();
  const { leadId } = await params;
  const { msg } = await searchParams;

  const dados = await comOperador(obterDb(), operador.id, async (tx) => {
    const [lead] = await tx.query<Lead>(
      `select l.id, l.estado, l.angulo, l.reuniao_em, l.chat_id, pe.nome, pe.cargo, pe.empresa, pe.url_publica,
              pe.localizacao, pe.optout_em, c.nome as campanha, pf.id as perfil_id, pf.nome as perfil, pf.status as perfil_status
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.campanhas c on c.id = l.campanha_id
         join public.perfis pf on pf.id = l.perfil_id
        where l.id = $1::uuid`,
      [leadId],
    );
    if (!lead) return null;
    const mensagens = await tx.query<Mensagem>(
      "select id, direcao, autor, texto, em from public.mensagens where lead_id = $1::uuid order by em",
      [leadId],
    );
    return { lead, mensagens, contexto: await contextoDoPerfil(tx, lead.perfil_id) };
  });
  if (!dados) notFound();
  const { lead, mensagens, contexto } = dados;

  const bloqueio =
    lead.optout_em || lead.estado === "optout"
      ? "A pessoa pediu para não ser contatada."
      : lead.estado === "encerrado_nao"
        ? "A pessoa disse não: a conversa está encerrada."
        : lead.perfil_status !== "ativo"
          ? "O perfil está pausado. Despause na página inicial para responder pelo painel."
          : !CONECTADOS.includes(lead.estado) && !lead.chat_id
            ? "Ainda não é conexão de 1º grau: DM só depois do aceite."
            : null;

  return (
    <>
      <Cabecalho
        titulo={lead.nome}
        descricao={[lead.cargo ?? "sem cargo", lead.empresa ?? "sem empresa", lead.localizacao].filter(Boolean).join(", ")}
        voltar={{ href: "/inbox", rotulo: "Inbox" }}
      >
        <EtiquetaDoEstado estado={lead.estado} />
      </Cabecalho>

      <div className="grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {typeof msg === "string" && <Aviso className="mb-5">{msg}</Aviso>}

          <ol className="flex flex-col gap-3">
            {mensagens.length === 0 && <li className="vazio">Sem mensagens ainda.</li>}
            {mensagens.map((m) => (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm ${
                  m.direcao === "entrada"
                    ? "self-start rounded-tl-md border-linha bg-superficie"
                    : "self-end rounded-tr-md border-linha-forte bg-superficie-alta"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p>
                <p className="mt-1.5 text-[11px] text-tinta-fraca">
                  {AUTORES[m.autor] ? `${AUTORES[m.autor]}, ` : ""}
                  {hora(m.em)}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-6">
            <FormularioDeResposta leadId={lead.id} contexto={contexto} bloqueio={bloqueio} />
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="cartao p-5">
            <h2 className="text-[13px] font-medium text-tinta-suave">Contexto</h2>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-fraca">Perfil</dt>
                <dd className="text-right">{lead.perfil}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-fraca">Campanha</dt>
                <dd className="text-right">{lead.campanha}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-tinta-fraca">Ângulo</dt>
                <dd className="text-right">{lead.angulo ?? "—"}</dd>
              </div>
            </dl>
            <a href={lead.url_publica} target="_blank" rel="noreferrer" className="botao botao-pequeno mt-4 w-full">
              <ExternalLink aria-hidden />
              Abrir no LinkedIn
            </a>
          </section>

          <section className="cartao flex flex-col gap-2 p-5">
            <h2 className="mb-1 text-[13px] font-medium text-tinta-suave">Desfecho da conversa</h2>
            <form action={marcarConversa}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="para" value="qualificado" />
              <button className="botao w-full justify-start">
                <Star aria-hidden />
                Qualificado (04)
              </button>
            </form>
            <form action={marcarConversa} className="flex flex-col gap-2 rounded-xl border border-linha p-3">
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="para" value="reuniao_marcada" />
              <label className="rotulo">
                Data da reunião
                <input type="datetime-local" name="reuniaoEm" className="campo campo-pequeno" />
              </label>
              <button className="botao w-full justify-start">
                <CalendarCheck aria-hidden />
                Reunião marcada (05)
              </button>
            </form>
            <form action={marcarConversa}>
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="para" value="encerrado_nao" />
              <button className="botao w-full justify-start">
                <X aria-hidden />
                Disse não (encerrar)
              </button>
            </form>
            {!lead.optout_em && (
              <form action={registrarOptoutDaConversa}>
                <input type="hidden" name="leadId" value={lead.id} />
                <button className="botao botao-perigo w-full justify-start">
                  <Hand aria-hidden />
                  Pediu para parar (opt-out)
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
