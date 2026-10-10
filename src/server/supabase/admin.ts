import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { envPublico, lerEnv } from "@/lib/env";

const envAdmin = lerEnv(z.object({ SUPABASE_SECRET_KEY: z.string().min(1).optional() }));

/** Códigos do Auth para "esse e-mail já tem usuário": não é erro para quem só quer garantir o usuário. */
const JA_EXISTE = new Set(["email_exists", "user_already_exists"]);

/**
 * Cria o usuário no Auth pelo servidor, já confirmado, para mandar o link de
 * acesso em seguida (§4.1). Null quando falta `SUPABASE_SECRET_KEY`.
 */
export function criadorDeUsuario(): ((email: string) => Promise<void>) | null {
  const chave = envAdmin().SUPABASE_SECRET_KEY;
  if (!chave) return null;
  const supabase = createClient(envPublico().NEXT_PUBLIC_SUPABASE_URL, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return async (email) => {
    const { error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
    if (error && !JA_EXISTE.has(error.code ?? "")) throw new Error(`${error.code ?? error.status}: ${error.message}`);
  };
}
