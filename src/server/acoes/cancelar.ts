import type { Db } from "@/server/db/tipos";

/** Cancela tudo o que ainda não saiu para o lead. */
export async function cancelarPendentes(db: Db, leadId: string, motivo: string): Promise<number> {
  const canceladas = await db.query(
    `update public.acoes set status = 'cancelada', erro = $2
      where lead_id = $1::uuid and status in ('pendente', 'aguardando_aprovacao')
      returning id`,
    [leadId, motivo],
  );
  return canceladas.length;
}
