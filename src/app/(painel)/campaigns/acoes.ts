"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import {
  ErroDeStatus,
  mudarStatusDaCampanha,
  salvarCampanha,
  type EntradaDeCampanha,
  type ResultadoDoSalvamento,
} from "@/server/campanhas/campanhas";
import { salvarInstrucoesDoSdr, salvarTextosDaCampanha, type ResultadoDosTextos } from "@/server/campanhas/painel";
import { obterAvaliadorDeAderencia, obterEscritorDeFluxo, obterUnipileSeConfigurada } from "@/server/dependencias";
import { aprovarAcimaDoCorte, darNotas } from "@/server/nota/nota";
import { exigirCampanhaDoOperador, leadsVisiveis } from "@/server/painel/autorizacao";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { gerarFluxo } from "@/server/publicos/fluxo";
import { mudarStatusDoPublico, obterPublico } from "@/server/publicos/publicos";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";
import { aprovarLeads, rejeitarLeads } from "@/server/triagem/triagem";

/** As abas da campanha (§4.11), com o slug da URL em inglês. */
const ABAS = ["audience", "leads", "approach", "sdr", "results"] as const;
type Aba = (typeof ABAS)[number];

function voltarParaAba(campanhaId: string, aba: Aba, mensagem?: string): never {
  revalidatePath(`/campaigns/${campanhaId}`);
  revalidatePath("/campaigns");
  revalidatePath("/");
  const params = new URLSearchParams({ tab: aba });
  if (mensagem) params.set("msg", mensagem);
  redirect(`/campaigns/${campanhaId}?${params.toString()}`, RedirectType.replace);
}

async function exigirCampanha(operadorId: string, valor: FormDataEntryValue | null): Promise<string> {
  const campanhaId = z.uuid().parse(valor);
  await exigirCampanhaDoOperador(operadorId, campanhaId);
  return campanhaId;
}

export async function salvarCampanhaDoPainel(entrada: EntradaDeCampanha): Promise<ResultadoDoSalvamento> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = z.uuid().safeParse(entrada.perfilId);
  if (!perfilId.success) return { ok: false, erros: ["Escolha o perfil."], problemas: [] };

  const [acesso] = await comOperador(obterDb(), operador.id, (tx) =>
    tx.query<{ ok: boolean }>("select public.pode_ver_perfil($1::uuid) as ok", [perfilId.data]),
  );
  if (!acesso?.ok) return { ok: false, erros: ["Você não opera este perfil."], problemas: [] };
  if (entrada.id) await exigirCampanhaDoOperador(operador.id, entrada.id);

  const resultado = await salvarCampanha(obterDb(), entrada, { operadorId: operador.id, agora: new Date() });
  if (resultado.ok) revalidatePath("/campaigns");
  return resultado;
}

const entradaDeStatus = z.object({
  campanhaId: z.uuid(),
  status: z.enum(["ativa", "pausada", "encerrada"]),
});

/**
 * Ativar é a permissão (§4.5): grava quem permitiu e quando. Pausar e
 * retomar ficam aqui também.
 */
export async function alterarStatusDaCampanha(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const { campanhaId, status } = entradaDeStatus.parse({
    campanhaId: formData.get("campanhaId"),
    status: formData.get("status"),
  });
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  // O motivo de não ativar (fluxo incompleto, campanha encerrada) volta para a
  // tela da campanha. redirect lança, então fica fora do try.
  let recusa: string | null = null;
  try {
    await mudarStatusDaCampanha(obterDb(), { campanhaId, status, operadorId: operador.id, agora: new Date() });
  } catch (erro) {
    if (!(erro instanceof ErroDeStatus)) throw erro;
    recusa = erro.message;
  }
  const aba = ABAS.find((a) => a === formData.get("tab")) ?? "approach";
  voltarParaAba(campanhaId, aba, recusa ?? undefined);
}

/** Campanha nova (§4.11): o público (escolhido, ou a sugestão que vira escolhida) e a conta. */
export async function criarCampanhaDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const ids = z.object({ publicoId: z.uuid(), perfilId: z.uuid() }).safeParse({
    publicoId: formData.get("publicoId"),
    perfilId: formData.get("perfilId"),
  });
  const voltar = (mensagem: string): never => redirect(`/campaigns/new?msg=${encodeURIComponent(mensagem)}`);
  if (!ids.success) voltar("Escolha o público e a conta.");
  const { publicoId, perfilId } = ids.data!;
  const agora = new Date();

  const resultado = await comOperador(obterDb(), operador.id, async (tx) => {
    const publico = await obterPublico(tx, publicoId);
    if (!publico) return { ok: false as const, erro: "Público não encontrado." };
    if (publico.status === "sugerido") {
      const escolha = await mudarStatusDoPublico(tx, { id: publicoId, acao: "escolher", operadorId: operador.id, agora });
      if (!escolha.ok) return escolha;
    }
    return comecarAAbordar(tx, { publicoId, perfilId, operadorId: operador.id, agora });
  });
  if (!resultado.ok) voltar(resultado.erro);
  const { campanhaId, criada } = resultado as { campanhaId: string; criada: boolean };

  // A campanha nasce com a abordagem escrita na voz do SDR; sem a IA, com o fluxo padrão em branco.
  let mensagem = criada ? "Campanha criada em rascunho. Traga os leads e revise a abordagem antes de permitir." : "Esta conta já aborda este público.";
  const escritor = obterEscritorDeFluxo();
  if (criada && escritor) {
    const gerado = await gerarFluxo({ db: obterDb(), escritor, agora: () => new Date() }, { campanhaId, operadorId: operador.id, estilo: "casa" });
    if (!gerado.ok) mensagem += ` A abordagem ficou em branco: ${gerado.erro}`;
  }
  voltarParaAba(campanhaId, "leads", mensagem);
}

