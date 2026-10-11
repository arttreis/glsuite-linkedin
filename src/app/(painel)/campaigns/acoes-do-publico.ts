"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterAvaliadorDeAderencia, obterSugeridorDePublicos, obterUnipileSeConfigurada } from "@/server/dependencias";
import { darNotas } from "@/server/nota/nota";
import { exigirCampanhaDoOperador } from "@/server/painel/autorizacao";
import { procurarParametros, rodarBusca, salvarBusca, type ResultadoDaBusca } from "@/server/publicos/busca";
import { salvarPublico, sugerirPublicos, type Resultado } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";

/** Pede públicos à IA. Leva de 20 segundos a 1 minuto; o botão espera a resposta. */
export async function sugerirPublicosDoPainel(): Promise<Resultado<{ quantidade: number }>> {
  const operador = await exigirOperador();
  const sugeridor = obterSugeridorDePublicos();
  if (!sugeridor) return { ok: false, erro: "A sugestão de públicos precisa da chave da Anthropic. Peça ao admin para configurar." };
  const resultado = await sugerirPublicos(
    { db: obterDb(), sugeridor, agora: () => new Date() },
    { organizacaoId: operador.organizacaoId, operadorId: operador.id },
  );
  if (resultado.ok) revalidatePath("/campaigns/new");
  return resultado;
}

/** Grava o público do editor. Devolve o erro para o editor mostrar. */
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
  if (resultado.ok) revalidatePath("/campaigns", "layout");
  return resultado;
}

const SEM_UNIPILE = "A conexão com o LinkedIn (Unipile) não está configurada. Peça ao admin.";

/** Grava a busca editada na aba Leads. */
export async function salvarBuscaDoPainel(entrada: { campanhaId: string; busca: unknown }): Promise<Resultado> {
  const operador = await exigirOperador();
  const campanhaId = z.uuid().parse(entrada.campanhaId);
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarBusca(tx, { campanhaId, busca: entrada.busca, operadorId: operador.id, agora: new Date() }),
  );
  if (resultado.ok) revalidatePath(`/campaigns/${campanhaId}`);
  return resultado;
}

/** Procura ids de região ou setor no LinkedIn, pela conta da campanha. */
export async function procurarParametrosDoPainel(entrada: { campanhaId: string; tipo: "LOCATION" | "INDUSTRY"; texto: string }) {
  const operador = await exigirOperador();
  const campanhaId = z.uuid().parse(entrada.campanhaId);
  const tipo = z.enum(["LOCATION", "INDUSTRY"]).parse(entrada.tipo);
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  const unipile = obterUnipileSeConfigurada();
  if (!unipile) return { ok: false as const, erro: SEM_UNIPILE };
  return procurarParametros({ db: obterDb(), unipile }, { campanhaId, tipo, texto: String(entrada.texto).slice(0, 80) });
}

/** Roda a busca salva: quem chega entra em "quem entra na campanha", já com nota. */
export async function rodarBuscaDoPainel(entrada: { campanhaId: string; quantidade: number }): Promise<ResultadoDaBusca> {
  const operador = await exigirOperador();
  const campanhaId = z.uuid().parse(entrada.campanhaId);
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  const unipile = obterUnipileSeConfigurada();
  if (!unipile) return { ok: false, erro: SEM_UNIPILE };
  const resultado = await rodarBusca(
    { db: obterDb(), unipile },
    { campanhaId, quantidade: Number(entrada.quantidade) || 10, operadorId: operador.id, agora: new Date() },
  );
  // Quem chegou já ganha nota (§4.4). Se a IA falhar, o botão "Dar nota" fica na tela.
  const avaliador = obterAvaliadorDeAderencia();
  if (resultado.ok && resultado.resumo.novos > 0 && avaliador) {
    await darNotas({ db: obterDb(), avaliador, agora: new Date() }, { campanhaId });
  }
  revalidatePath(`/campaigns/${campanhaId}`);
  return resultado;
}
