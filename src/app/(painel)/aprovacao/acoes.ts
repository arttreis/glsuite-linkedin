"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aprovarAcao, rejeitarAcao } from "@/server/aprovacao/aprovar";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterUnipile } from "@/server/dependencias";
import { exigirOperador } from "@/server/supabase/servidor";

async function exigirAcao(operadorId: string, valor: FormDataEntryValue | null): Promise<string> {
  const acaoId = z.uuid().parse(valor);
  const [visivel] = await comOperador(obterDb(), operadorId, (tx) =>
    tx.query<{ id: string }>("select id from public.acoes where id = $1::uuid", [acaoId]),
  );
  if (!visivel) throw new Error("Item fora do seu acesso.");
  return acaoId;
}

function voltar(mensagem: string): never {
  revalidatePath("/aprovacao");
  revalidatePath("/inbox");
  redirect(`/aprovacao?msg=${encodeURIComponent(mensagem)}`);
}

async function aprovar(formData: FormData, comEdicao: boolean) {
  const operador = await exigirOperador();
  const acaoId = await exigirAcao(operador.id, formData.get("acaoId"));
  const texto = comEdicao ? String(formData.get("texto") ?? "") : null;
  const resultado = await aprovarAcao(
    { db: obterDb(), unipile: obterUnipile(), agora: new Date() },
    { acaoId, operadorId: operador.id, textoEditado: texto },
  );
  if (!resultado.ok) {
    voltar([resultado.motivo, ...(resultado.violacoes ?? []).map((v) => v.mensagem)].join(" "));
  }
  voltar(resultado.enviada ? "Aprovado e enviado." : "Aprovado: volta para a fila do despachante com o texto corrigido.");
}

export async function aprovarComoEsta(formData: FormData) {
  await aprovar(formData, false);
}

export async function aprovarComEdicao(formData: FormData) {
  await aprovar(formData, true);
}

export async function rejeitar(formData: FormData) {
  const operador = await exigirOperador();
  const acaoId = await exigirAcao(operador.id, formData.get("acaoId"));
  const rejeitada = await rejeitarAcao(obterDb(), { acaoId, operadorId: operador.id, agora: new Date() });
  voltar(rejeitada ? "Rejeitado. Nada foi enviado." : "Esse item já tinha sido decidido.");
}
