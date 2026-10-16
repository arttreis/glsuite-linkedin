"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { urlPublicaDoApp } from "@/lib/env";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterGeradorDeSdr, obterLeitorDeSite, obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { concluirLeitura, iniciarLeitura, salvarDossie, type ResultadoDaEdicao } from "@/server/oferta/oferta";
import { definirContasDoMembro, mudarPapelDoMembro } from "@/server/organizacao/equipe";
import { renomearOrganizacao } from "@/server/organizacao/organizacao";
import { garantirWebhooks, gerarLinkDeConexao } from "@/server/perfis/conexao";
import { editarConta } from "@/server/perfis/edicao";
import { ErroDeModo, registrarEval, trocarModo } from "@/server/perfis/modo";
import { contaNovaDoLinkedin } from "@/server/perfis/nova-conta";
import { despausarPerfil, ErroDeAtivacao, pausarPerfil } from "@/server/perfis/pausa";
import { sincronizarStatusDasContas } from "@/server/perfis/status-conta";
import { garantirSdr, salvarSdr, voltarParaVersao } from "@/server/sdr/sdr";
import { exigirOperador, exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

type Aba = "company" | "sdr" | "linkedin" | "team";

function voltar(aba: Aba, mensagem?: string): never {
  revalidatePath(`/settings/${aba}`);
  revalidatePath("/");
  redirect(mensagem ? `/settings/${aba}?msg=${encodeURIComponent(mensagem)}` : `/settings/${aba}`);
}

async function exigirAcessoAConta(operadorId: string, valor: FormDataEntryValue | null): Promise<string> {
  const perfilId = z.uuid().parse(valor);
  const [acesso] = await comOperador(obterDb(), operadorId, (tx) =>
    tx.query<{ ok: boolean }>("select public.pode_ver_perfil($1::uuid) and not casa as ok from public.perfis where id = $1::uuid", [perfilId]),
  );
  if (!acesso?.ok) throw new Error("Você não opera esta conta.");
  return perfilId;
}

// --- Empresa ----------------------------------------------------------------

/** Confirma a análise editada (§4.2): edição humana vale como fato, e a versão confirmada passa a valer. */
export async function confirmarAnaliseNasConfiguracoes(entrada: { dossie: unknown }): Promise<ResultadoDaEdicao> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarDossie(tx, { organizacaoId: operador.organizacaoId, dossie: entrada.dossie, confirmar: true, operadorId: operador.id, agora: new Date() }),
  );
  if (resultado.ok) revalidatePath("/settings/company");
  return resultado;
}

/** Ler o site de novo gera um rascunho que só vale depois de confirmado (§4.2). */
export async function lerSiteDeNovo(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const leitor = obterLeitorDeSite();
  if (!leitor) voltar("company", "A leitura do site precisa da chave da Anthropic. Peça ao admin.");
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    iniciarLeitura(tx, { organizacaoId: operador.organizacaoId, url: String(formData.get("url") ?? ""), operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) voltar("company", resultado.erro);
  const { ofertaId } = resultado as { ofertaId: string };
  after(() => concluirLeitura({ db: obterDb(), leitor: leitor!, agora: () => new Date() }, { ofertaId }));
  voltar("company");
}

// --- SDR ----------------------------------------------------------------------

export async function salvarSdrDoPainel(entrada: { sdr: unknown }): Promise<{ ok: true; versao: number } | { ok: false; erro: string }> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarSdr(tx, { organizacaoId: operador.organizacaoId, sdr: entrada.sdr, operadorId: operador.id, agora: new Date() }),
  );
  if (resultado.ok) revalidatePath("/settings/sdr");
  return resultado;
}

/** Quando o SDR passa a conversa para você (§4.7): os casos da pessoa e a cautela. O resto do SDR fica como está. */
export async function salvarPassagemDoPainel(entrada: {
  quando_chamar_voce: unknown;
  cautela: unknown;
}): Promise<{ ok: true; versao: number } | { ok: false; erro: string }> {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarSdr(tx, {
      organizacaoId: operador.organizacaoId,
      sdr: { quando_chamar_voce: entrada.quando_chamar_voce, cautela: entrada.cautela },
      resumo: "Mudou quando o SDR passa a conversa para você.",
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  if (resultado.ok) revalidatePath("/settings/sdr");
  return resultado;
}

/** Organização que já existia monta o SDR aqui, da análise confirmada (§4.1). */
export async function montarSdrDoPainel() {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const resultado = await garantirSdr(
    { db: obterDb(), gerador: obterGeradorDeSdr() },
    { organizacaoId: operador.organizacaoId, nome: operador.nome, operadorId: operador.id, agora: new Date() },
  );
  voltar("sdr", resultado.ok ? "SDR montado da análise do site. Teste no chat e ajuste o que quiser." : resultado.erro);
}

export async function voltarParaVersaoDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const versao = z.coerce.number().int().min(1).parse(formData.get("versao"));
  const resultado = await voltarParaVersao(obterDb(), { organizacaoId: operador.organizacaoId, versao, operadorId: operador.id, agora: new Date() });
  voltar("sdr", resultado.ok ? `O SDR voltou para a versão ${versao} (agora versão ${resultado.versao}).` : resultado.erro);
}

/** Sozinho ou "aprovo cada resposta", por conta (§4.7); vale para a próxima resposta. */
export async function trocarModoDaConta(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = await exigirAcessoAConta(operador.id, formData.get("perfilId"));
  const para = z.enum(["aprovacao", "automatico"]).parse(formData.get("modo"));
  let erro: string | null = null;
  try {
    await trocarModo(obterDb(), { perfilId, para, operadorId: operador.id, agora: new Date() });
  } catch (e) {
    if (!(e instanceof ErroDeModo)) throw e;
    erro = e.message;
  }
  voltar("sdr", erro ?? (para === "automatico" ? "O SDR passa a responder sozinho nesta conta." : "Daqui para frente você aprova cada resposta desta conta."));
}

// --- LinkedIn -------------------------------------------------------------------

export async function pausarContaDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = await exigirAcessoAConta(operador.id, formData.get("perfilId"));
  const motivo = z.string().trim().min(3).max(300).safeParse(formData.get("motivo"));
  if (!motivo.success) voltar("linkedin", "Escreva o motivo da pausa.");
  await pausarPerfil(obterDb(), { perfilId, motivo: `Pausado por ${operador.nome}: ${motivo.data}`, ator: operador.id, agora: new Date() });
  voltar("linkedin");
}

