"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MODULOS, motivoDaMudanca, NOME_DO_MODULO } from "@/domain/modulos";
import { urlPublicaDoApp } from "@/lib/env";
import { obterDb } from "@/server/db";
import { obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { alterarModulo, exigirContaDaCasa } from "@/server/modulos/modulos";
import { gerarLinkDeConexao, mensagemDaFalhaDoLink } from "@/server/perfis/conexao";
import { exigirAdminDaPlataforma } from "@/server/plataforma";

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
