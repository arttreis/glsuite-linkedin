import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

/**
 * Pausa o perfil (§4.4). Congela as ações sem mexer no estado dos leads: o
 * despachante simplesmente ignora perfil pausado. Idempotente: pausar um perfil
 * já pausado não gera novo evento.
 */
export async function pausarPerfil(
  db: Db,
  p: { perfilId: string; motivo: string; ator: string; agora: Date },
): Promise<boolean> {
  const pausados = await db.query(
    `update public.perfis
        set status = 'pausado', motivo_pausa = $2, pausado_em = $3
      where id = $1::uuid and status = 'ativo'
      returning id`,
    [p.perfilId, p.motivo, p.agora],
  );
  if (pausados.length === 0) return false;
  await registrarEvento(db, {
    tipo: "perfil_pausado",
    entidade: "perfil",
    entidadeId: p.perfilId,
    perfilId: p.perfilId,
    payload: { motivo: p.motivo },
    ator: p.ator,
    em: p.agora,
  });
  return true;
}
