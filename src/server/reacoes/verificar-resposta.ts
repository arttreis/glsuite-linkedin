import type { Db } from "@/server/db/tipos";
import type { PerfilDoDespachante } from "@/server/despachante/perfis";
import type { Reserva } from "@/server/despachante/reserva";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { registrarMensagem } from "./mensagem";

/**
 * Rede de segurança do "erro mais caro do sistema" (§4.1): antes de cada DM que
 * o SDR manda sozinho, olha a conversa na Unipile. Se o webhook não chegou
 * (atraso, conta que oscilou), o que faltou é registrado agora e a DM não sai
 * quando:
 * - a pessoa respondeu, numa DM da régua;
 * - o dono escreveu direto no LinkedIn, em qualquer DM do SDR (§4.7).
 * Se a Unipile falhar, o erro sobe e o envio fica para depois.
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

    let parar = false;
    for (const chatId of chats) {
      // A Unipile devolve as mais recentes primeiro; registra na ordem em que aconteceram.
      const mensagens = (await deps.unipile.listarMensagens(chatId, 10))
        .filter((m) => new Date(m.em).getTime() > desde)
        .sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime());
      for (const m of mensagens) {
        const resultado = await registrarMensagem(
          deps.db,
          {
            accountId: perfil.unipile_account_id,
            chatId,
            messageId: m.id,
            texto: m.texto,
            em: m.em,
            remetenteProviderId: m.enviadaPelaConta ? m.remetenteProviderId : reserva.provider_id,
            remetenteNome: null,
            enviadaPelaConta: m.enviadaPelaConta,
            participantes: [{ providerId: reserva.provider_id, nome: null }],
          },
          deps.agora,
        );
        if (m.enviadaPelaConta ? resultado.tipo === "humano_no_linkedin" : reserva.toque !== null) parar = true;
      }
    }
    return parar;
  };
}
