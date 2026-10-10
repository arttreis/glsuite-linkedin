"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { confirmarAnalise } from "@/server/acesso/primeiro-acesso";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterLeitorDeSite } from "@/server/dependencias";
import { concluirLeitura, iniciarLeitura, ofertaDaOrganizacao, salvarDossie, type ResultadoDaEdicao } from "@/server/oferta/oferta";
import { exigirOperador } from "@/server/supabase/servidor";

const SEM_CHAVE = "A leitura do site precisa da chave da Anthropic. Peça ao admin para configurar.";

/** Marca a leitura e roda a IA depois da resposta; a tela da análise acompanha sozinha. */
async function lerSite(url: string, voltarPara: string) {
  const operador = await exigirOperador();
  const leitor = obterLeitorDeSite();
  if (!leitor) redirect(`${voltarPara}?msg=${encodeURIComponent(SEM_CHAVE)}`);

  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    iniciarLeitura(tx, { organizacaoId: operador.organizacaoId, url, operadorId: operador.id, agora: new Date() }),
  );
  if (!resultado.ok) redirect(`${voltarPara}?msg=${encodeURIComponent(resultado.erro)}`);
  const { ofertaId } = resultado;
  after(() => concluirLeitura({ db: obterDb(), leitor: leitor!, agora: () => new Date() }, { ofertaId }));
  revalidatePath("/comecar", "layout");
  redirect("/comecar/analise");
}

/** Passo 1: o site informado. */
export async function analisarSiteNoPrimeiroAcesso(formData: FormData) {
  await lerSite(String(formData.get("url") ?? ""), "/comecar/site");
}

/** Lê de novo o mesmo endereço, depois de uma falha. */
export async function lerDeNovo() {
  const operador = await exigirOperador();
  const oferta = await comOperador(obterDb(), operador.id, (tx) =>
    ofertaDaOrganizacao(tx, operador.organizacaoId, new Date()),
  );
  await lerSite(oferta.url ?? "", "/comecar/analise");
}

/** Grava a correção de um item da análise como rascunho. */
export async function salvarAnalise(entrada: { dossie: unknown }): Promise<ResultadoDaEdicao> {
  const operador = await exigirOperador();
  return comOperador(obterDb(), operador.id, (tx) =>
    salvarDossie(tx, {
      organizacaoId: operador.organizacaoId,
      dossie: entrada.dossie,
      confirmar: false,
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
}

/** Passo 2: "Está certo". Confirma e segue para o SDR; com erro, devolve para a tela mostrar. */
export async function confirmarAnaliseNoPrimeiroAcesso(entrada: { dossie: unknown }): Promise<ResultadoDaEdicao> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    confirmarAnalise(tx, {
      organizacaoId: operador.organizacaoId,
      dossie: entrada.dossie,
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  if (!resultado.ok) return resultado;
  revalidatePath("/comecar", "layout");
  redirect("/comecar/sdr");
}
