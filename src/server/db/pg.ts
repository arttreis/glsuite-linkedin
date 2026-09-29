import { Pool, types, type PoolClient } from "pg";
import type { Db } from "./tipos";

// date → 'AAAA-MM-DD' (sem virar Date no fuso do servidor); int8 → número quando cabe.
types.setTypeParser(1082, (valor: string) => valor);
types.setTypeParser(20, (valor: string) => {
  const numero = Number(valor);
  return Number.isSafeInteger(numero) ? numero : valor;
});

export type OpcoesDbPg = {
  /** Certificado da CA do Supabase (PEM). Sem ele, o TLS não valida a cadeia. */
  caCert?: string;
  max?: number;
};

function opcoesSsl(url: URL, caCert: string | undefined) {
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return undefined;
  return caCert ? { ca: caCert, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

/** Db sobre um pool do `pg`. Use a URL do pooler do Supabase (modo transação). */
export function criarDbPg(connectionString: string, opcoes: OpcoesDbPg = {}): Db & { encerrar(): Promise<void> } {
  const url = new URL(connectionString);
  // O sslmode da URL mudaria a validação do certificado; o TLS é decidido aqui.
  url.searchParams.delete("sslmode");
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: opcoesSsl(url, opcoes.caCert),
    max: opcoes.max ?? 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  const emTransacao = (cliente: PoolClient): Db => {
    const tx: Db = {
      query: async <T>(sql: string, params?: readonly unknown[]) =>
        (await cliente.query(sql, params as unknown[])).rows as T[],
      transacao: (fn) => fn(tx),
    };
    return tx;
  };

  return {
    query: async <T>(sql: string, params?: readonly unknown[]) =>
      (await pool.query(sql, params as unknown[])).rows as T[],
    async transacao<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      const cliente = await pool.connect();
      try {
        await cliente.query("begin");
        const resultado = await fn(emTransacao(cliente));
        await cliente.query("commit");
        return resultado;
      } catch (erro) {
        await cliente.query("rollback").catch(() => undefined);
        throw erro;
      } finally {
        cliente.release();
      }
    },
    encerrar: () => pool.end(),
  };
}
