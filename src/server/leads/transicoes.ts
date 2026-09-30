import { podeTransicionar, type EstadoDoLead } from "@/domain/estados";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

export type Transicao = {
  leadId: string;
  para: EstadoDoLead;
  ator: string;
  agora: Date;
  motivo?: string;
  dados?: Record<string, unknown>;
  /** Restringe além da máquina de estados (ex.: rejeitar só quem está em triagem). */
  somenteDe?: readonly EstadoDoLead[];
};

/**
 * Muda o estado do lead se a máquina de estados permitir (§6.1) e grava o
 * evento. Trava a linha do lead: quem chama dentro de uma transação serializa
 * com o despachante e com os webhooks.
 */
export async function transicionarLead(db: Db, t: Transicao): Promise<boolean> {
  return db.transacao(async (tx) => {
    const [lead] = await tx.query<{ estado: EstadoDoLead; perfil_id: string }>(
      "select estado, perfil_id from public.leads where id = $1::uuid for update",
      [t.leadId],
    );
    if (!lead || !podeTransicionar(lead.estado, t.para)) return false;
    if (t.somenteDe && !t.somenteDe.includes(lead.estado)) return false;

    await tx.query("update public.leads set estado = $2 where id = $1::uuid", [t.leadId, t.para]);
    await registrarEvento(tx, {
      tipo: "lead_transicao",
      entidade: "lead",
      entidadeId: t.leadId,
      perfilId: lead.perfil_id,
      payload: { de: lead.estado, para: t.para, ...(t.motivo ? { motivo: t.motivo } : {}), ...t.dados },
      ator: t.ator,
      em: t.agora,
    });
    return true;
  });
}
