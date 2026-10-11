"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { renomearOrganizacao } from "@/server/organizacao/organizacao";
import { exigirOperador } from "@/server/supabase/servidor";

const VOLTA = "/settings/organization";

export async function salvarNomeDaOrganizacao(formData: FormData) {
  const operador = await exigirOperador();
  let resultado: Awaited<ReturnType<typeof renomearOrganizacao>>;
  try {
    resultado = await comOperador(obterDb(), operador.id, (tx) =>
      renomearOrganizacao(tx, {
        organizacaoId: operador.organizacaoId,
        nome: String(formData.get("nome") ?? ""),
        operadorId: operador.id,
        agora: new Date(),
      }),
    );
  } catch {
    redirect(`${VOLTA}?msg=${encodeURIComponent("Não deu para salvar agora. Tente de novo.")}`);
  }
  revalidatePath("/", "layout");
  redirect(`${VOLTA}?msg=${encodeURIComponent(resultado.ok ? "Nome atualizado." : resultado.erro)}`);
}
