import type { Db } from "@/server/db/tipos";
import type { PerfilDoDespachante } from "@/server/despachante/perfis";
import type { Reserva } from "@/server/despachante/reserva";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { registrarMensagem } from "./mensagem";

/**
 * Rede de segurança do "erro mais caro do sistema" (§4.1): antes de cada DM da
 * régua, olha a conversa na Unipile. Se a pessoa respondeu e o webhook não
 * chegou (atraso, conta que oscilou), a resposta é registrada agora e a DM não
 * sai. Se a Unipile falhar, o erro sobe e o envio fica para depois.
 */
export function criarVerificadorDeResposta(deps: { db: Db; unipile: ClienteUnipile; agora: Date }) {
  return async (perfil: PerfilDoDespachante, reserva: Reserva): Promise<boolean> => {
    const [lead] = await deps.db.query<{ desde: Date }>(
      "select coalesce(convite_enviado_em, criado_em) as desde from public.leads where id = $1::uuid",
      [reserva.lead_id],
    );
    if (!lead) return false;
    const desde = new Date(lead.desde).getTime();

    const chats = reserva.chat_id
      ? [reserva.chat_id]
      : (await deps.unipile.listarConversasComPessoa(perfil.unipile_account_id, reserva.provider_id)).map((c) => c.id);

    let respondeu = false;
    for (const chatId of chats) {
      const mensagens = await deps.unipile.listarMensagens(chatId, 10);
      for (const m of mensagens) {
        if (m.enviadaPelaConta || new Date(m.em).getTime() <= desde) continue;
        respondeu = true;
        await registrarMensagem(
          deps.db,
          {
            accountId: perfil.unipile_account_id,
            chatId,
            messageId: m.id,
            texto: m.texto,
            em: m.em,
            remetenteProviderId: reserva.provider_id,
            remetenteNome: null,
            enviadaPelaConta: false,
            participantes: [{ providerId: reserva.provider_id, nome: null }],
          },
          deps.agora,
        );
      }
    }
    return respondeu;
  };
}
