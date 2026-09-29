/**
 * Porta do banco. SQL parametrizado ($1, $2...) com casts explícitos, para o
 * mesmo código rodar no Postgres do Supabase (driver `pg`) e no PGlite dos
 * testes.
 *
 * `transacao` dentro de uma transação reaproveita a mesma (sem savepoint), então
 * funções de repositório podem pedir atomicidade sem saber quem as chamou.
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  transacao<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/** Primeira linha ou erro: para consultas que precisam achar exatamente um registro. */
export async function umaLinha<T>(db: Db, sql: string, params?: readonly unknown[]): Promise<T> {
  const [linha] = await db.query<T>(sql, params);
  if (!linha) throw new Error(`Consulta sem resultado: ${sql.split("\n")[0]}`);
  return linha;
}
