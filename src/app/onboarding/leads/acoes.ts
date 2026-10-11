"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterSugeridorDePublicos } from "@/server/dependencias";
import { confirmarPrevia, marcarNaPrevia, trocarPublicoDaPrevia } from "@/server/previa/previa";
import { mudarStatusDoPublico, sugerirPublicos } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";

const voltar = (msg: string) => redirect(`/onboarding/leads?msg=${encodeURIComponent(msg)}`);

/** "Esse é o meu lead": a sugestão vira o público da prévia. */
export async function escolherPublicoNoPrimeiroAcesso(formData: FormData) {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    mudarStatusDoPublico(tx, { id: String(formData.get("publico") ?? ""), acao: "escolher", operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) voltar(resultado.erro);
  revalidatePath("/onboarding/leads");
}

/** Outras sugestões no lugar das que estão na tela. */
export async function sugerirOutrosPublicos() {
  const operador = await exigirOperador();
  const sugeridor = obterSugeridorDePublicos();
  if (!sugeridor) voltar("Sugerir públicos precisa da chave da Anthropic. Peça ao admin para configurar.");
  const resultado = await sugerirPublicos(
    { db: obterDb(), sugeridor: sugeridor!, agora: () => new Date() },
    { organizacaoId: operador.organizacaoId, operadorId: operador.id },
  );
  if (!resultado.ok) voltar(resultado.erro);
  revalidatePath("/onboarding/leads");
}

/** "Trocar o perfil do lead": volta para as sugestões. */
export async function trocarPerfilDoLead(formData: FormData) {
  const operador = await exigirOperador();
  await comOperador(obterDb(), operador.id, (tx) =>
    trocarPublicoDaPrevia(tx, {
      organizacaoId: operador.organizacaoId,
      publicoId: String(formData.get("publico") ?? ""),
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  revalidatePath("/onboarding", "layout");
}

/** Marca ou desmarca uma pessoa da prévia. */
export async function marcarPessoaDaPrevia(entrada: { providerId: string; marcada: boolean }): Promise<{ ok: boolean }> {
  const operador = await exigirOperador();
  return comOperador(obterDb(), operador.id, (tx) =>
    marcarNaPrevia(tx, { organizacaoId: operador.organizacaoId, ...entrada, agora: new Date() }),
  );
}

/** "Seguir com estas pessoas": o passo 4 termina e vem a abordagem. */
export async function seguirComAPrevia(): Promise<{ ok: false; erro: string } | void> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    confirmarPrevia(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) return resultado;
  revalidatePath("/onboarding", "layout");
  redirect("/onboarding/approach");
}
