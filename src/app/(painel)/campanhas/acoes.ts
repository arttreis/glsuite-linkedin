"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import {
  ErroDeStatus,
  mudarStatusDaCampanha,
  salvarCampanha,
  type EntradaDeCampanha,
  type ResultadoDoSalvamento,
} from "@/server/campanhas/campanhas";
import { exigirCampanhaDoOperador } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";

export async function salvarCampanhaDoPainel(entrada: EntradaDeCampanha): Promise<ResultadoDoSalvamento> {
  const operador = await exigirOperador();
  const perfilId = z.uuid().safeParse(entrada.perfilId);
  if (!perfilId.success) return { ok: false, erros: ["Escolha o perfil."], problemas: [] };

  const [acesso] = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<{ ok: boolean }>("select public.pode_ver_perfil($1::uuid) as ok", [perfilId.data]),
  );
  if (!acesso?.ok) return { ok: false, erros: ["Você não opera este perfil."], problemas: [] };
  if (entrada.id) await exigirCampanhaDoOperador(operador.id, entrada.id);

  const resultado = await salvarCampanha(obterDb(), entrada, { operadorId: operador.id, agora: new Date() });
  if (resultado.ok) revalidatePath("/campanhas");
  return resultado;
}

const entradaDeStatus = z.object({
  campanhaId: z.uuid(),
  status: z.enum(["ativa", "pausada", "encerrada"]),
});

export async function alterarStatusDaCampanha(formData: FormData) {
  const operador = await exigirOperador();
  const { campanhaId, status } = entradaDeStatus.parse({
    campanhaId: formData.get("campanhaId"),
    status: formData.get("status"),
  });
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  // O motivo de não ativar (fluxo incompleto, campanha encerrada) volta para a
  // tela da campanha. redirect lança, então fica fora do try.
  let recusa: string | null = null;
  try {
    await mudarStatusDaCampanha(obterDb(), { campanhaId, status, operadorId: operador.id, agora: new Date() });
  } catch (erro) {
    if (!(erro instanceof ErroDeStatus)) throw erro;
    recusa = erro.message;
  }
  if (recusa !== null) redirect(`/campanhas/${campanhaId}?msg=${encodeURIComponent(recusa)}`, RedirectType.replace);
  revalidatePath(`/campanhas/${campanhaId}`);
  revalidatePath("/campanhas");
  // Ativar a campanha pode concluir os primeiros passos: o menu destranca.
  revalidatePath("/", "layout");
  // Sai da URL com o erro de uma tentativa anterior, se houver.
  redirect(`/campanhas/${campanhaId}`, RedirectType.replace);
}
