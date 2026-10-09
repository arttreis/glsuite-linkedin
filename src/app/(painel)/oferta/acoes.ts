"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterLeitorDeSite } from "@/server/dependencias";
import { concluirLeitura, iniciarLeitura } from "@/server/oferta/oferta";
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
