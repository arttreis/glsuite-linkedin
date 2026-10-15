import type { Db } from "@/server/db/tipos";
import { registrarSucesso } from "@/server/despachante/envio";
import { carregarPerfil } from "@/server/despachante/perfis";
import { pausarPerfil } from "@/server/perfis/pausa";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { classificarErro, ErroUnipile } from "@/server/unipile/erros";

export type DmDeConversa = {
  acaoId: string;
  leadId: string;
  perfilId: string;
  texto: string;
  chatId: string | null;
  providerId: string;
  conviteId: string | null;
  /** Quem assina a mensagem no histórico: `ia` (rascunho aprovado como está) ou `humano`. */
  autor: "ia" | "humano";
  operadorId: string;
};

/**
 * Envia agora uma DM de conversa já reservada (`enviando`) e registra o
 * resultado. Serve à resposta manual (SDR-09) e à aprovação da fila (SDR-11).
 * Erro de conta pausa o perfil, como no despachante.
 */
export async function enviarDmDeConversa(
  deps: { db: Db; unipile: ClienteUnipile; agora: Date },
  dm: DmDeConversa,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const { db, agora } = deps;
  const perfil = (await carregarPerfil(db, dm.perfilId))!;
  let resultado: { providerMessageId: string | null; chatId: string | null };
  try {
    if (dm.chatId) {
      const enviada = await deps.unipile.enviarMensagem({ accountId: perfil.unipile_account_id, chatId: dm.chatId, texto: dm.texto });
      resultado = { providerMessageId: enviada.messageId, chatId: dm.chatId };
    } else {
      const iniciada = await deps.unipile.iniciarConversa({ accountId: perfil.unipile_account_id, providerId: dm.providerId, texto: dm.texto });
      resultado = { providerMessageId: iniciada.messageId, chatId: iniciada.chatId };
    }
  } catch (erro) {
    const motivo = erro instanceof ErroUnipile ? `${erro.status} ${erro.tipo}` : (erro as Error).message;
    await db.query("update public.acoes set status = 'falhou', erro = $2 where id = $1::uuid", [dm.acaoId, motivo]);
    if (classificarErro(erro) === "conta") {
      await pausarPerfil(db, {
        perfilId: perfil.id,
        motivo: `A Unipile recusou por problema na conta (${motivo}). Confira a conexão, checkpoint ou captcha.`,
        ator: dm.operadorId,
        agora,
      });
    }
    return { ok: false, motivo: `A Unipile não enviou a mensagem (${motivo}). Tente de novo.` };
  }

  await registrarSucesso(db, {
    perfil,
    reserva: {
      id: dm.acaoId,
      lead_id: dm.leadId,
      tipo: "dm",
      toque: null,
      origem: dm.autor,
      aprovada: true,
      tentativas: 1,
      texto: dm.texto,
      provider_id: dm.providerId,
      chat_id: dm.chatId,
      convite_id: dm.conviteId,
    },
    resultado,
    agora,
    feriados: new Set(),
  });
  return { ok: true };
}
