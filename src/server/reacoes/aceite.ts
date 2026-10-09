import type { Janela } from "@/domain/calendario";
import type { Praca } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";
import { aoAceitar } from "@/server/fluxo/motor";
import { transicionarLead } from "@/server/leads/transicoes";

export type OrigemDoAceite = "new_relation" | "nota_do_convite";

/**
 * Convite aceito (§9 SDR-07): o lead vai para `aceito`, a retirada do convite é
 * cancelada e o fluxo segue pela saída "sim" de "Aceitou o convite?" (no
 * fluxo padrão, o T2 em +2 dias úteis do aceite).
 * O aceite chega pelo webhook `new_relation` (com até 8 h de atraso) ou, quando
 * o convite tinha nota, pela própria nota aparecendo numa conversa nova.
 */
export async function registrarAceite(
  db: Db,
  p: { accountId: string; providerId: string; agora: Date; origem: OrigemDoAceite; chatId?: string | null },
): Promise<{ leadId: string | null }> {
  return db.transacao(async (tx) => {
    const [perfil] = await tx.query<{ id: string; fuso: string; janela: Janela; praca: Praca }>(
      "select id, fuso, janela, praca from public.perfis where unipile_account_id = $1",
      [p.accountId],
    );
    if (!perfil) return { leadId: null };

    const [lead] = await tx.query<{ id: string }>(
      `select l.id
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
        where pe.provider_id = $1 and l.perfil_id = $2::uuid
          and l.estado in ('convite_enviado', 'convite_retirado')
        order by l.criado_em desc
        limit 1
        for update of l`,
      [p.providerId, perfil.id],
    );
    if (!lead) return { leadId: null };

    await tx.query("update public.leads set aceito_em = $2, chat_id = coalesce(chat_id, $3) where id = $1::uuid", [
      lead.id,
      p.agora,
      p.chatId ?? null,
    ]);
    await transicionarLead(tx, { leadId: lead.id, para: "aceito", ator: "unipile", agora: p.agora, dados: { origem: p.origem } });
    await tx.query(
      `update public.acoes set status = 'cancelada', erro = 'convite aceito'
        where lead_id = $1::uuid and tipo = 'retirar_convite' and status = 'pendente'`,
      [lead.id],
    );

    await aoAceitar(tx, { perfil, leadId: lead.id, agora: p.agora, ator: "unipile" });
    return { leadId: lead.id };
  });
}
