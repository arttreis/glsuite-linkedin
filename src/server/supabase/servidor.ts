import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { liberado, linkedinNoPrimeiroAcesso, soOPrimeiroAcesso, type ExigenciaDeModulo, type Modulo } from "@/domain/modulos";
import { envPublico } from "@/lib/env";
import { OPCOES_DO_COOKIE } from "@/lib/supabase/cookie";
import { obterDb } from "@/server/db";
import { buscarOperadorAtivo, type Operador } from "@/server/db/operador";
import { ModuloNaoContratado } from "@/server/modulos/modulos";

/** Cliente do Supabase ligado aos cookies da requisição. Um por requisição. */
export async function criarClienteSupabase() {
  const cookieStore = await cookies();
  const env = envPublico();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: OPCOES_DO_COOKIE,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesParaGravar) => {
        try {
          for (const { name, value, options } of cookiesParaGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não gravam cookies; o proxy renova a sessão.
        }
      },
    },
  });
}

export type Sessao = { userId: string; email: string | null };

/** Garante sessão válida (JWT verificado) ou manda para o login. */
export async function exigirSessao(): Promise<Sessao> {
  const supabase = await criarClienteSupabase();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login");
  return { userId: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null };
}

/**
 * Login desligado: com ACESSO_SEM_LOGIN_EMAIL definida, todo mundo que abre o
 * painel entra como esse operador, sem link de acesso. Só para teste: qualquer
 * pessoa com o endereço usa o painel.
 */
export function emailDeAcessoSemLogin(): string | null {
  const email = process.env.ACESSO_SEM_LOGIN_EMAIL?.trim().toLowerCase();
  return email ? email : null;
}

/** Sessão de um operador ativo. Usuário logado que não é operador volta ao login. */
export async function exigirOperador(): Promise<Operador> {
  const semLogin = emailDeAcessoSemLogin();
  if (semLogin) {
    // Sem cookie lido, o Next pré-renderiza a página no build e congela o banco
    // daquele momento. A página tem que ler o banco a cada requisição.
    await connection();
    const [linha] = await obterDb().query<{ id: string }>(
      "select id from public.operadores where lower(email) = $1 and ativo",
      [semLogin],
    );
    const operador = linha ? await buscarOperadorAtivo(obterDb(), linha.id) : null;
    if (!operador) throw new Error(`ACESSO_SEM_LOGIN_EMAIL aponta para ${semLogin}, que não é operador ativo.`);
    return operador;
  }
  const sessao = await exigirSessao();
  const operador = await buscarOperadorAtivo(obterDb(), sessao.userId);
  if (!operador) redirect("/login?erro=acesso");
  return operador;
}

/**
 * Operador no app (§4.1 e §4.14). A organização que só tem o SDR no LinkedIn e
 * não terminou o primeiro acesso vai para `/onboarding`; com outro módulo, ela
 * entra, e só as telas do LinkedIn levam ao primeiro acesso.
 */
export async function exigirOperadorNoApp(): Promise<Operador> {
  const operador = await exigirOperador();
  if (soOPrimeiroAcesso(operador.modulos, operador.primeiroAcessoConcluido)) redirect("/onboarding");
  return operador;
}

/**
 * Página de um módulo (§4.14). Sem o módulo, abre o Plano dizendo qual falta.
 * Tela do SDR no LinkedIn com o primeiro acesso por fazer leva ao primeiro
 * acesso.
 */
export async function exigirOperadorComModulo(exige: ExigenciaDeModulo): Promise<Operador> {
  const operador = await exigirOperadorNoApp();
  const modulos: readonly Modulo[] = typeof exige === "string" ? [exige] : exige;
  if (!liberado(operador.modulos, exige)) redirect(`/settings/plan?module=${modulos[0]}`);
  if (modulos.length === 1 && modulos[0] === "linkedin" && linkedinNoPrimeiroAcesso(operador.modulos, operador.primeiroAcessoConcluido)) {
    redirect("/onboarding");
  }
  return operador;
}

/**
 * Ação do servidor de um módulo (§4.14): recusa quando a organização não tem
 * o módulo, mesmo que alguém chame a ação direto, sem a tela.
 */
export async function exigirOperadorComModuloNaAcao(modulo: Modulo): Promise<Operador> {
  const operador = await exigirOperador();
  if (!operador.modulos.includes(modulo)) throw new ModuloNaoContratado(modulo);
  return operador;
}
