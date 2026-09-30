import type { Janela } from "@/domain/calendario";
import { passoDoToque, sequencia } from "@/domain/sequencia";
import type { Praca } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";
import { feriadosDaPraca } from "@/server/despachante/perfis";
import { transicionarLead } from "@/server/leads/transicoes";
import { agendarToque } from "@/server/sequencia/agendar-toque";

export type OrigemDoAceite = "new_relation" | "nota_do_convite";

/**
 * Convite aceito (§9 SDR-07): o lead vai para `aceito`, a retirada do convite é
 * cancelada e o T2 fica agendado para +N dias úteis do aceite (default 2).
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

    const [lead] = await tx.query<{ id: string; sequencia: unknown }>(
      `select l.id, c.sequencia
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.campanhas c on c.id = l.campanha_id
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

    const passos = sequencia.safeParse(lead.sequencia);
    const t2 = passos.success ? passoDoToque(passos.data, "T2") : undefined;
    if (t2) {
      await agendarToque(tx, {
        perfil,
        leadId: lead.id,
        passo: t2,
        base: p.agora,
        feriados: await feriadosDaPraca(tx, perfil.praca),
      });
    }
    return { leadId: lead.id };
  });
}
