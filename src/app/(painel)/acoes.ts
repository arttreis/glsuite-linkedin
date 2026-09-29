"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { despausarPerfil, ErroDeAtivacao, pausarPerfil } from "@/server/perfis/pausa";
import { exigirOperador } from "@/server/supabase/servidor";

/** Qualquer operador pausa qualquer perfil, sem precisar de reunião (§4.4). */
export async function pausarPerfilDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  const motivo = z.string().trim().min(3).max(300).safeParse(formData.get("motivo"));
  if (!motivo.success) redirect("/?msg=Escreva o motivo da pausa.");
  await pausarPerfil(obterDb(), {
    perfilId,
    motivo: `Pausado por ${operador.nome}: ${motivo.data}`,
    ator: operador.id,
    agora: new Date(),
  });
  revalidatePath("/");
}

/** Despausar é sempre manual e fica em `eventos` com o operador (§4.4). */
export async function despausarPerfilDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  const [perfil] = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<{ acessivel: boolean; primeira: boolean }>(
      "select public.pode_ver_perfil(id) as acessivel, ativado_em is null as primeira from public.perfis where id = $1::uuid",
      [perfilId],
    ),
  );
  if (!perfil?.acessivel) redirect("/?msg=Você não opera este perfil.");
  if (perfil.primeira && formData.get("confirmoTravas") !== "sim") {
    redirect("/?msg=Confirme que as travas do perfil estão resolvidas antes da primeira ativação.");
  }
  try {
    await despausarPerfil(obterDb(), { perfilId, operadorId: operador.id, agora: new Date() });
  } catch (erro) {
    if (erro instanceof ErroDeAtivacao) redirect(`/?msg=${encodeURIComponent(erro.message)}`);
    throw erro;
  }
  revalidatePath("/");
}
