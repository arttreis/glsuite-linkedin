import type { Db } from "./tipos";

/**
 * Roda `fn` numa transação como o operador logado: role `authenticated` e o
 * `sub` do JWT nas claims, do mesmo jeito que o PostgREST do Supabase faz. Assim
 * o RLS vale para tudo que o painel lê e escreve.
 *
 * Use no nível mais alto da requisição: tudo dentro da transação passa a ser
 * feito como o operador.
 */
export function comOperador<T>(db: Db, operadorId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transacao(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1::text, true)", [
      JSON.stringify({ sub: operadorId, role: "authenticated" }),
    ]);
    await tx.query("set local role authenticated");
    return fn(tx);
  });
}

export type Operador = {
  id: string;
  nome: string;
  email: string;
  papel: "admin" | "operador";
};

/** Operador ativo pelo id do usuário do Supabase Auth, ou null. */
export async function buscarOperadorAtivo(db: Db, userId: string): Promise<Operador | null> {
  const [operador] = await db.query<Operador>(
    "select id, nome, email, papel from public.operadores where id = $1::uuid and ativo",
    [userId],
  );
  return operador ?? null;
}
