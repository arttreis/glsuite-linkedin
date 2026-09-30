import { ESTADOS_QUE_RESPONDEM, type EstadoDoLead } from "@/domain/estados";
import { detectarOptout } from "@/domain/optout";
import { cancelarPendentes } from "@/server/acoes/cancelar";
import { alertarNovaMensagem } from "@/server/conversas/alertas";
import { registrarOptout } from "@/server/conversas/optout";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { transicionarLead } from "@/server/leads/transicoes";
import { enfileirarEventoRd } from "@/server/rd/sincronizar";
import type { MensagemRecebida } from "@/server/unipile/webhooks";
import { registrarAceite } from "./aceite";

export type ResultadoDaMensagem =
  | { tipo: "ignorada" | "duplicada" | "nossa" }
  | {
      tipo: "aceite_pela_nota" | "humano_no_linkedin" | "resposta" | "conversa" | "optout";
      leadId: string;
      perfilId: string;
    };

/** Estados em que a régua ainda está rodando sozinha. */
const ESTADOS_AUTOMATICOS: readonly EstadoDoLead[] = ["na_fila", "convite_enviado", "aceito", "em_sequencia"];

type Lead = { id: string; estado: EstadoDoLead; perfil_id: string; pessoa_id: string };

async function acharLead(tx: Db, perfilId: string, m: MensagemRecebida, contraparte: string | null): Promise<Lead | null> {
  const [porChat] = await tx.query<Lead>(
    `select id, estado, perfil_id, pessoa_id from public.leads
      where perfil_id = $1::uuid and chat_id = $2
      order by criado_em desc limit 1
      for update`,
    [perfilId, m.chatId],
  );
  if (porChat || !contraparte) return porChat ?? null;
  const [porPessoa] = await tx.query<Lead>(
    `select l.id, l.estado, l.perfil_id, l.pessoa_id
       from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
      where l.perfil_id = $1::uuid and pe.provider_id = $2 and l.estado not in ('triagem', 'rejeitado')
      order by l.criado_em desc limit 1
      for update of l`,
    [perfilId, contraparte],
  );
  return porPessoa ?? null;
}

/**
 * Mensagem que a Unipile viu na conta (webhook `message_received`, que chega
 * também para o que a própria conta envia).
 *
 * Mensagem da pessoa: grava, tira o lead da régua (`em_conversa`) e cancela
 * todas as ações pendentes **na mesma transação** do webhook (§4.1).
 *
 * Mensagem da conta: pode ser
 * - o eco do que o SDR enviou;
 * - a nota do convite aparecendo numa conversa nova, que é sinal de aceite;
 * - o dono do perfil escrevendo direto no LinkedIn. Aí a régua para e o lead
 *   fica com humano.
 */
