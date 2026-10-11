import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { dominiosLiberados } from "@/server/acesso/link";
import { garantirOperadorDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { obterDb } from "@/server/db";
import { criarClienteSupabase } from "@/server/supabase/servidor";

const TIPOS_OTP: EmailOtpType[] = ["email", "magiclink", "invite", "recovery", "signup", "email_change"];

/**
 * Destino do magic link: troca o código (PKCE) ou o token_hash por sessão. No
 * primeiro acesso de um e-mail liberado, cria a organização e o operador
 * (§4.1); o portão do painel manda quem não terminou o primeiro acesso para
 * `/onboarding`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const proximo = caminhoInternoSeguro(searchParams.get("proximo"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type");

  const supabase = await criarClienteSupabase();
  let valido = false;
  if (code) {
    valido = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && TIPOS_OTP.includes(tipo as EmailOtpType)) {
    valido = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo as EmailOtpType })).error;
  }
  if (!valido) return NextResponse.redirect(new URL("/login?erro=link", origin));

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!userId) return NextResponse.redirect(new URL("/login?erro=link", origin));

  const operador = await garantirOperadorDoPrimeiroAcesso(obterDb(), {
    userId,
    email,
    dominios: dominiosLiberados(),
    agora: new Date(),
  });
  if (!operador) return NextResponse.redirect(new URL("/login?erro=acesso", origin));
  return NextResponse.redirect(new URL(operador.criouOrganizacao ? "/onboarding" : proximo, origin));
}
