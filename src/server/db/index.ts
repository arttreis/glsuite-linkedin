import "server-only";
import { z } from "zod";
import { lerEnv } from "@/lib/env";
import { criarDbPg } from "./pg";
import type { Db } from "./tipos";

export type { Db } from "./tipos";
export { umaLinha } from "./tipos";

const envDb = lerEnv(
  z.object({
    DATABASE_URL: z.string().min(1),
    DATABASE_CA_CERT: z.string().optional(),
  }),
);

let instancia: Db | undefined;

/** Conexão do sistema (dona das tabelas, sem RLS). Para o painel, use `comOperador`. */
export function obterDb(): Db {
  if (!instancia) {
    const env = envDb();
    instancia = criarDbPg(env.DATABASE_URL, { caCert: env.DATABASE_CA_CERT });
  }
  return instancia;
}
