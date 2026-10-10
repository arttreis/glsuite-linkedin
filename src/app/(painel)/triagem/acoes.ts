"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { obterAvaliadorDeAderencia, obterUnipileSeConfigurada } from "@/server/dependencias";
import { aprovarAcimaDoCorte, darNotas } from "@/server/nota/nota";
import { exigirCampanhaDoOperador, leadsVisiveis } from "@/server/painel/autorizacao";
import { exigirOperador } from "@/server/supabase/servidor";
import { aprovarLeads, rejeitarLeads } from "@/server/triagem/triagem";

const ids = z.array(z.uuid()).max(500);

function voltar(formData: FormData, mensagem: string) {
  // Quem veio da página do público volta para ela.
  const volta = String(formData.get("volta") ?? "");
  if (/^\/publicos\/[0-9a-f-]{36}$/.test(volta)) {
    revalidatePath("/publicos", "layout");
    redirect(`${volta}?aba=leads&msg=${encodeURIComponent(mensagem)}`);
  }
  const campanha = z.uuid().safeParse(formData.get("campanha"));
  const params = new URLSearchParams({ msg: mensagem });
  if (campanha.success) params.set("campanha", campanha.data);
  revalidatePath("/triagem");
  revalidatePath("/", "layout");
  redirect(`/triagem?${params.toString()}`);
}

export async function aprovarSelecionados(formData: FormData) {
  const operador = await exigirOperador();
  const selecionados = await leadsVisiveis(operador.id, ids.parse(formData.getAll("leadIds")));
  const { aprovados, recusados } = await aprovarLeads(obterDb(), {
    leadIds: selecionados,
    operadorId: operador.id,
    agora: new Date(),
    unipile: obterUnipileSeConfigurada(),
  });
  const motivos = [...new Set(recusados.map((r) => r.motivo))];
  const detalhe = recusados.length > 0 ? ` ${recusados.length} não aprovados: ${motivos.join("; ")}.` : "";
  voltar(formData, `${aprovados.length} aprovados: o convite sai no próximo horário permitido do perfil.${detalhe}`);
}

export async function rejeitarSelecionados(formData: FormData) {
  const operador = await exigirOperador();
  const selecionados = await leadsVisiveis(operador.id, ids.parse(formData.getAll("leadIds")));
  const rejeitados = await rejeitarLeads(obterDb(), { leadIds: selecionados, operadorId: operador.id, agora: new Date() });
  voltar(formData, `${rejeitados} rejeitados. Nada foi enviado.`);
}

/** Dá a nota de aderência aos leads em triagem da campanha que ainda não têm nota (§4.13). */
export async function darNotasDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const campanhaId = z.uuid().parse(formData.get("campanha"));
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  const avaliador = obterAvaliadorDeAderencia();
  if (!avaliador) voltar(formData, "A nota de aderência precisa da chave da Anthropic. Peça ao admin para configurar.");
  const resultado = await darNotas({ db: obterDb(), avaliador: avaliador!, agora: new Date() }, { campanhaId });
  voltar(
    formData,
    resultado.ok
      ? `${resultado.avaliados} leads com nota.${resultado.restantes > 0 ? ` Ainda faltam ${resultado.restantes}: clique de novo.` : ""}`
      : resultado.erro,
  );
}

/** Aprova de uma vez quem passa da nota de corte (D9). Cada lead passa pelas regras da triagem. */
export async function aprovarAcimaDoCorteDoPainel(formData: FormData) {
  const operador = await exigirOperador();
  const campanhaId = z.uuid().parse(formData.get("campanha"));
  await exigirCampanhaDoOperador(operador.id, campanhaId);
  const { aprovados, recusados, corte } = await aprovarAcimaDoCorte(obterDb(), {
    campanhaId,
    operadorId: operador.id,
    agora: new Date(),
    unipile: obterUnipileSeConfigurada(),
  });
  const motivos = [...new Set(recusados.map((r) => r.motivo))];
  const detalhe = recusados.length > 0 ? ` ${recusados.length} não aprovados: ${motivos.join("; ")}.` : "";
  voltar(formData, `${aprovados.length} aprovados com nota a partir de ${corte}: o convite sai no próximo horário permitido do perfil.${detalhe}`);
}
