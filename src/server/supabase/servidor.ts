import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { envPublico } from "@/lib/env";
import { obterDb } from "@/server/db";
import { buscarOperadorAtivo, type Operador } from "@/server/db/operador";

/** Cliente do Supabase ligado aos cookies da requisição. Um por requisição. */
export async function criarClienteSupabase() {
  const cookieStore = await cookies();
  const env = envPublico();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
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

/** Sessão de um operador ativo. Usuário logado que não é operador volta ao login. */
export async function exigirOperador(): Promise<Operador> {
  const sessao = await exigirSessao();
  const operador = await buscarOperadorAtivo(obterDb(), sessao.userId);
  if (!operador) redirect("/login?erro=acesso");
  return operador;
}