export async function retomarContaDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = await exigirAcessoAConta(operador.id, formData.get("perfilId"));
  let erro: string | null = null;
  try {
    await despausarPerfil(obterDb(), { perfilId, operadorId: operador.id, agora: new Date() });
  } catch (e) {
    if (!(e instanceof ErroDeAtivacao)) throw e;
    erro = e.message;
  }
  voltar("linkedin", erro ?? undefined);
}

/** Nome e horário de envio da conta; o RLS deixa só o admin ou quem vinculou. */
export async function editarContaDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = await exigirAcessoAConta(operador.id, formData.get("perfilId"));
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    editarConta(tx, {
      perfilId,
      nome: String(formData.get("nome") ?? ""),
      inicio: String(formData.get("inicio") ?? ""),
      fim: String(formData.get("fim") ?? ""),
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  voltar("linkedin", resultado.ok ? "Conta atualizada. O novo horário vale a partir da próxima ação." : resultado.erro);
}

export async function reconectarConta(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = await exigirAcessoAConta(operador.id, formData.get("perfilId"));
  const url = await gerarLinkDeConexao(
    { db: obterDb(), unipile: obterUnipile(), urlApp: urlPublicaDoApp(), segredo: segredoDaUnipile() },
    { perfilId, agora: new Date(), voltarPara: "/settings/linkedin" },
  );
  redirect(url);
}

/** Vincular outra conta: nasce pausada; ativa no Dashboard depois de conectar. */
export async function vincularOutraConta() {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const perfilId = await contaNovaDoLinkedin(obterDb(), {
    organizacaoId: operador.organizacaoId,
    operadorId: operador.id,
    nome: operador.nome,
    agora: new Date(),
  });
  const url = await gerarLinkDeConexao(
    { db: obterDb(), unipile: obterUnipile(), urlApp: urlPublicaDoApp(), segredo: segredoDaUnipile() },
    { perfilId, agora: new Date(), voltarPara: "/settings/linkedin" },
  );
  redirect(url);
}

export async function atualizarStatusDasContasDoPainel() {
  await exigirOperadorComModuloNaAcao("linkedin");
  await sincronizarStatusDasContas(obterDb(), obterUnipile(), new Date());
  voltar("linkedin", "Status das contas atualizado pela Unipile.");
}

export async function registrarWebhooksDoPainel() {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  if (operador.papel !== "admin") throw new Error("Só o admin registra webhooks.");
  const { criados } = await garantirWebhooks(obterUnipile(), { urlApp: urlPublicaDoApp(), segredo: segredoDaUnipile() });
  voltar("linkedin", criados.length > 0 ? `${criados.length} webhooks registrados na Unipile.` : "Os webhooks já estavam registrados.");
}

/** O eval segue como ferramenta interna para comparar versões de prompt (§4.7). */
export async function registrarEvalDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  if (operador.papel !== "admin") throw new Error("Só o admin registra o eval.");
  const arquivo = formData.get("relatorio");
  if (!(arquivo instanceof File) || arquivo.size === 0) voltar("linkedin", "Escolha o relatorio.json da rodada.");
  let mensagem: string;
  try {
    const relatorio: unknown = JSON.parse(await (arquivo as File).text());
    const vereditos = await registrarEval(obterDb(), { relatorio, operadorId: operador.id, agora: new Date() });
    mensagem = `Eval registrado: ${vereditos.map((v) => `${v.praca} ${v.veredito}`).join(", ")}.`;
  } catch (e) {
    if (e instanceof SyntaxError) mensagem = "O arquivo não é um JSON válido.";
    else if (e instanceof ErroDeModo) mensagem = e.message;
    else throw e;
  }
  voltar("linkedin", mensagem);
}

// --- Equipe ---------------------------------------------------------------------

export async function salvarNomeDaOrganizacao(formData: FormData) {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    renomearOrganizacao(tx, { organizacaoId: operador.organizacaoId, nome: String(formData.get("nome") ?? ""), operadorId: operador.id, agora: new Date() }),
  );
  revalidatePath("/", "layout");
  voltar("team", resultado.ok ? "Nome atualizado." : resultado.erro);
}

export async function mudarPapelDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const membroId = z.uuid().parse(formData.get("membroId"));
  const papel = z.enum(["admin", "operador"]).parse(formData.get("papel"));
  const resultado = await mudarPapelDoMembro(obterDb(), { adminId: operador.id, membroId, papel, agora: new Date() });
  voltar("team", resultado.ok ? "Papel atualizado." : resultado.erro);
}

export async function definirContasDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("linkedin");
  const membroId = z.uuid().parse(formData.get("membroId"));
  const perfilIds = z.array(z.uuid()).max(50).parse(formData.getAll("perfilIds"));
  const resultado = await definirContasDoMembro(obterDb(), { adminId: operador.id, membroId, perfilIds, agora: new Date() });
  voltar("team", resultado.ok ? "Contas atualizadas." : resultado.erro);
}
