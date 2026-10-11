"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { urlPublicaDoApp } from "@/lib/env";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { garantirWebhooks, gerarLinkDeConexao } from "@/server/perfis/conexao";
import { ErroDeModo, registrarEval, trocarModo } from "@/server/perfis/modo";
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

export async function trocarModoDoPerfil(formData: FormData) {
  const operador = await exigirOperador();
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  const para = z.enum(["aprovacao", "automatico"]).parse(formData.get("modo"));
  await exigirAcessoAoPerfil(operador.id, perfilId);
  try {
    await trocarModo(obterDb(), { perfilId, para, operadorId: operador.id, agora: new Date() });
  } catch (erro) {
    if (!(erro instanceof ErroDeModo)) throw erro;
    bloquear(erro.motivos);
  }
  revalidatePath("/perfis");
}

export async function registrarResultadoDoEval(formData: FormData) {
  const operador = await exigirOperador();
  if (operador.papel !== "admin") throw new Error("Só o admin registra o eval.");
  const arquivo = formData.get("relatorio");
  if (!(arquivo instanceof File) || arquivo.size === 0) bloquear(["Escolha o relatorio.json da rodada."]);
  let relatorio: unknown;
  try {
    relatorio = JSON.parse(await arquivo.text());
  } catch {
    bloquear(["O arquivo não é um JSON válido."]);
  }
  let vereditos: { praca: string; veredito: string }[];
  try {
    vereditos = await registrarEval(obterDb(), { relatorio, operadorId: operador.id, agora: new Date() });
  } catch (erro) {
    if (!(erro instanceof ErroDeModo)) throw erro;
    bloquear(erro.motivos);
  }
  redirect(`/perfis?eval=${encodeURIComponent(vereditos.map((v) => `${v.praca}: ${v.veredito}`).join(", "))}`);
}

/** Volta para /perfis mostrando por que a operação foi recusada. */
function bloquear(motivos: string[]): never {
  redirect(`/perfis?${new URLSearchParams(motivos.map((m) => ["bloqueio", m]))}`);
}
