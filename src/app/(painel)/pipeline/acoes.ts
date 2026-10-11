"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DESTINOS_A_MAO } from "@/domain/pipeline";
import { caminhoInternoSeguro } from "@/lib/redirecionamento";
import { marcarDesfecho } from "@/server/conversas/desfecho";
import { obterDb } from "@/server/db";
import { leadsVisiveis } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";

/**
 * Mover um card à mão (§4.10): só para Qualificado, Reunião marcada ou
 * Encerrado, e só quando a transição vale (§6.1). Movimento inválido não
 * acontece e volta com o motivo.
 */
export async function moverNoPipeline(formData: FormData) {
  const operador = await exigirOperador();
  const leadId = z.uuid().parse(formData.get("leadId"));
  const [visivel] = await leadsVisiveis(operador.id, [leadId]);
  if (!visivel) throw new Error("Lead fora do seu acesso.");
  const para = z.enum(DESTINOS_A_MAO).parse(formData.get("para"));
  const reuniaoEm = z.string().min(1).safeParse(formData.get("reuniaoEm"));
  const volta = caminhoInternoSeguro(String(formData.get("voltar") ?? ""), "/pipeline");
  const comMensagem = (mensagem: string) => `${volta}${volta.includes("?") ? "&" : "?"}msg=${encodeURIComponent(mensagem)}`;

  if (para === "reuniao_marcada" && !reuniaoEm.success) redirect(comMensagem("Informe a data da reunião."));
  const mudou = await marcarDesfecho(obterDb(), {
    leadId,
    para,
    operadorId: operador.id,
    agora: new Date(),
    reuniaoEm: reuniaoEm.success ? new Date(reuniaoEm.data) : null,
  });
  revalidatePath("/pipeline");
  revalidatePath("/");
  redirect(mudou ? volta : comMensagem("Esse movimento não vale para a etapa em que o lead está."));
}
