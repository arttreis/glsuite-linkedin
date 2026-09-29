import { contextoDeValidacao } from "@/domain/campanha";
import type { EstadoDoLead } from "@/domain/estados";
import { validarMensagem, type Violacao } from "@/domain/validador";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import type { Db } from "@/server/db/tipos";
import { registrarSucesso } from "@/server/despachante/envio";
import { carregarPerfil } from "@/server/despachante/perfis";
import { transicionarLead } from "@/server/leads/transicoes";
import { pausarPerfil } from "@/server/perfis/pausa";
import { cancelarPendentes } from "@/server/reacoes/mensagem";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { classificarErro, ErroUnipile } from "@/server/unipile/erros";

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

/**
 * Resposta escrita pelo operador no painel (§9 SDR-09). Passa pelo validador
 * como texto humano, sai na hora pela Unipile e entra no histórico com
 * autor = humano. A chave vem do formulário: clicar duas vezes não manda duas
 * mensagens. Se a régua ainda rodava para o lead, ela para (a conversa é do
 * humano).
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
  const perfil = (await carregarPerfil(db, lead.perfil_id))!;
  let resultado: { providerMessageId: string | null; chatId: string | null };
  try {
    if (lead.chat_id) {
      const enviada = await deps.unipile.enviarMensagem({ accountId: perfil.unipile_account_id, chatId: lead.chat_id, texto });
      resultado = { providerMessageId: enviada.messageId, chatId: lead.chat_id };
    } else {
      const iniciada = await deps.unipile.iniciarConversa({ accountId: perfil.unipile_account_id, providerId: lead.provider_id, texto });
      resultado = { providerMessageId: iniciada.messageId, chatId: iniciada.chatId };
    }
  } catch (erro) {
    const motivo = erro instanceof ErroUnipile ? `${erro.status} ${erro.tipo}` : (erro as Error).message;
    await db.query("update public.acoes set status = 'falhou', erro = $2 where id = $1::uuid", [acaoId, motivo]);
    if (classificarErro(erro) === "conta") {
      await pausarPerfil(db, {
        perfilId: perfil.id,
        motivo: `A Unipile recusou por problema na conta (${motivo}). Confira a conexão, checkpoint ou captcha.`,
        ator: p.operadorId,
        agora,
      });
    }
    return { ok: false, motivo: `A Unipile não enviou a mensagem (${motivo}). Tente de novo.` };
  }

  await registrarSucesso(db, {
    perfil,
    reserva: {
      id: acaoId,
      lead_id: p.leadId,
      tipo: "dm",
      toque: null,
      origem: "humano",
      tentativas: 1,
      texto,
      provider_id: lead.provider_id,
      chat_id: lead.chat_id,
      convite_id: lead.convite_id,
    },
    resultado,
    agora,
    feriados: new Set(),
  });

  await db.transacao(async (tx) => {
    if (lead.estado === "aceito" || lead.estado === "em_sequencia") {
      await cancelarPendentes(tx, p.leadId, "conversa assumida pelo operador");
      await transicionarLead(tx, { leadId: p.leadId, para: "escalado_humano", ator: p.operadorId, agora, motivo: "respondido pelo painel" });
    }
    await tx.query("update public.leads set dono_conversa_id = coalesce(dono_conversa_id, $2::uuid) where id = $1::uuid", [
      p.leadId,
      p.operadorId,
    ]);
  });
  return { ok: true, acaoId };
}
