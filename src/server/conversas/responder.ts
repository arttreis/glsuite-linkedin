import { contextoDeValidacao } from "@/domain/campanha";
import type { EstadoDoLead } from "@/domain/estados";
import { validarMensagem, type Violacao } from "@/domain/validador";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import type { Db } from "@/server/db/tipos";
import { cancelarPendentes } from "@/server/acoes/cancelar";
import { transicionarLead } from "@/server/leads/transicoes";
import { concluirTarefaManual } from "@/server/tarefas/tarefas";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { enviarDmDeConversa } from "./enviar";

export type ResultadoDaResposta =
  | { ok: true; acaoId: string }
  | { ok: false; motivo: string; violacoes?: Violacao[] };

/** Estados em que a pessoa é conexão de 1º grau (DM só para 1º grau, §4.3). */
const CONECTADOS: readonly EstadoDoLead[] = [
  "aceito",
  "em_sequencia",
  "sem_resposta",
  "em_conversa",
  "qualificado",
  "reuniao_marcada",
  "escalado_humano",
];

/** Estados em que o SDR ainda conduz: quem responde tira ele da conversa (§4.7). */
const COM_O_SDR: readonly EstadoDoLead[] = ["aceito", "em_sequencia", "em_conversa", "qualificado"];

/**
 * Resposta escrita pela pessoa no Chats (§4.8). Passa pelo validador como
 * texto humano, sai na hora pela Unipile e entra no histórico com
 * autor = humano. A chave vem do formulário: clicar duas vezes não manda duas
 * mensagens. Quem responde assume a conversa: a régua e o que o SDR deixou
 * para aprovar param, e o lead vai para `escalado_humano` (§4.7).
 */
export async function responderManualmente(
  deps: { db: Db; unipile: ClienteUnipile; agora: Date },
  p: { leadId: string; texto: string; operadorId: string; chave: string },
): Promise<ResultadoDaResposta> {
  const { db, agora } = deps;
  const texto = p.texto.trim();

  const preparo = await db.transacao(async (tx) => {
    const [lead] = await tx.query<{
      estado: EstadoDoLead;
      perfil_id: string;
      chat_id: string | null;
      convite_id: string | null;
      provider_id: string;
      optout_em: Date | null;
      status_perfil: string;
    }>(
      `select l.estado, l.perfil_id, l.chat_id, l.convite_id, pe.provider_id, pe.optout_em, pf.status as status_perfil
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.perfis pf on pf.id = l.perfil_id
        where l.id = $1::uuid
        for update of l`,
      [p.leadId],
    );
    if (!lead) return { erro: "Lead não encontrado." };
    if (lead.optout_em || lead.estado === "optout") return { erro: "A pessoa pediu para não ser contatada." };
    if (lead.estado === "encerrado_nao") return { erro: "A pessoa disse não: a conversa está encerrada." };
    if (!CONECTADOS.includes(lead.estado) && !lead.chat_id) {
      return { erro: "Só dá para mandar DM para conexão de 1º grau ou numa conversa que a pessoa abriu." };
    }
    if (lead.status_perfil !== "ativo") {
      return { erro: "O perfil está pausado. Despause antes de responder pelo painel." };
    }

    const contexto = contextoDeValidacao(await contextoDoPerfil(tx, lead.perfil_id), null, "humano");
    const validacao = validarMensagem(texto, contexto);
    if (!validacao.ok) return { erro: "A mensagem não passou no validador.", violacoes: validacao.violacoes };

    const [acao] = await tx.query<{ id: string }>(
      `insert into public.acoes (
         lead_id, perfil_id, tipo, toque, origem, status, agendada_para, idempotency_key,
         texto_final, aprovada_por, aprovada_em, tentativas, validacao
       ) values ($1::uuid, $2::uuid, 'dm', null, 'humano', 'enviando', $3, $4, $5, $6::uuid, $3, 1, $7::jsonb)
       on conflict (idempotency_key) do nothing
       returning id`,
      [p.leadId, lead.perfil_id, agora, `manual:${p.chave}`, texto, p.operadorId, JSON.stringify(validacao)],
    );
    if (!acao) return { erro: "Essa mensagem já foi enviada." };
    return { acaoId: acao.id, lead };
  });
  if ("erro" in preparo) return { ok: false, motivo: preparo.erro ?? "Erro", violacoes: preparo.violacoes };

  const { acaoId, lead } = preparo;
  const envio = await enviarDmDeConversa(deps, {
    acaoId,
    leadId: p.leadId,
    perfilId: lead.perfil_id,
    texto,
    chatId: lead.chat_id,
    providerId: lead.provider_id,
    conviteId: lead.convite_id,
    autor: "humano",
    operadorId: p.operadorId,
  });
  if (!envio.ok) return envio;

  await db.transacao(async (tx) => {
    const tarefaFeita = await concluirTarefaManual(tx, { leadId: p.leadId, texto, agora, ator: p.operadorId, como: "painel" });
    if (!tarefaFeita && COM_O_SDR.includes(lead.estado)) {
      await cancelarPendentes(tx, p.leadId, "conversa assumida pelo operador");
      await transicionarLead(tx, { leadId: p.leadId, para: "escalado_humano", ator: p.operadorId, agora, motivo: "respondido pelo Chats" });
    }
    await tx.query("update public.leads set dono_conversa_id = coalesce(dono_conversa_id, $2::uuid) where id = $1::uuid", [
      p.leadId,
      p.operadorId,
    ]);
  });
  return { ok: true, acaoId };
}
