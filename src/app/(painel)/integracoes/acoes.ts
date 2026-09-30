"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ESQUEMAS_DE_CONFIGURACAO } from "@/server/configuracoes";
import { obterDb } from "@/server/db";
import { registrarEvento } from "@/server/eventos";
import { exigirOperador } from "@/server/supabase/servidor";

/** Salva o mapeamento de ids do RD (trava T-6), validado antes de gravar. */
export async function salvarConfiguracaoRd(formData: FormData) {
  const operador = await exigirOperador();
  if (operador.papel !== "admin") throw new Error("Só o admin configura integrações.");
  let valor: unknown;
  try {
    valor = JSON.parse(String(formData.get("configuracao") ?? ""));
  } catch {
    redirect("/integracoes?msg=JSON inválido.");
  }
  const validado = ESQUEMAS_DE_CONFIGURACAO.rd_station.safeParse(valor);
  if (!validado.success) {
    redirect(`/integracoes?msg=${encodeURIComponent(validado.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))}`);
  }
  const db = obterDb();
  await db.query("update public.configuracoes set valor = $1::jsonb where chave = 'rd_station'", [JSON.stringify(validado.data)]);
  await registrarEvento(db, {
    tipo: "configuracao_alterada",
    entidade: "configuracao",
    entidadeId: "rd_station",
    payload: { ativo: validado.data.ativo },
    ator: operador.id,
  });
  revalidatePath("/integracoes");
  redirect("/integracoes?msg=Configuração do RD salva.");
}
