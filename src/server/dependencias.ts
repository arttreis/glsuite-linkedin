import "server-only";
import { z } from "zod";
import { lerEnv } from "@/lib/env";
import { criarClienteUnipile, type ClienteUnipile } from "@/server/unipile/cliente";

const envUnipile = lerEnv(
  z.object({
    UNIPILE_DSN: z.string().min(1),
    UNIPILE_API_KEY: z.string().min(1),
    UNIPILE_WEBHOOK_SECRET: z.string().min(16),
  }),
);

let unipile: ClienteUnipile | undefined;

export function obterUnipile(): ClienteUnipile {
  if (!unipile) {
    const env = envUnipile();
    unipile = criarClienteUnipile({ dsn: env.UNIPILE_DSN, apiKey: env.UNIPILE_API_KEY });
  }
  return unipile;
}

/** Segredo que a Unipile manda no header `Unipile-Auth` e no callback do hosted auth. */
export function segredoDaUnipile(): string {
  return envUnipile().UNIPILE_WEBHOOK_SECRET;
}

const envCron = lerEnv(z.object({ CRON_SECRET: z.string().min(16) }));

/** Segredo do tick: a Vercel Cron manda em `Authorization: Bearer`; o pg_cron também. */
export function segredoDoCron(): string {
  return envCron().CRON_SECRET;
}
