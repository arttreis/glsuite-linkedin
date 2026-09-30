"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { urlPublicaDoApp } from "@/lib/env";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { garantirWebhooks, gerarLinkDeConexao } from "@/server/perfis/conexao";
import { sincronizarStatusDasContas } from "@/server/perfis/status-conta";
import { exigirOperador } from "@/server/supabase/servidor";

async function exigirAcessoAoPerfil(operadorId: string, perfilId: string) {
  const [acesso] = await comOperador(obterDb(), operadorId, (tx) =>
    tx.query<{ ok: boolean }>("select public.pode_ver_perfil($1::uuid) as ok", [perfilId]),
  );
  if (!acesso?.ok) throw new Error("Você não opera este perfil.");
}

export async function conectarLinkedIn(formData: FormData) {
  const operador = await exigirOperador();
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  await exigirAcessoAoPerfil(operador.id, perfilId);
  const url = await gerarLinkDeConexao(
    { db: obterDb(), unipile: obterUnipile(), urlApp: urlPublicaDoApp(), segredo: segredoDaUnipile() },
    { perfilId, agora: new Date() },
  );
  redirect(url);
}

export async function registrarWebhooksNaUnipile() {
  const operador = await exigirOperador();
  if (operador.papel !== "admin") throw new Error("Só o admin registra webhooks.");
  const { criados } = await garantirWebhooks(obterUnipile(), { urlApp: urlPublicaDoApp(), segredo: segredoDaUnipile() });
  redirect(`/perfis?webhooks=${criados.length}`);
}

export async function atualizarStatusDasContas() {
  await exigirOperador();
  await sincronizarStatusDasContas(obterDb(), obterUnipile(), new Date());
  revalidatePath("/perfis");
}
