"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { chaveDaTag, LINHAS_POR_ENVIO, nomeDaTag } from "@/domain/contatos";
import { lerFiltro } from "@/domain/filtro-de-contatos";
import { esquemaDoContatoImportado, importarContatos, naoContatarMais, type ResumoDaImportacao } from "@/server/contatos/contatos";
import { apagarTag, criarTag, editarTag, garantirTags, porTag, tirarTag } from "@/server/contatos/tags";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import type { Resultado } from "@/server/publicos/publicos";
import { exigirOperador } from "@/server/supabase/servidor";

const ROTA = "/contacts";

/** Só deixa voltar para uma tela do app (o formulário manda o caminho). */
function caminhoDeVolta(valor: FormDataEntryValue | null, padrao: string): string {
  return typeof valor === "string" && valor.startsWith("/") && !valor.startsWith("//") ? valor : padrao;
}

function voltar(caminho: string, mensagem: string): never {
  revalidatePath(ROTA, "layout");
  const separador = caminho.includes("?") ? "&" : "?";
  redirect(`${caminho}${separador}msg=${encodeURIComponent(mensagem)}`);
}

// --- Importação ------------------------------------------------------------------

const parteDaImportacao = z.object({
  importacaoId: z.uuid().nullable(),
  arquivoNome: z.string().max(200).nullable(),
  autorizacaoWhatsapp: z.boolean(),
  tagsParaTodos: z.array(z.string().max(40)).max(10),
  contatos: z.array(esquemaDoContatoImportado).min(1).max(LINHAS_POR_ENVIO),
});

/**
 * Uma parte da planilha (§4.15). A primeira cria a importação; o navegador
 * manda as outras com o id dela, até acabar.
 */
export async function importarContatosDoPainel(entrada: unknown): Promise<Resultado<{ importacaoId: string } & ResumoDaImportacao>> {
  const operador = await exigirOperador();
  const lida = parteDaImportacao.safeParse(entrada);
  if (!lida.success) return { ok: false, erro: `Mande até ${LINHAS_POR_ENVIO} contatos por vez, com telefone ou e-mail válidos.` };
  const resultado = await importarContatos(obterDb(), {
    organizacaoId: operador.organizacaoId,
    operadorId: operador.id,
    ...lida.data,
    agora: new Date(),
  });
  if (resultado.ok) revalidatePath(ROTA, "layout");
  return resultado;
}

// --- Tags ----------------------------------------------------------------------

export async function criarTagDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const volta = caminhoDeVolta(formData.get("voltar"), `${ROTA}/tags`);
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    criarTag(tx, { organizacaoId: operador.organizacaoId, nome: formData.get("nome"), cor: formData.get("cor"), operadorId: operador.id, agora: new Date() }),
  );
  voltar(volta, resultado.ok ? "Tag criada." : resultado.erro);
}

export async function editarTagDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const tagId = z.uuid().parse(formData.get("tagId"));
  const resultado = await comOperador(obterDb(), operador.id, (tx) => editarTag(tx, { tagId, nome: formData.get("nome"), cor: formData.get("cor") }));
  voltar(`${ROTA}/tags`, resultado.ok ? "Tag salva." : resultado.erro);
}

export async function apagarTagDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const tagId = z.uuid().parse(formData.get("tagId"));
  const resultado = await comOperador(obterDb(), operador.id, (tx) => apagarTag(tx, { tagId, operadorId: operador.id, agora: new Date() }));
  if (!resultado.ok) voltar(`${ROTA}/tags`, resultado.erro);
  const de = resultado.contatos === 1 ? "de 1 contato" : `de ${resultado.contatos} contatos`;
  voltar(`${ROTA}/tags`, `Tag apagada e tirada ${de}.`);
}

const alvo = z.union([z.object({ ids: z.array(z.uuid()).min(1).max(500) }), z.object({ filtro: z.unknown() })]);
const mudancaEmMassa = z.object({ tagId: z.uuid(), alvo });

