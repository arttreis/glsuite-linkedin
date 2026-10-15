"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterResumidorDeObjetivo } from "@/server/dependencias";
import { confirmarObjetivo, resumirObjetivo, salvarRespostas, type ResultadoDoObjetivo } from "@/server/objetivo/objetivo";
import { exigirOperador } from "@/server/supabase/servidor";

/** Grava as respostas como rascunho, a cada mudança: quem fecha a aba volta com elas. */
export async function salvarObjetivo(entrada: { respostas: unknown }): Promise<ResultadoDoObjetivo> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarRespostas(tx, { organizacaoId: operador.organizacaoId, respostas: entrada.respostas, operadorId: operador.id, agora: new Date() }),
  );
  return resultado.ok ? { ok: true } : resultado;
}

/**
 * Grava as respostas e traz o resumo da IA para a pessoa validar. Roda com a
 * conexão do sistema, sempre na organização do operador: a chamada da IA leva
 * segundos e não deve segurar uma transação aberta.
 */
export async function resumirObjetivoDoPainel(entrada: {
  respostas: unknown;
}): Promise<{ ok: true; resumo: string } | { ok: false; erro: string }> {
  const operador = await exigirOperador();
  const resumidor = obterResumidorDeObjetivo();
  if (!resumidor) {
    const salvo = await salvarObjetivo(entrada);
    return { ok: false, erro: salvo.ok ? "O resumo precisa da chave da Anthropic. Peça ao admin para configurar." : salvo.erro };
  }
  return resumirObjetivo(
    { db: obterDb(), resumidor, agora: new Date() },
    { organizacaoId: operador.organizacaoId, respostas: entrada.respostas, operadorId: operador.id },
  );
}

/** Passo 3: "Confirmar". Grava o objetivo e segue para o SDR, que nasce dele e da análise. */
export async function confirmarObjetivoNoPrimeiroAcesso(): Promise<ResultadoDoObjetivo> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    confirmarObjetivo(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) return resultado;
  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/sdr");
}
