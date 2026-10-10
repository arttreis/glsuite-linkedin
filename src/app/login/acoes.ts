"use server";

import { z } from "zod";
import { urlPublicaDoApp } from "@/lib/env";
import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { dominiosLiberados, pedirLinkDeAcesso } from "@/server/acesso/link";
import { criadorDeUsuario } from "@/server/supabase/admin";
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
  const resultado = await pedirLinkDeAcesso(
    {
      dominios: dominiosLiberados(),
      criarUsuario: criadorDeUsuario(),
      // shouldCreateUser: false — o cadastro público do Auth fica desligado (§4.1).
      enviarLink: async (endereco) => {
        const { error } = await supabase.auth.signInWithOtp({
          email: endereco,
          options: { shouldCreateUser: false, emailRedirectTo: destino.toString() },
        });
        if (error && error.code !== "over_email_send_rate_limit") {
          console.error("Link de acesso não enviado", error.code, error.message);
        }
        return error ? (error.code ?? "desconhecido") : null;
      },
    },
    email.data,
  );
  return resultado.ok ? { status: "enviado", email: email.data } : { status: "erro", mensagem: resultado.mensagem };
}
