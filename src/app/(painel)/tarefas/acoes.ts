"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { responderManualmente } from "@/server/conversas/responder";
import { obterDb } from "@/server/db";
import { obterUnipile } from "@/server/dependencias";
import { leadsVisiveis } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";
import { concluirTarefaManual } from "@/server/tarefas/tarefas";

function voltar(mensagem: string): never {
  revalidatePath("/tarefas");
  redirect(`/tarefas?msg=${encodeURIComponent(mensagem)}`);
}

/** O JP escreve a mensagem no painel e ela sai pelo LinkedIn dele (texto humano, validado). */
export async function enviarPeloPainel(formData: FormData) {
  const operador = await exigirOperador();
  const leadId = z.uuid().parse(formData.get("leadId"));
  if (!(await leadsVisiveis(operador.id, [leadId])).length) throw new Error("Lead fora do seu acesso.");
  const resultado = await responderManualmente(
    { db: obterDb(), unipile: obterUnipile(), agora: new Date() },
    {
      leadId,
      texto: String(formData.get("texto") ?? ""),
      operadorId: operador.id,
      chave: z.uuid().parse(formData.get("chave")),
    },
  );
  if (!resultado.ok) voltar([resultado.motivo, ...(resultado.violacoes ?? []).map((v) => v.mensagem)].join(" "));
  voltar("Mensagem enviada e tarefa concluída.");
}

/** O JP já mandou direto no LinkedIn (e o eco do webhook ainda não chegou). */
export async function marcarComoFeita(formData: FormData) {
  const operador = await exigirOperador();
  const leadId = z.uuid().parse(formData.get("leadId"));
  if (!(await leadsVisiveis(operador.id, [leadId])).length) throw new Error("Lead fora do seu acesso.");
  const feita = await concluirTarefaManual(obterDb(), {
    acaoId: z.uuid().parse(formData.get("acaoId")),
    agora: new Date(),
    ator: operador.id,
    como: "botao",
  });
  voltar(feita ? "Tarefa concluída. O próximo toque foi agendado." : "Essa tarefa já estava concluída.");
}
