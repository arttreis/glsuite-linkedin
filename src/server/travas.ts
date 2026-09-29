import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/tipos";

/**
 * Trava com prazo. Quem pega a trava tem `duracaoMs` para terminar; se morrer
 * no meio, a trava vence sozinha. Devolve a função que solta a trava, ou null
 * se ela está com outro.
 */
export async function pegarTrava(
  db: Db,
  nome: string,
  agora: Date,
  duracaoMs: number,
): Promise<(() => Promise<void>) | null> {
  const dono = randomUUID();
  const [pegou] = await db.query<{ dono: string }>(
    `insert into public.travas (nome, ate, dono) values ($1, $2::timestamptz, $3)
     on conflict (nome) do update set ate = excluded.ate, dono = excluded.dono
       where public.travas.ate < $4::timestamptz
     returning dono`,
    [nome, new Date(agora.getTime() + duracaoMs), dono, agora],
  );
  if (!pegou) return null;
  return async () => {
    await db.query("update public.travas set ate = '-infinity' where nome = $1 and dono = $2", [nome, dono]);
  };
}
