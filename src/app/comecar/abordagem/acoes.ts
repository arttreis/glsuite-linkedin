"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { editarTextoDaAbordagem, gerarAbordagem, permitirContato, type ResultadoDaAbordagem, type Toque } from "@/server/abordagem/recomendada";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterEscritorDeFluxo } from "@/server/dependencias";
import { exigirOperador } from "@/server/supabase/servidor";

/** Escreve a abordagem de novo, do zero. */
export async function escreverDeNovo(): Promise<ResultadoDaAbordagem> {
  const operador = await exigirOperador();
  const escritor = obterEscritorDeFluxo();
  if (!escritor) return { ok: false, erro: "Escrever a abordagem precisa da chave da Anthropic. Peça ao admin para configurar." };
  const resultado = await gerarAbordagem(
    { db: obterDb(), escritor, agora: new Date() },
    { organizacaoId: operador.organizacaoId, nome: operador.nome, operadorId: operador.id },
  );
  if (resultado.ok) revalidatePath("/comecar/abordagem");
  return resultado;
}

/** Corrige o texto de um toque. */
export async function editarToque(entrada: { toque: Toque; texto: string }): Promise<ResultadoDaAbordagem> {
  const operador = await exigirOperador();
  return comOperador(obterDb(), operador.id, (tx) =>
    editarTextoDaAbordagem(tx, { organizacaoId: operador.organizacaoId, ...entrada, operadorId: operador.id, agora: new Date() }),
  );
}

/** "Pode entrar em contato": grava a permissão e segue para o LinkedIn. */
export async function podeEntrarEmContato(): Promise<{ ok: false; erro: string } | void> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    permitirContato(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) return resultado;
  revalidatePath("/comecar", "layout");
  redirect("/comecar/linkedin");
}
