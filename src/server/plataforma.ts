import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ehAdminDaPlataforma, lerAdminsDaPlataforma } from "@/domain/modulos";
import { lerEnv } from "@/lib/env";
import type { Operador } from "@/server/db/operador";
import { emailDeAcessoSemLogin, exigirOperadorNoApp, exigirSessao } from "@/server/supabase/servidor";

// Variável vazia no .env vale como ausente.
const vazioComoAusente = (valor: unknown) => (typeof valor === "string" && valor.trim() === "" ? undefined : valor);

const envPlataforma = lerEnv(
  z.object({
    PLATAFORMA_ADMINS: z.string().optional(),
    COMERCIAL_URL: z.preprocess(vazioComoAusente, z.url().optional()),
  }),
);

/** E-mails de quem liga e desliga módulos na Plataforma (§4.14). Sem a variável, ninguém. */
export function adminsDaPlataforma(): string[] {
  return lerAdminsDaPlataforma(envPlataforma().PLATAFORMA_ADMINS);
}

/**
 * O e-mail de quem está no painel, para saber se é da plataforma. Vem do login
 * (o JWT verificado do Supabase Auth), nunca de `operadores.email`: o admin de
 * cada organização edita as linhas de operadores dela e poderia pôr ali o
 * e-mail de alguém da GuessLess.
 */
async function emailDoLogin(): Promise<string | null> {
  return emailDeAcessoSemLogin() ?? (await exigirSessao()).email?.trim().toLowerCase() ?? null;
}

/** Quem está no painel é da plataforma (GuessLess): vê a Plataforma no menu. */
export async function ehDaPlataforma(): Promise<boolean> {
  return ehAdminDaPlataforma(await emailDoLogin(), adminsDaPlataforma());
}

/** Para onde leva o "Quero contratar" do Plano, ou null sem `COMERCIAL_URL`. */
export function urlDoComercial(): string | null {
  return envPlataforma().COMERCIAL_URL ?? null;
}

/**
 * Quem é da plataforma, para a tela e as ações da Plataforma, com o e-mail do
 * login (o que vai para a trilha). Os outros recebem 404: a tela não existe
 * para eles.
 */
export async function exigirAdminDaPlataforma(): Promise<Operador & { emailDoLogin: string }> {
  const operador = await exigirOperadorNoApp();
  const email = await emailDoLogin();
  if (!email || !ehAdminDaPlataforma(email, adminsDaPlataforma())) notFound();
  return { ...operador, emailDoLogin: email };
}
