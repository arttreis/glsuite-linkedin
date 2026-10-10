"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterSugeridorDePublicos } from "@/server/dependencias";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { mudarStatusDoPublico, salvarPublico, sugerirPublicos, type Resultado } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";

const voltar = (msg: string) => redirect(`/publicos?msg=${encodeURIComponent(msg)}`);

/** Pede públicos à IA. Leva de 20 segundos a 1 minuto; o botão espera a resposta. */
export async function sugerirPublicosDoPainel(): Promise<Resultado<{ quantidade: number }>> {
  const operador = await exigirOperador();
  const sugeridor = obterSugeridorDePublicos();
  if (!sugeridor) return { ok: false, erro: "A sugestão de públicos precisa da chave da Anthropic. Peça ao admin para configurar." };
  const resultado = await sugerirPublicos(
    { db: obterDb(), sugeridor, agora: () => new Date() },
    { organizacaoId: operador.organizacaoId, operadorId: operador.id },
  );
  if (resultado.ok) revalidatePath("/publicos");
  return resultado;
}

const MENSAGENS = {
  escolher: "Público escolhido. Ele já pode virar campanha.",
  arquivar: "Público arquivado.",
  reativar: "O público voltou para os escolhidos.",
} as const;

/** Escolher, arquivar ou voltar a usar, pelo botão do cartão. */
export async function mudarStatusDoPublicoDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const acao = String(formData.get("acao") ?? "") as keyof typeof MENSAGENS;
  if (!(acao in MENSAGENS)) voltar("Ação desconhecida.");
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    mudarStatusDoPublico(tx, { id: String(formData.get("id") ?? ""), acao, operadorId: operador.id, agora: new Date() }),
  );
  revalidatePath("/publicos", "layout");
  const msg = resultado.ok ? MENSAGENS[acao] : resultado.erro;
  const volta = String(formData.get("volta") ?? "");
  if (/^\/publicos\/[0-9a-f-]{36}$/.test(volta)) redirect(`${volta}?msg=${encodeURIComponent(msg)}`);
  voltar(msg);
}

/** Grava o público do editor. Devolve o erro para o editor mostrar; com sucesso, o editor volta para a lista. */
export async function salvarPublicoDoPainel(entrada: { id: string | null; publico: unknown; ativar: boolean }): Promise<Resultado<{ id: string }>> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarPublico(tx, {
      organizacaoId: operador.organizacaoId,
      id: entrada.id,
      publico: entrada.publico,
      ativar: entrada.ativar,
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  if (resultado.ok) revalidatePath("/publicos");
  return resultado;
}

/** "Começar a abordar" com uma conta: cria a campanha do par público × conta (ou acha a que já existe). */
export async function comecarAAbordarDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const ids = z.object({ publicoId: z.uuid(), perfilId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!ids.success) voltar("Escolha a conta do LinkedIn.");
  const { publicoId, perfilId } = ids.data!;
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    comecarAAbordar(tx, { publicoId, perfilId, operadorId: operador.id, agora: new Date() }),
  );
  revalidatePath("/", "layout");
  const msg = !resultado.ok
    ? resultado.erro
    : resultado.criada
      ? "Campanha criada. Agora traga os leads: importe uma lista e aprove na triagem."
      : "Esta conta já aborda este público.";
  redirect(`/publicos/${publicoId}?aba=leads&msg=${encodeURIComponent(msg)}`);
}
