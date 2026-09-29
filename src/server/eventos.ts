import type { Db } from "@/server/db/tipos";

export type NovoEvento = {
  tipo: string;
  entidade: string;
  entidadeId?: string | null;
  perfilId?: string | null;
  payload?: Record<string, unknown>;
  /** `sistema`, `unipile`, `webhook` ou o id do operador. */
  ator?: string;
  em?: Date;
};

/** Grava na trilha de auditoria. Toda transição de estado passa por aqui. */
export async function registrarEvento(db: Db, evento: NovoEvento): Promise<void> {
  await db.query(
    `insert into public.eventos (tipo, entidade, entidade_id, perfil_id, payload, ator, em)
     values ($1, $2, $3, $4::uuid, $5::jsonb, $6, coalesce($7::timestamptz, now()))`,
    [
      evento.tipo,
      evento.entidade,
      evento.entidadeId ?? null,
      evento.perfilId ?? null,
      JSON.stringify(evento.payload ?? {}),
      evento.ator ?? "sistema",
      evento.em ?? null,
    ],
  );
}
