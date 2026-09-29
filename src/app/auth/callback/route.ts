import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { criarClienteSupabase } from "@/server/supabase/servidor";

const TIPOS_OTP: EmailOtpType[] = ["email", "magiclink", "invite", "recovery", "signup", "email_change"];

/** Destino do magic link: troca o código (PKCE) ou o token_hash por sessão. */
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

  return NextResponse.redirect(new URL(valido ? proximo : "/login?erro=link", origin));
}
