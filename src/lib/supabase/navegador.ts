import { createBrowserClient } from "@supabase/ssr";
import { envPublico } from "@/lib/env";

export function criarClienteSupabaseNavegador() {
  const env = envPublico();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
