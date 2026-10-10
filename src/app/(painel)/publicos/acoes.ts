"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterSugeridorDePublicos } from "@/server/dependencias";
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
  revalidatePath("/publicos");
  voltar(resultado.ok ? MENSAGENS[acao] : resultado.erro);
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
