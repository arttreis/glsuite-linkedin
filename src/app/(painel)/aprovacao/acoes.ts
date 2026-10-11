"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { aprovarAcao, rejeitarAcao } from "@/server/aprovacao/aprovar";
import { assumirParado, tentarDeNovo } from "@/server/aprovacao/parados";
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

async function exigirLead(operadorId: string, valor: FormDataEntryValue | null): Promise<string> {
  const leadId = z.uuid().parse(valor);
  const [visivel] = await comOperador(obterDb(), operadorId, (tx) =>
    tx.query<{ id: string }>("select id from public.leads where id = $1::uuid", [leadId]),
  );
  if (!visivel) throw new Error("Lead fora do seu acesso.");
  return leadId;
}

function voltar(mensagem: string): never {
  revalidatePath("/aprovacao");
  revalidatePath("/chats");
  redirect(`/aprovacao?msg=${encodeURIComponent(mensagem)}`);
}

/**
 * Aprova com o texto que está na caixa. Se ele for igual ao original, conta
 * como aprovado; se mudou, como editado (a comparação fica em `aprovarAcao`).
 */
export async function aprovar(formData: FormData) {
  const operador = await exigirOperador();
  const acaoId = await exigirAcao(operador.id, formData.get("acaoId"));
  const resultado = await aprovarAcao(
    { db: obterDb(), unipile: obterUnipile(), agora: new Date() },
    { acaoId, operadorId: operador.id, textoEditado: String(formData.get("texto") ?? "") },
  );
  if (!resultado.ok) {
    voltar([resultado.motivo, ...(resultado.violacoes ?? []).map((v) => v.mensagem)].join(" "));
  }
  voltar(
    resultado.enviada
      ? "Aprovado e enviado pelo LinkedIn."
      : "Aprovado. A mensagem sai no próximo horário permitido do perfil.",
  );
}

export async function rejeitar(formData: FormData) {
  const operador = await exigirOperador();
  const acaoId = await exigirAcao(operador.id, formData.get("acaoId"));
  const rejeitada = await rejeitarAcao(obterDb(), { acaoId, operadorId: operador.id, agora: new Date() });
  voltar(rejeitada ? "Rejeitado. Nada foi enviado." : "Esse item já tinha sido decidido.");
}

export async function tentarDeNovoDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const leadId = await exigirLead(operador.id, formData.get("leadId"));
  const ok = await tentarDeNovo(obterDb(), { leadId, operadorId: operador.id, agora: new Date() });
  voltar(ok ? "A mensagem voltou para a lista abaixo. Corrija e aprove." : "Esse lead já foi resolvido.");
}

export async function assumirDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const leadId = await exigirLead(operador.id, formData.get("leadId"));
  const ok = await assumirParado(obterDb(), { leadId, operadorId: operador.id, agora: new Date() });
  voltar(ok ? "Lead com você. A sequência parou e a conversa está na Inbox." : "Esse lead já foi resolvido.");
}