/** Escreve (ou reescreve) a abordagem com a IA, na voz do SDR. */
export async function escreverAbordagemDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const campanhaId = await exigirCampanha(operador.id, formData.get("campanhaId"));
  const estilo = z.enum(["casa", "pergunta"]).catch("casa").parse(formData.get("estilo"));
  const escritor = obterEscritorDeFluxo();
  if (!escritor) voltarParaAba(campanhaId, "approach", "Escrever a abordagem precisa da chave da Anthropic. Peça ao admin.");
  const resultado = await gerarFluxo({ db: obterDb(), escritor: escritor!, agora: () => new Date() }, { campanhaId, operadorId: operador.id, estilo });
  voltarParaAba(
    campanhaId,
    "approach",
    !resultado.ok
      ? resultado.erro
      : resultado.problemas.length > 0
        ? "A IA escreveu a abordagem, mas alguns textos ficaram marcados. Corrija antes de permitir."
        : "A IA escreveu a abordagem. Revise e ajuste o que quiser.",
  );
}

/** Os textos da linha do tempo, validados antes de gravar. */
export async function salvarTextosDoPainel(entrada: { campanhaId: string; textos: Record<string, string> }): Promise<ResultadoDosTextos> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const campanhaId = z.uuid().parse(entrada.campanhaId);
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  const textos = z.record(z.string().max(60), z.string().max(2000)).parse(entrada.textos);
  const resultado = await salvarTextosDaCampanha(obterDb(), { campanhaId, textos, operadorId: operador.id, agora: new Date() });
  if (resultado.ok) revalidatePath(`/campaigns/${campanhaId}`);
  return resultado;
}

export async function salvarInstrucoesDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const campanhaId = await exigirCampanha(operador.id, formData.get("campanhaId"));
  const resultado = await salvarInstrucoesDoSdr(obterDb(), {
    campanhaId,
    texto: String(formData.get("instrucoes") ?? ""),
    operadorId: operador.id,
    agora: new Date(),
  });
  voltarParaAba(campanhaId, "sdr", resultado.ok ? "Instruções salvas. Valem para a próxima resposta do SDR nesta campanha." : resultado.erro);
}

const leadIds = z.array(z.uuid()).max(500);

export async function aprovarLeadsDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const campanhaId = await exigirCampanha(operador.id, formData.get("campanhaId"));
  const selecionados = await leadsVisiveis(operador.id, leadIds.parse(formData.getAll("leadIds")));
  const { aprovados, recusados } = await aprovarLeads(obterDb(), {
    leadIds: selecionados,
    operadorId: operador.id,
    agora: new Date(),
    unipile: obterUnipileSeConfigurada(),
  });
  const motivos = [...new Set(recusados.map((r) => r.motivo))];
  const detalhe = recusados.length > 0 ? ` ${recusados.length} não entraram: ${motivos.join("; ")}.` : "";
  voltarParaAba(campanhaId, "leads", `${aprovados.length} na fila.${detalhe}`);
}

export async function tirarLeadsDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const campanhaId = await exigirCampanha(operador.id, formData.get("campanhaId"));
  const selecionados = await leadsVisiveis(operador.id, leadIds.parse(formData.getAll("leadIds")));
  const tirados = await rejeitarLeads(obterDb(), { leadIds: selecionados, operadorId: operador.id, agora: new Date() });
  voltarParaAba(campanhaId, "leads", `${tirados} fora da campanha. Nada foi enviado para eles.`);
}

export async function darNotasDaCampanhaDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const campanhaId = await exigirCampanha(operador.id, formData.get("campanhaId"));
  const avaliador = obterAvaliadorDeAderencia();
  if (!avaliador) voltarParaAba(campanhaId, "leads", "A nota de aderência precisa da chave da Anthropic. Peça ao admin.");
  const resultado = await darNotas({ db: obterDb(), avaliador: avaliador!, agora: new Date() }, { campanhaId });
  voltarParaAba(
    campanhaId,
    "leads",
    resultado.ok
      ? `${resultado.avaliados} leads com nota.${resultado.restantes > 0 ? ` Faltam ${resultado.restantes}: clique de novo.` : ""}`
      : resultado.erro,
  );
}

export async function aprovarAcimaDoCorteDaCampanhaDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const campanhaId = await exigirCampanha(operador.id, formData.get("campanhaId"));
  const { aprovados, recusados, corte } = await aprovarAcimaDoCorte(obterDb(), {
    campanhaId,
    operadorId: operador.id,
    agora: new Date(),
    unipile: obterUnipileSeConfigurada(),
  });
  const detalhe = recusados.length > 0 ? ` ${recusados.length} não entraram.` : "";
  voltarParaAba(campanhaId, "leads", `${aprovados.length} com nota a partir de ${corte} na fila.${detalhe}`);
}
