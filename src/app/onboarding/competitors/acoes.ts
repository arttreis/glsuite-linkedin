"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { analisarConcorrente, confirmarConcorrentes, type ResultadoDaAnalise, type ResultadoDosConcorrentes } from "@/server/concorrentes/concorrentes";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterAnalistaDeConcorrente } from "@/server/dependencias";
import { exigirOperador } from "@/server/supabase/servidor";

/** "Analisar": lê o site do concorrente e compara com a oferta (§4.2). Vale no primeiro acesso e em Configurações. */
export async function analisarConcorrenteDoEditor(entrada: { nome: string; site: string }): Promise<ResultadoDaAnalise> {
  const operador = await exigirOperador();
  const analista = obterAnalistaDeConcorrente();
  if (!analista) return { ok: false, erro: "A análise de concorrente precisa da chave da Anthropic. Peça ao admin para configurar." };
  return analisarConcorrente(
    { db: obterDb(), analista, agora: () => new Date() },
    { organizacaoId: operador.organizacaoId, operadorId: operador.id, nome: String(entrada.nome ?? ""), site: String(entrada.site ?? "") },
  );
}

/**
 * Passo 3: "Confirmar" (ou "Não tenho concorrente direto", com a lista vazia)
 * grava e segue para o SDR, que é montado com a lista. Com erro, devolve para
 * a tela mostrar.
 */
export async function confirmarConcorrentesNoPrimeiroAcesso(entrada: { concorrentes: unknown }): Promise<ResultadoDosConcorrentes> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    confirmarConcorrentes(tx, {
      organizacaoId: operador.organizacaoId,
      concorrentes: entrada.concorrentes,
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  if (!resultado.ok) return resultado;
  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/sdr");
}
