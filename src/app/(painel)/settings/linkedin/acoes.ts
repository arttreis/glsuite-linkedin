"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { desligarPerfilDaMarca, ligarPerfilAMarca } from "@/server/perfis/marcas-dos-perfis";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

function voltar(mensagem: string): never {
  revalidatePath("/settings/linkedin");
  revalidatePath("/");
  redirect(`/settings/linkedin?msg=${encodeURIComponent(mensagem)}`);
}

const nomeDaConta = async (operadorId: string, perfilId: string) =>
  (
    await comOperador(obterDb(), operadorId, (tx) =>
      tx.query<{ nome: string }>("select nome from public.perfis where id = $1::uuid", [perfilId]),
    )
  )[0]?.nome ?? "A conta";

/** "Usar na {marca}" (§4.30): liga uma conta já conectada à marca atual. O teto continua um só. */
export async function ligarContaNaMarca(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    ligarPerfilAMarca(tx, { perfilId, marcaId: operador.marcaId, operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) voltar(resultado.erro);
  const conta = await nomeDaConta(operador.id, perfilId);
  voltar(`${conta} agora também prospecta pela ${operador.marcaNome}. O teto da conta é um só, somando todas as marcas.`);
}

/** "Tirar desta marca" (D36): pausa as campanhas da marca atual nessa conta. Religar não retoma. */
export async function tirarContaDaMarca(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = z.uuid().parse(formData.get("perfilId"));
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    desligarPerfilDaMarca(tx, { perfilId, marcaId: operador.marcaId, operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) voltar(resultado.erro);
  const conta = await nomeDaConta(operador.id, perfilId);
  const n = resultado.campanhasPausadas;
  voltar(`${conta} saiu da ${operador.marcaNome}. ${n} ${n === 1 ? "campanha pausada" : "campanhas pausadas"}.`);
}
