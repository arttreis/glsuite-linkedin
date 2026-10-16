"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { editarTextoDaAbordagem, gerarAbordagem, permitirContato, type ResultadoDaAbordagem, type Toque } from "@/server/abordagem/recomendada";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterEscritorDeFluxo, obterSugeridorDePublicos } from "@/server/dependencias";
import { marcarNaPrevia, trocarPublicoDaPrevia } from "@/server/previa/previa";
import { listarPublicos, mudarStatusDoPublico, sugerirPublicos } from "@/server/publicos/publicos";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

const voltar = (msg: string) => redirect(`/onboarding/approach?msg=${encodeURIComponent(msg)}`);

/**
 * Usar outro público: o de agora volta a ser sugestão, a prévia recomeça e a
 * tela busca as pessoas e reescreve as mensagens para o novo.
 */
export async function trocarParaPublico(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const novo = String(formData.get("publico") ?? "");
  const agora = new Date();
  const resultado = await comOperador(obterDb(), operador.id, async (tx) => {
    const ativo = (await listarPublicos(tx, operador.organizacaoId)).find((publico) => publico.status === "ativo");
    if (ativo?.id === novo) return { ok: true } as const;
    if (ativo) await trocarPublicoDaPrevia(tx, { organizacaoId: operador.organizacaoId, publicoId: ativo.id, operadorId: operador.id, agora });
    return mudarStatusDoPublico(tx, { id: novo, acao: "escolher", operadorId: operador.id, agora });
  });
  if (!resultado.ok) voltar(resultado.erro);
  revalidatePath("/onboarding", "layout");
}

/** Outras sugestões no lugar das que estão na lista. O público em uso fica. */
export async function sugerirOutrosPublicos() {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const sugeridor = obterSugeridorDePublicos();
  if (!sugeridor) voltar("Sugerir públicos precisa da chave da Anthropic. Peça ao admin para configurar.");
  const resultado = await sugerirPublicos(
    { db: obterDb(), sugeridor: sugeridor!, agora: () => new Date() },
    { organizacaoId: operador.organizacaoId, operadorId: operador.id },
  );
  if (!resultado.ok) voltar(resultado.erro);
  revalidatePath("/onboarding/approach");
}

/** Marca ou desmarca uma pessoa da prévia. */
export async function marcarPessoaDaPrevia(entrada: { providerId: string; marcada: boolean }): Promise<{ ok: boolean }> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  return comOperador(obterDb(), operador.id, (tx) =>
    marcarNaPrevia(tx, { organizacaoId: operador.organizacaoId, ...entrada, agora: new Date() }),
  );
}

/** Escreve a abordagem de novo, do zero. A tela troca os textos com o que volta. */
export async function escreverDeNovo(): Promise<ResultadoDaAbordagem> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const escritor = obterEscritorDeFluxo();
  if (!escritor) return { ok: false, erro: "Escrever a abordagem precisa da chave da Anthropic. Peça ao admin para configurar." };
  return gerarAbordagem(
    { db: obterDb(), escritor, agora: new Date() },
    { organizacaoId: operador.organizacaoId, nome: operador.nome, operadorId: operador.id },
  );
}

/** Corrige o texto de um toque. */
export async function editarToque(entrada: { toque: Toque; texto: string }): Promise<ResultadoDaAbordagem> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  return comOperador(obterDb(), operador.id, (tx) =>
    editarTextoDaAbordagem(tx, { organizacaoId: operador.organizacaoId, ...entrada, operadorId: operador.id, agora: new Date() }),
  );
}

/** "Pode entrar em contato": fecha a prévia, grava a permissão e segue para o LinkedIn. */
export async function podeEntrarEmContato(): Promise<{ ok: false; erro: string } | void> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    permitirContato(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) return resultado;
  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/linkedin");
}
