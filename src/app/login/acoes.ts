"use server";

import { z } from "zod";
import { urlPublicaDoApp } from "@/lib/env";
import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { criarClienteSupabase } from "@/server/supabase/servidor";

export type EstadoLogin =
  | { status: "inicial" }
  | { status: "enviado"; email: string }
  | { status: "erro"; mensagem: string };

export async function enviarLinkDeAcesso(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { status: "erro", mensagem: "Informe um e-mail válido." };

  const destino = new URL("/auth/callback", urlPublicaDoApp());
  destino.searchParams.set("proximo", caminhoInternoSeguro(String(formData.get("proximo") ?? "")));

  const supabase = await criarClienteSupabase();
  // shouldCreateUser: false — só entra quem já foi cadastrado como operador.
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { shouldCreateUser: false, emailRedirectTo: destino.toString() },
  });
  if (error) {
    return { status: "erro", mensagem: "Não foi possível enviar o link. O acesso é só para operadores cadastrados." };
  }
  return { status: "enviado", email: email.data };
}
