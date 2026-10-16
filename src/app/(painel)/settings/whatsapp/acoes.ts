"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { urlPublicaDoApp } from "@/lib/env";
import { atualizarTemplates, conectarWhatsapp, desconectarCanal } from "@/server/canais/canais";
import { obterDb } from "@/server/db";
import { obterClienteWhatsapp } from "@/server/dependencias";
import { obterCofre } from "@/server/segredos";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

const ROTA = "/settings/whatsapp";

function voltar(mensagem: string): never {
  revalidatePath(ROTA);
  redirect(`${ROTA}?msg=${encodeURIComponent(mensagem)}`);
}

async function exigirAdminComWhatsapp() {
  const operador = await exigirOperadorComModuloNaAcao("whatsapp");
  if (operador.papel !== "admin") voltar("Só um admin da organização conecta e desconecta o WhatsApp.");
  return operador;
}

/** Conecta o número pelo app da organização na Meta (§4.19). */
export async function conectarWhatsappDoPainel(formData: FormData) {
  const operador = await exigirAdminComWhatsapp();
  const resultado = await conectarWhatsapp(
    { db: obterDb(), whatsapp: obterClienteWhatsapp(), cofre: obterCofre(), urlDoApp: urlPublicaDoApp() },
    {
      organizacaoId: operador.organizacaoId,
      operadorId: operador.id,
      wabaId: String(formData.get("wabaId") ?? ""),
      phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
      token: String(formData.get("token") ?? ""),
      segredoDoApp: String(formData.get("segredoDoApp") ?? ""),
      agora: new Date(),
    },
  );
  if (!resultado.ok) voltar(resultado.erro);
  voltar(
    resultado.inscrito
      ? "WhatsApp conectado. A Meta já manda os status e as respostas para o Kakou."
      : "WhatsApp conectado, mas a Meta não aceitou ligar o webhook sozinha. Configure no app com a URL e o token daqui embaixo.",
  );
}

export async function atualizarTemplatesDoPainel() {
  const operador = await exigirOperadorComModuloNaAcao("whatsapp");
  const resultado = await atualizarTemplates({ db: obterDb(), whatsapp: obterClienteWhatsapp(), cofre: obterCofre() }, { organizacaoId: operador.organizacaoId, agora: new Date() });
  voltar(resultado.ok ? `Templates atualizados: ${resultado.aprovados} aprovados pela Meta.` : resultado.erro);
}

export async function desconectarWhatsappDoPainel() {
  const operador = await exigirAdminComWhatsapp();
  const resultado = await desconectarCanal(obterDb(), { organizacaoId: operador.organizacaoId, tipo: "whatsapp", operadorId: operador.id, agora: new Date() });
  if (!resultado.ok) voltar(resultado.erro);
  voltar(
    resultado.disparosPausados > 0
      ? `WhatsApp desconectado. ${resultado.disparosPausados === 1 ? "Um disparo pausou" : `${resultado.disparosPausados} disparos pausaram`}.`
      : "WhatsApp desconectado.",
  );
}
