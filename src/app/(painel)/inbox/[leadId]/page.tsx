import Link from "next/link";
import { notFound } from "next/navigation";
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
    <section className="max-w-3xl">
      <Link href="/inbox" className="text-sm text-neutral-500 underline-offset-2 hover:underline">
        ← Inbox
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{lead.nome}</h1>
          <p className="text-sm text-neutral-600">
            {lead.cargo ?? "sem cargo"} · {lead.empresa ?? "sem empresa"} · {lead.localizacao ?? ""}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {lead.perfil} · campanha {lead.campanha} · ângulo {lead.angulo ?? "—"} ·{" "}
            <a href={lead.url_publica} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              LinkedIn
            </a>
          </p>
        </div>
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium">{lead.estado}</span>
      </div>
      {typeof msg === "string" && <p className="mt-3 rounded-md bg-neutral-100 px-3 py-2 text-sm">{msg}</p>}

      <ol className="mt-5 flex flex-col gap-3">
        {mensagens.length === 0 && <li className="text-sm text-neutral-500">Sem mensagens ainda.</li>}
        {mensagens.map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.direcao === "entrada" ? "self-start bg-white ring-1 ring-neutral-200" : "self-end bg-neutral-900 text-white"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.texto}</p>
            <p className={`mt-1 text-[11px] ${m.direcao === "entrada" ? "text-neutral-400" : "text-neutral-300"}`}>
              {AUTORES[m.autor] ? `${AUTORES[m.autor]} · ` : ""}
              {hora(m.em)}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        <FormularioDeResposta leadId={lead.id} contexto={contexto} bloqueio={bloqueio} />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-neutral-200 pt-4 text-sm">
        <form action={marcarConversa}>
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="para" value="qualificado" />
          <button className="rounded-md border border-neutral-300 px-3 py-1.5">Qualificado (04)</button>
        </form>
        <form action={marcarConversa} className="flex items-end gap-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="para" value="reuniao_marcada" />
          <label className="flex flex-col text-xs text-neutral-500">
            Data da reunião
            <input type="datetime-local" name="reuniaoEm" className="rounded-md border border-neutral-300 px-2 py-1 text-sm" />
          </label>
          <button className="rounded-md border border-neutral-300 px-3 py-1.5">Reunião marcada (05)</button>
        </form>
        <form action={marcarConversa}>
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="para" value="encerrado_nao" />
          <button className="rounded-md border border-neutral-300 px-3 py-1.5">Disse não (encerrar)</button>
        </form>
        {!lead.optout_em && (
          <form action={registrarOptoutDaConversa}>
            <input type="hidden" name="leadId" value={lead.id} />
            <button className="rounded-md border border-red-300 px-3 py-1.5 text-red-700">Pediu para parar (opt-out)</button>
          </form>
        )}
      </div>
    </section>
  );
}
