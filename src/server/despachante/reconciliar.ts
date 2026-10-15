import type { Feriados } from "@/domain/calendario";
import type { Praca, Toque } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { registrarSucesso } from "./envio";
import { carregarPerfil } from "./perfis";
import type { Reserva, TipoDeAcao } from "./reserva";

type EmVoo = Reserva & { perfil_id: string; praca: Praca };

/**
 * Ação presa em `enviando` (o processo morreu entre a chamada à Unipile e o
 * registro). A Unipile não tem chave de idempotência, então antes de reenviar
 * o SDR confere lá se a ação já aconteceu:
 * - convite: está nos convites pendentes?
 * - DM: a mensagem está na conversa?
 * - retirada: o convite sumiu dos pendentes?
 * Se aconteceu, registra o sucesso. Se não, a ação volta para a fila.
 */
export async function reconciliarAcoesEmVoo(
  deps: { db: Db; unipile: ClienteUnipile; agora: Date; feriadosPorPraca: Map<Praca, Feriados> },
  minutosParado = 10,
): Promise<number> {
  const { db, unipile, agora } = deps;
  const presas = await db.query<EmVoo>(
    `select a.id, a.lead_id, a.tipo, a.toque, a.origem, a.aprovada_por is not null as aprovada, a.tentativas,
            a.texto_final as texto, a.perfil_id,
            pe.provider_id, l.chat_id, l.convite_id, pf.praca
       from public.acoes a
       join public.leads l on l.id = a.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = a.perfil_id
      where a.status = 'enviando' and a.atualizada_em < $1::timestamptz
      limit 20`,
    [new Date(agora.getTime() - minutosParado * 60_000)],
  );

  let resolvidas = 0;
  for (const acao of presas) {
    const perfil = await carregarPerfil(db, acao.perfil_id);
    if (!perfil?.unipile_account_id) continue;
    const accountId = perfil.unipile_account_id;

    let aconteceu: { providerMessageId: string | null; chatId?: string | null } | null = null;
    try {
      if (acao.tipo === "convite" || acao.tipo === "retirar_convite") {
        const { itens } = await unipile.listarConvitesEnviados(accountId);
        const pendente = itens.find((convite) => convite.providerId === acao.provider_id);
        if (acao.tipo === "convite" && pendente) aconteceu = { providerMessageId: pendente.id };
        if (acao.tipo === "retirar_convite" && !pendente) aconteceu = { providerMessageId: null };
      } else {
        const chats = acao.chat_id
          ? [acao.chat_id]
          : (await unipile.listarConversasComPessoa(accountId, acao.provider_id)).map((chat) => chat.id);
        for (const chatId of chats) {
          const mensagens = await unipile.listarMensagens(chatId, 20);
          const enviada = mensagens.find((m) => m.enviadaPelaConta && m.texto.trim() === (acao.texto ?? "").trim());
          if (enviada) {
            aconteceu = { providerMessageId: enviada.id, chatId };
            break;
          }
        }
      }
    } catch {
      continue; // Unipile indisponível: tenta de novo no próximo tick.
    }

    if (aconteceu) {
      const reserva: Reserva = { ...acao, tipo: acao.tipo as TipoDeAcao, toque: acao.toque as Toque | null };
      await registrarSucesso(db, {
        perfil,
        reserva,
        resultado: aconteceu,
        agora,
        feriados: deps.feriadosPorPraca.get(acao.praca) ?? new Set(),
      });
    } else {
      await db.query(
        `update public.acoes set status = 'pendente', erro = 'reconciliada: não saiu, volta para a fila',
                texto_final = case when origem = 'template' then null else texto_final end
          where id = $1::uuid and status = 'enviando'`,
        [acao.id],
      );
    }
    resolvidas += 1;
  }
  return resolvidas;
}
