import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import type { Db } from "@/server/db/tipos";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const PASTA_MIGRATIONS = path.join(RAIZ, "supabase/migrations");

export function arquivosDeMigration(): string[] {
  return readdirSync(PASTA_MIGRATIONS)
    .filter((arquivo) => arquivo.endsWith(".sql"))
    .sort()
    .map((arquivo) => path.join(PASTA_MIGRATIONS, arquivo));
}

export async function aplicarMigrations(pg: PGliteInterface): Promise<void> {
  for (const arquivo of arquivosDeMigration()) {
    try {
      await pg.exec(readFileSync(arquivo, "utf8"));
    } catch (erro) {
      throw new Error(`Migration ${path.basename(arquivo)} falhou: ${(erro as Error).message}`);
    }
  }
}

/** Adapta o PGlite à porta `Db` usada pelo código de produção. */
export function criarDbPglite(pg: PGliteInterface): Db {
  const db: Db = {
    query: async <T>(sql: string, params?: readonly unknown[]) =>
      (await pg.query<T>(sql, params as unknown[])).rows,
    transacao: <T>(fn: (tx: Db) => Promise<T>) =>
      pg.transaction(async (transacao) => {
        const tx: Db = {
          query: async <R>(sql: string, params?: readonly unknown[]) =>
            (await transacao.query<R>(sql, params as unknown[])).rows,
          transacao: (fnInterna) => fnInterna(tx),
        };
        return fn(tx);
      }) as Promise<T>,
  };
  return db;
}

let modelo: Promise<PGliteInterface> | undefined;

async function criarModelo(): Promise<PGliteInterface> {
  // date como 'AAAA-MM-DD', igual ao driver de produção.
  const pg = await PGlite.create({ parsers: { 1082: (valor: string) => valor } });
  await pg.exec(readFileSync(path.join(RAIZ, "tests/sql/supabase-bootstrap.sql"), "utf8"));
  await aplicarMigrations(pg);
  return pg;
}

export type BancoDeTeste = { pg: PGliteInterface; db: Db };

/**
 * Banco novo com todas as migrations aplicadas. Clona um modelo migrado uma vez
 * por arquivo de teste, então cada chamada começa do zero e rápido.
 */
export async function criarBancoDeTeste(): Promise<BancoDeTeste> {
  modelo ??= criarModelo();
  const pg = await (await modelo).clone();
  return { pg, db: criarDbPglite(pg) };
}
