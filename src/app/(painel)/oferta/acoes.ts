"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterLeitorDeSite } from "@/server/dependencias";
import { concluirLeitura, iniciarLeitura, salvarDossie, voltarAoConfirmado, type ResultadoDaEdicao } from "@/server/oferta/oferta";
import { exigirOperador } from "@/server/supabase/servidor";

const voltar = (msg: string) => redirect(`/oferta?msg=${encodeURIComponent(msg)}`);

/** Marca a leitura e roda a IA depois da resposta: a tela acompanha sozinha. */
export async function analisarSite(formData: FormData) {
  const operador = await exigirOperador();
  const leitor = obterLeitorDeSite();
  if (!leitor) voltar("A leitura do site precisa da chave da Anthropic. Peça ao admin para configurar.");

  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    iniciarLeitura(tx, {
      organizacaoId: operador.organizacaoId,
      url: String(formData.get("url") ?? ""),
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  if (!resultado.ok) voltar(resultado.erro);
  if (resultado.ok) {
    const { ofertaId } = resultado;
    after(() => concluirLeitura({ db: obterDb(), leitor: leitor!, agora: () => new Date() }, { ofertaId }));
  }
  revalidatePath("/oferta");
}

/** Grava a edição do dossiê e, se pedido, confirma. Devolve o erro para o editor mostrar. */
export async function salvarDossieDoPainel(entrada: { dossie: unknown; confirmar: boolean }): Promise<ResultadoDaEdicao> {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    salvarDossie(tx, {
      organizacaoId: operador.organizacaoId,
      dossie: entrada.dossie,
      confirmar: entrada.confirmar,
      operadorId: operador.id,
      agora: new Date(),
    }),
  );
  if (resultado.ok) revalidatePath("/oferta");
  return resultado;
}

/** Descarta o rascunho e volta ao último dossiê confirmado. */
export async function voltarAoConfirmadoDoPainel() {
  const operador = await exigirOperador();
  const resultado = await comOperador(obterDb(), operador.id, (tx) =>
    voltarAoConfirmado(tx, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() }),
  );
  voltar(resultado.ok ? "O rascunho foi descartado. O dossiê voltou ao último confirmado." : resultado.erro);
}