/** Põe ou tira uma tag dos contatos marcados ou de todos do filtro (§4.16). */
export async function mudarTagEmMassaDoPainel(entrada: { tagId: string; acao: "por" | "tirar"; alvo: unknown }): Promise<Resultado<{ contatos: number }>> {
  const operador = await exigirOperador();
  const lida = mudancaEmMassa.safeParse(entrada);
  if (!lida.success) return { ok: false, erro: "Escolha a tag e os contatos." };
  const destino = "ids" in lida.data.alvo ? { ids: lida.data.alvo.ids } : { filtro: lerFiltro(lida.data.alvo.filtro) };
  const p = { organizacaoId: operador.organizacaoId, tagId: lida.data.tagId, alvo: destino, operadorId: operador.id, agora: new Date() };
  const resultado = await comOperador(obterDb(), operador.id, (tx) => (entrada.acao === "tirar" ? tirarTag(tx, p) : porTag(tx, p)));
  if (resultado.ok) revalidatePath(ROTA, "layout");
  return resultado;
}

/** No contato ou no painel do lead: põe a tag pelo nome; a que não existe é criada (§4.16). */
export async function porTagNoContatoDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const contatoId = z.uuid().parse(formData.get("contatoId"));
  const volta = caminhoDeVolta(formData.get("voltar"), `${ROTA}/${contatoId}`);
  const agora = new Date();
  const resultado = await comOperador(obterDb(), operador.id, async (tx): Promise<Resultado<{ contatos: number }>> => {
    const nome = nomeDaTag(formData.get("nome"));
    if (!nome) return { ok: false, erro: "Escreva o nome da tag." };
    const garantidas = await garantirTags(tx, { organizacaoId: operador.organizacaoId, nomes: [nome], operadorId: operador.id, agora });
    if (!garantidas.ok) return garantidas;
    const tagId = garantidas.idPorChave.get(chaveDaTag(nome))!;
    return porTag(tx, { organizacaoId: operador.organizacaoId, tagId, alvo: { ids: [contatoId] }, operadorId: operador.id, agora });
  });
  if (!resultado.ok) voltar(volta, resultado.erro);
  revalidatePath(volta.split("?")[0]!);
  redirect(volta);
}

export async function tirarTagDoContatoDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const contatoId = z.uuid().parse(formData.get("contatoId"));
  const tagId = z.uuid().parse(formData.get("tagId"));
  const volta = caminhoDeVolta(formData.get("voltar"), `${ROTA}/${contatoId}`);
  await comOperador(obterDb(), operador.id, (tx) =>
    tirarTag(tx, { organizacaoId: operador.organizacaoId, tagId, alvo: { ids: [contatoId] }, operadorId: operador.id, agora: new Date() }),
  );
  revalidatePath(volta.split("?")[0]!);
  redirect(volta);
}

// --- Não contatar mais -----------------------------------------------------------

/** "Não contatar mais" (§4.15). Confere pelo RLS que o operador enxerga o contato; o resto roda pelo sistema. */
export async function naoContatarMaisDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const contatoId = z.uuid().parse(formData.get("contatoId"));
  const [visivel] = await comOperador(obterDb(), operador.id, (tx) => tx.query("select 1 from public.contatos where id = $1::uuid", [contatoId]));
  if (!visivel) voltar(ROTA, "Contato fora do seu acesso.");
  const motivo = typeof formData.get("motivo") === "string" ? String(formData.get("motivo")).replace(/\s+/g, " ").trim().slice(0, 300) : "";
  const resultado = await naoContatarMais(obterDb(), {
    contatoId,
    organizacaoId: operador.organizacaoId,
    operadorId: operador.id,
    operadorNome: operador.nome,
    motivo: motivo || null,
    agora: new Date(),
  });
  if (!resultado.ok) voltar(`${ROTA}/${contatoId}`, resultado.erro);
  voltar(`${ROTA}/${contatoId}`, resultado.jaEstava ? "Este contato já estava marcado." : "Pronto: ninguém da organização fala mais com este contato.");
}