export async function registrarMensagem(db: Db, m: MensagemRecebida, agora: Date): Promise<ResultadoDaMensagem> {
  return db.transacao(async (tx): Promise<ResultadoDaMensagem> => {
    const [perfil] = await tx.query<{ id: string }>("select id from public.perfis where unipile_account_id = $1", [m.accountId]);
    if (!perfil) return { tipo: "ignorada" };

    const [conhecida] = await tx.query<{ direcao: string }>(
      "select direcao from public.mensagens where provider_message_id = $1",
      [m.messageId],
    );
    if (conhecida) return { tipo: conhecida.direcao === "saida" ? "nossa" : "duplicada" };

    const contraparte = m.enviadaPelaConta
      ? (m.participantes.map((p) => p.providerId).find((id) => id !== m.remetenteProviderId) ?? null)
      : m.remetenteProviderId;
    const lead = await acharLead(tx, perfil.id, m, contraparte);
    // Conversa com quem não é lead do SDR: não guarda nada (privacidade).
    if (!lead) return { tipo: "ignorada" };

    const quando = m.em ? new Date(m.em) : agora;
    const gravar = (direcao: "entrada" | "saida", autor: "prospect" | "humano" | "sistema") =>
      tx.query<{ id: string }>(
        `insert into public.mensagens (lead_id, perfil_id, pessoa_id, chat_id, direcao, autor, texto, provider_message_id, em)
         values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9)
         on conflict (provider_message_id) do nothing
         returning id`,
        [lead.id, perfil.id, lead.pessoa_id, m.chatId, direcao, autor, m.texto, m.messageId, quando],
      );
    await tx.query("update public.leads set chat_id = coalesce(chat_id, $2) where id = $1::uuid", [lead.id, m.chatId]);

    if (m.enviadaPelaConta) {
      // Eco de uma DM do SDR que voltou da API sem id de mensagem.
      const [eco] = await tx.query(
        `update public.mensagens set provider_message_id = $1
          where id = (
            select id from public.mensagens
             where lead_id = $2::uuid and direcao = 'saida' and provider_message_id is null
               and btrim(texto) = btrim($3) and em > $4::timestamptz - interval '1 hour'
             order by em desc limit 1)
          returning id`,
        [m.messageId, lead.id, m.texto, quando],
      );
      if (eco) return { tipo: "nossa" };

      if (lead.estado === "convite_enviado" || lead.estado === "convite_retirado") {
        const [nota] = await tx.query<{ texto_final: string | null }>(
          "select texto_final from public.acoes where lead_id = $1::uuid and tipo = 'convite' and status = 'enviada' limit 1",
          [lead.id],
        );
        if (nota?.texto_final && nota.texto_final.trim() === m.texto.trim()) {
          await gravar("saida", "sistema");
          await registrarAceite(tx, { accountId: m.accountId, providerId: contraparte ?? "", agora, origem: "nota_do_convite", chatId: m.chatId });
          return { tipo: "aceite_pela_nota", leadId: lead.id, perfilId: perfil.id };
        }
      }

      await gravar("saida", "humano");
      if (ESTADOS_AUTOMATICOS.includes(lead.estado)) {
        await cancelarPendentes(tx, lead.id, "o dono do perfil escreveu direto no LinkedIn");
        await transicionarLead(tx, {
          leadId: lead.id,
          para: "escalado_humano",
          ator: "unipile",
          agora,
          motivo: "o dono do perfil escreveu direto no LinkedIn",
        });
      }
      return { tipo: "humano_no_linkedin", leadId: lead.id, perfilId: perfil.id };
    }

    const [nova] = await gravar("entrada", "prospect");
    if (!nova) return { tipo: "duplicada" };
    await registrarEvento(tx, {
      tipo: "mensagem_recebida",
      entidade: "lead",
      entidadeId: lead.id,
      perfilId: perfil.id,
      payload: { mensagem_id: nova.id, estado: lead.estado },
      ator: "unipile",
      em: agora,
    });

    // Pedido claro para parar vira opt-out global antes de qualquer outra coisa (§7).
    if (detectarOptout(m.texto).claro) {
      const [pessoa] = await tx.query<{ provider_id: string }>(
        "select provider_id from public.pessoas where id = $1::uuid",
        [lead.pessoa_id],
      );
      await tx.query("update public.mensagens set categoria = 'optout' where id = $1::uuid", [nova.id]);
      await registrarOptout(tx, {
        providerId: pessoa!.provider_id,
        perfilOrigem: perfil.id,
        textoPedido: m.texto,
        ator: "unipile",
        agora,
      });
      return { tipo: "optout", leadId: lead.id, perfilId: perfil.id };
    }

    await alertarNovaMensagem(tx, { leadId: lead.id, perfilId: perfil.id, mensagemId: nova.id, texto: m.texto });

    if (!ESTADOS_QUE_RESPONDEM.includes(lead.estado)) return { tipo: "conversa", leadId: lead.id, perfilId: perfil.id };

    // Quem responde sai da régua na hora (§4.1): cancela e transiciona juntos.
    await cancelarPendentes(tx, lead.id, "a pessoa respondeu");
    await tx.query("update public.leads set respondeu_em = $2 where id = $1::uuid", [lead.id, agora]);
    await transicionarLead(tx, { leadId: lead.id, para: "em_conversa", ator: "unipile", agora, motivo: "respondeu" });
    await enfileirarEventoRd(tx, {
      leadId: lead.id,
      etapa: "03",
      dados: { proximo_passo: "Responder a mensagem (SLA de 4 horas úteis)", proximo_passo_em: agora.toISOString().slice(0, 10) },
    });
    return { tipo: "resposta", leadId: lead.id, perfilId: perfil.id };
  });
}
