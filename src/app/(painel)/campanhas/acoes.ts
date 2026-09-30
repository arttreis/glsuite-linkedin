"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import {
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
  await mudarStatusDaCampanha(obterDb(), { campanhaId, status, operadorId: operador.id, agora: new Date() });
  revalidatePath(`/campanhas/${campanhaId}`);
  revalidatePath("/campanhas");
}
