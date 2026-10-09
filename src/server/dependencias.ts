import "server-only";
import { z } from "zod";
import { lerEnv } from "@/lib/env";
import { criarModeloClaude } from "@/server/agente/claude";
import type { ModeloDeLinguagem } from "@/server/agente/modelo";
import type { EnviadorDeEmail } from "@/server/alertas/alertas";
import { criarEnviadorResend } from "@/server/alertas/resend";
import { criarClienteRd, type ClienteRd } from "@/server/rd/cliente";
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

/** A Unipile, ou undefined quando o ambiente não tem as chaves (quem chama segue sem ela). */
export function obterUnipileSeConfigurada(): ClienteUnipile | undefined {
  try {
    return obterUnipile();
  } catch {
    return undefined;
  }
}

/** Segredo que a Unipile manda no header `Unipile-Auth` e no callback do hosted auth. */
export function segredoDaUnipile(): string {
  return envUnipile().UNIPILE_WEBHOOK_SECRET;
}

const envAlertas = lerEnv(
  z.object({
    RESEND_API_KEY: z.string().min(1).optional(),
    ALERTA_REMETENTE: z.string().min(3).optional(),
  }),
);

let enviador: EnviadorDeEmail | null | undefined;

/** Enviador de alertas por e-mail, ou null se o Resend não estiver configurado. */
export function obterEnviadorDeEmail(): EnviadorDeEmail | null {
  if (enviador === undefined) {
    const env = envAlertas();
    enviador =
      env.RESEND_API_KEY && env.ALERTA_REMETENTE
        ? criarEnviadorResend({ apiKey: env.RESEND_API_KEY, remetente: env.ALERTA_REMETENTE })
        : null;
  }
  return enviador;
}

const envIa = lerEnv(
  z.object({
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    // Os modelos ficam em variável de ambiente; a troca é decidida pelo eval (§5).
    IA_MODELO_CLASSIFICACAO: z.string().min(1).default("claude-haiku-4-5"),
    IA_MODELO_RASCUNHO: z.string().min(1).default("claude-sonnet-5"),
    IA_ESFORCO_RASCUNHO: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  }),
);

let modelo: ModeloDeLinguagem | null | undefined;

/** Agente de conversa no Claude, ou null sem ANTHROPIC_API_KEY (as mensagens esperam na fila). */
export function obterModeloDeLinguagem(): ModeloDeLinguagem | null {
  if (modelo === undefined) {
    const env = envIa();
    modelo = env.ANTHROPIC_API_KEY
      ? criarModeloClaude({
          apiKey: env.ANTHROPIC_API_KEY,
          modeloClassificacao: env.IA_MODELO_CLASSIFICACAO,
          modeloRascunho: env.IA_MODELO_RASCUNHO,
          esforcoRascunho: env.IA_ESFORCO_RASCUNHO,
        })
      : null;
  }
  return modelo;
}

const envRd = lerEnv(z.object({ RD_STATION_TOKEN: z.string().min(1).optional() }));

let rd: ClienteRd | null | undefined;

/** Cliente do RD Station CRM, ou null sem token (trava T-6). */
export function obterClienteRd(): ClienteRd | null {
  if (rd === undefined) {
    const token = envRd().RD_STATION_TOKEN;
    rd = token ? criarClienteRd({ token }) : null;
  }
  return rd;
}

const envCron = lerEnv(z.object({ CRON_SECRET: z.string().min(16) }));

/** Segredo do tick: a Vercel Cron manda em `Authorization: Bearer`; o pg_cron também. */
export function segredoDoCron(): string {
  return envCron().CRON_SECRET;
}
