"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterAvaliadorDeAderencia, obterEscritorDeFluxo, obterSugeridorDePublicos, obterUnipileSeConfigurada } from "@/server/dependencias";
import { darNotas } from "@/server/nota/nota";
import { exigirCampanhaDoOperador } from "@/server/painel/autorizacao";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { procurarParametros, rodarBusca, salvarBusca, type ResultadoDaBusca } from "@/server/publicos/busca";
import { gerarFluxo } from "@/server/publicos/fluxo";
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
  // A campanha nasce com o fluxo escrito para o público (§4.14). Sem a IA, nasce com o fluxo padrão em branco.
  let mensagens = "";
  const escritor = obterEscritorDeFluxo();
  if (resultado.ok && resultado.criada && escritor) {
    const gerado = await gerarFluxo(
      { db: obterDb(), escritor, agora: () => new Date() },
      { campanhaId: resultado.campanhaId, operadorId: operador.id, estilo: "casa" },
    );
    mensagens = !gerado.ok
      ? ` As mensagens ficaram em branco: ${gerado.erro}`
      : gerado.problemas.length > 0
        ? " A IA escreveu as mensagens, mas algumas ficaram marcadas: corrija na aba Abordagem antes de ativar."
        : " A IA escreveu as mensagens: revise na aba Abordagem.";
  }
  revalidatePath("/", "layout");
  const msg = !resultado.ok
    ? resultado.erro
    : resultado.criada
      ? `Campanha criada.${mensagens} Agora traga os leads: busque no LinkedIn ou importe uma lista.`
      : "Esta conta já aborda este público.";
  redirect(`/publicos/${publicoId}?aba=leads&msg=${encodeURIComponent(msg)}`);
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
  if (resultado.ok) revalidatePath("/publicos", "layout");
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

/** Roda a busca salva e manda o resultado para a triagem da campanha. */
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
  // Quem chegou já ganha nota (§4.13). Se a IA falhar, o botão "Dar nota" fica na tela.
  const avaliador = obterAvaliadorDeAderencia();
  if (resultado.ok && resultado.resumo.novos > 0 && avaliador) {
    await darNotas({ db: obterDb(), avaliador, agora: new Date() }, { campanhaId });
  }
  revalidatePath("/publicos", "layout");
  revalidatePath("/triagem");
  return resultado;
}

/** Escreve (ou reescreve) com a IA as mensagens da campanha de público e abre o editor para revisar e ativar. */
export async function gerarFluxoDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const dados = z
    .object({ campanha: z.uuid(), publico: z.uuid(), estilo: z.enum(["casa", "pergunta"]) })
    .safeParse(Object.fromEntries(formData));
  if (!dados.success) voltar("Pedido inválido.");
  const { campanha, publico, estilo } = dados.data!;
  await exigirCampanhaDoOperador(operador.id, campanha);
  const deVolta = (msg: string) => redirect(`/publicos/${publico}?aba=abordagem&msg=${encodeURIComponent(msg)}`);
  const escritor = obterEscritorDeFluxo();
  if (!escritor) deVolta("Escrever as mensagens precisa da chave da Anthropic. Peça ao admin para configurar.");
  const resultado = await gerarFluxo({ db: obterDb(), escritor: escritor!, agora: () => new Date() }, { campanhaId: campanha, operadorId: operador.id, estilo });
  revalidatePath("/publicos", "layout");
  revalidatePath(`/campanhas/${campanha}`);
  if (!resultado.ok) deVolta(resultado.erro);
  if (resultado.ok) redirect(`/campanhas/${campanha}?gerado=${resultado.problemas.length > 0 ? "marcado" : "ok"}`);
}
