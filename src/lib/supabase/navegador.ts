import { createBrowserClient } from "@supabase/ssr";
import { envPublico } from "@/lib/env";
import { OPCOES_DO_COOKIE } from "@/lib/supabase/cookie";

export function criarClienteSupabaseNavegador() {
  const env = envPublico();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: OPCOES_DO_COOKIE,
  });
}
