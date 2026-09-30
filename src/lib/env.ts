import { z } from "zod";

/**
 * Lê variáveis de ambiente com validação preguiçosa: nada é checado no import,
 * só no primeiro uso. Assim o build não exige segredos que só o runtime usa, e a
 * falha, quando vem, diz exatamente o que falta.
 */
export function lerEnv<T extends z.ZodType>(
  esquema: T,
  fonte: () => Record<string, string | undefined> = () => process.env,
): () => z.infer<T> {
  let cache: z.infer<T> | undefined;
  return () => {
    if (cache !== undefined) return cache;
    const resultado = esquema.safeParse(fonte());
    if (!resultado.success) {
      const problemas = resultado.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new Error(`Configuração de ambiente inválida (${problemas})`);
    }
    cache = resultado.data;
    return cache;
  };
}

// O Next só embute NEXT_PUBLIC_* no bundle do navegador quando a variável é
// lida de forma literal, por isso a fonte lista cada uma.
export const envPublico = lerEnv(
  z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  }),
  () => ({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }),
);

export const envApp = lerEnv(
  z.object({
    APP_URL: z.url().default("http://localhost:3000"),
  }),
);

/**
 * URL pública do app para links que saem do sistema (magic link, hosted auth,
 * webhooks). Em preview da Vercel usa a URL do branch; nos demais, APP_URL.
 * Nunca vem de cabeçalho da requisição, que o cliente controla.
 */
export function urlPublicaDoApp(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  return envApp().APP_URL.replace(/\/$/, "");
}
