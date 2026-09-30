import type { Db } from "@/server/db/tipos";
import { transicionarLead } from "@/server/leads/transicoes";
import { enfileirarEventoRd } from "@/server/rd/sincronizar";
import { cancelarPendentes } from "@/server/acoes/cancelar";

export type Desfecho = "qualificado" | "reuniao_marcada" | "encerrado_nao" | "escalado_humano" | "em_conversa";

/**
 * O humano marca o andamento da conversa (§4.9): qualificado (04), reunião
 * marcada (05, com data) ou encerrado porque disse não (sem recuperação, §4.6).
 */
export async function marcarDesfecho(
  db: Db,
  p: { leadId: string; para: Desfecho; operadorId: string; agora: Date; reuniaoEm?: Date | null },
): Promise<boolean> {
  return db.transacao(async (tx) => {
    const mudou = await transicionarLead(tx, {
      leadId: p.leadId,
      para: p.para,
      ator: p.operadorId,
      agora: p.agora,
      dados: p.reuniaoEm ? { reuniao_em: p.reuniaoEm.toISOString() } : undefined,
    });
    if (!mudou) return false;
    if (p.para === "reuniao_marcada" && p.reuniaoEm) {
      await tx.query("update public.leads set reuniao_em = $2 where id = $1::uuid", [p.leadId, p.reuniaoEm]);
    }
    if (p.para === "encerrado_nao") await cancelarPendentes(tx, p.leadId, "disse não");
    if (p.para === "qualificado") await enfileirarEventoRd(tx, { leadId: p.leadId, etapa: "04" });
    if (p.para === "reuniao_marcada") {
      await enfileirarEventoRd(tx, { leadId: p.leadId, etapa: "05", dados: { reuniao_em: p.reuniaoEm?.toISOString() ?? null } });
    }
    await tx.query("update public.leads set dono_conversa_id = coalesce(dono_conversa_id, $2::uuid) where id = $1::uuid", [
      p.leadId,
      p.operadorId,
    ]);
    return true;
  });
}
