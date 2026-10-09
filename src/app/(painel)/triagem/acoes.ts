"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { leadsVisiveis } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";
import { aprovarLeads, rejeitarLeads } from "@/server/triagem/triagem";

const ids = z.array(z.uuid()).max(500);

function voltar(formData: FormData, mensagem: string) {
  const campanha = z.uuid().safeParse(formData.get("campanha"));
  const params = new URLSearchParams({ msg: mensagem });
  if (campanha.success) params.set("campanha", campanha.data);
  revalidatePath("/triagem");
  revalidatePath("/", "layout");
  redirect(`/triagem?${params.toString()}`);
}

export async function aprovarSelecionados(formData: FormData) {
  const operador = await exigirOperador();
  const selecionados = await leadsVisiveis(operador.id, ids.parse(formData.getAll("leadIds")));
  const { aprovados, recusados } = await aprovarLeads(obterDb(), {
    leadIds: selecionados,
    operadorId: operador.id,
    agora: new Date(),
  });
  const motivos = [...new Set(recusados.map((r) => r.motivo))];
  const detalhe = recusados.length > 0 ? ` ${recusados.length} não aprovados: ${motivos.join("; ")}.` : "";
  voltar(formData, `${aprovados.length} aprovados: o convite sai no próximo horário permitido do perfil.${detalhe}`);
}

export async function rejeitarSelecionados(formData: FormData) {
  const operador = await exigirOperador();
  const selecionados = await leadsVisiveis(operador.id, ids.parse(formData.getAll("leadIds")));
  const rejeitados = await rejeitarLeads(obterDb(), { leadIds: selecionados, operadorId: operador.id, agora: new Date() });
  voltar(formData, `${rejeitados} rejeitados. Nada foi enviado.`);
}
