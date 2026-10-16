"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { MODULOS, motivoDaMudanca, NOME_DO_MODULO } from "@/domain/modulos";
import { urlPublicaDoApp } from "@/lib/env";
import { importarHistorico } from "@/server/conversas/externas";
import { obterDb } from "@/server/db";
import { obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { alterarModulo, exigirContaDaCasa } from "@/server/modulos/modulos";
import { gerarLinkDeConexao, ligarContaPelaPlataforma, mensagemDaFalhaDoLink } from "@/server/perfis/conexao";
import { exigirAdminDaPlataforma } from "@/server/plataforma";
import { mensagemDaRecusa } from "@/server/unipile/erros";

function voltar(mensagem: string): never {
  revalidatePath("/", "layout");
  redirect(`/platform?msg=${encodeURIComponent(mensagem)}`);
}

/** Liga ou desliga um módulo de uma organização (§4.14). Só quem está em `PLATAFORMA_ADMINS`. */
export async function alterarModuloDaPlataforma(formData: FormData) {
  const operador = await exigirAdminDaPlataforma();
  const organizacaoId = z.uuid().parse(formData.get("organizacaoId"));
  const modulo = z.enum(MODULOS).parse(formData.get("modulo"));
  const ativo = z.enum(["true", "false"]).parse(formData.get("ativo")) === "true";
  const nomeDaOrganizacao = String(formData.get("organizacaoNome") ?? "a organização").slice(0, 80);

  const resultado = await alterarModulo(obterDb(), {
    organizacaoId,
    modulo,
    ativo,
    motivo: motivoDaMudanca(formData.get("motivo")),
    por: operador.emailDoLogin,
    agora: new Date(),
  });
  if (!resultado.ok) voltar(resultado.erro);
  if (!resultado.mudou) voltar(`Nada mudou: ${NOME_DO_MODULO[modulo]} já estava ${ativo ? "ligado" : "desligado"} em ${nomeDaOrganizacao}.`);
  const pausadas =
    resultado.contasPausadas > 0
      ? ` ${resultado.contasPausadas === 1 ? "Uma conta do LinkedIn foi pausada" : `${resultado.contasPausadas} contas do LinkedIn foram pausadas`}.`
      : "";
  voltar(`${NOME_DO_MODULO[modulo]} ${ativo ? "ligado" : "desligado"} em ${nomeDaOrganizacao}.${pausadas}`);
}

/**
 * Reconecta (ou vincula) a conta da casa pelo hosted auth da Unipile, que
 * volta para a Plataforma. Só quem está em `PLATAFORMA_ADMINS`, e só para
 * perfil com `casa`. Se a Unipile recusar o link, volta com a mensagem em vez
 * da página de erro.
 */
export async function reconectarContaDaCasa(formData: FormData): Promise<never> {
  await exigirAdminDaPlataforma();
  const db = obterDb();
  const perfilId = await exigirContaDaCasa(db, z.uuid().parse(formData.get("perfilId")));
  let link: string;
  try {
    link = await gerarLinkDeConexao(
      { db, unipile: obterUnipile(), urlApp: urlPublicaDoApp(), segredo: segredoDaUnipile() },
      { perfilId, agora: new Date(), voltarPara: "/platform" },
    );
  } catch (erro) {
    voltar(mensagemDaFalhaDoLink(erro));
  }
  redirect(link);
}

/**
 * Liga a um perfil uma conta que já está na Unipile, conectada direto no
 * dashboard dela (§4.14): num perfil livre da organização ou numa conta nova.
 * Só quem está em `PLATAFORMA_ADMINS`; o evento leva o e-mail do login. O
 * perfil segue pausado; o histórico de conversas vem depois, como no callback.
 * Se a Unipile recusar, volta com a mensagem em vez da página de erro.
 */
export async function ligarContaDaUnipile(formData: FormData): Promise<never> {
  const operador = await exigirAdminDaPlataforma();
  const accountId = z.string().trim().min(1).max(200).parse(formData.get("accountId"));
  // O destino é `perfil:<id>` (um perfil livre) ou `nova:<id da organização>` (conta nova nela).
  const [tipo, valor] = String(formData.get("destino") ?? "").split(":");
  const id = z.uuid().parse(valor);
  if (tipo !== "perfil" && tipo !== "nova") voltar("Escolha o perfil que recebe a conta.");
  const nomeDaConta = String(formData.get("nomeDaConta") ?? "").trim().slice(0, 120) || "Conta do LinkedIn";

  let resultado: Awaited<ReturnType<typeof ligarContaPelaPlataforma>>;
  try {
    resultado = await ligarContaPelaPlataforma(
      { db: obterDb(), unipile: obterUnipile() },
      {
        accountId,
        destino: tipo === "nova" ? { organizacaoId: id } : { perfilId: id },
        nomeDaConta,
        ator: operador.emailDoLogin,
        agora: new Date(),
      },
    );
  } catch (erro) {
    voltar(mensagemDaRecusa(erro));
  }
  if (!resultado.ok) voltar(resultado.erro);
  const { perfilId } = resultado;
  after(async () => {
    try {
      await importarHistorico({ db: obterDb(), unipile: obterUnipile(), agora: new Date() }, { perfilId });
    } catch (erro) {
      console.error("histórico da Unipile não importado", erro);
    }
  });
  voltar(resultado.mensagem);
}
