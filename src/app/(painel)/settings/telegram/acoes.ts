"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { urlPublicaDoApp } from "@/lib/env";
import { apagarLinkDeEntrada, conectarTelegram, criarLinkDeEntrada, desconectarTelegram, salvarBoasVindas } from "@/server/canais/telegram";
import { obterCanal } from "@/server/canais/canais";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { obterClienteTelegram } from "@/server/dependencias";
import { obterCofre } from "@/server/segredos";
import { exigirOperadorComModuloNaAcao } from "@/server/supabase/servidor";

const ROTA = "/settings/telegram";

function voltar(mensagem: string, extra = ""): never {
  revalidatePath(ROTA);
  redirect(`${ROTA}?msg=${encodeURIComponent(mensagem)}${extra}`);
}

async function exigirAdminComTelegram() {
  const operador = await exigirOperadorComModuloNaAcao("telegram");
  if (operador.papel !== "admin") voltar("Só um admin da organização conecta e desconecta o bot.");
  return operador;
}

/** Conecta o bot (§4.20). Se ele já manda os avisos para outro sistema, a tela pede para confirmar. */
export async function conectarTelegramDoPainel(formData: FormData) {
  const operador = await exigirAdminComTelegram();
  const resultado = await conectarTelegram(
    { db: obterDb(), telegram: obterClienteTelegram(), cofre: obterCofre(), urlDoApp: urlPublicaDoApp() },
    {
      organizacaoId: operador.organizacaoId,
      operadorId: operador.id,
      organizacaoNome: operador.organizacaoNome,
      token: String(formData.get("token") ?? ""),
      tomarDoOutro: formData.get("tomarDoOutro") === "sim",
      agora: new Date(),
    },
  );
  if (!resultado.ok) voltar(resultado.erro, "outroWebhook" in resultado ? `&other=${encodeURIComponent(resultado.outroWebhook)}` : "");
  voltar(`Bot @${resultado.usuario} conectado. Quem abrir o link do bot e tocar em Começar entra na lista.`);
}

export async function desconectarTelegramDoPainel() {
  const operador = await exigirAdminComTelegram();
  const resultado = await desconectarTelegram({ db: obterDb(), telegram: obterClienteTelegram(), cofre: obterCofre() }, { organizacaoId: operador.organizacaoId, operadorId: operador.id, agora: new Date() });
  voltar(resultado.ok ? "Bot desconectado. Os contatos do Telegram ficam guardados." : resultado.erro);
}

export async function salvarBoasVindasDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("telegram");
  const resultado = await salvarBoasVindas(obterDb(), { organizacaoId: operador.organizacaoId, texto: formData.get("boasVindas") });
  voltar(resultado.ok ? "Boas-vindas salvas." : resultado.erro);
}

export async function criarLinkDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("telegram");
  const resultado = await comOperador(obterDb(), operador.id, async (tx) => {
    const canal = await obterCanal(tx, { organizacaoId: operador.organizacaoId, tipo: "telegram" });
    if (!canal || canal.status === "desconectado") return { ok: false as const, erro: "Conecte o bot antes." };
    const tagId = z.uuid().safeParse(formData.get("tagId")).data ?? null;
    return criarLinkDeEntrada(tx, { canalId: canal.id, nome: formData.get("nome"), tagId, operadorId: operador.id, agora: new Date() });
  });
  voltar(resultado.ok ? "Link criado. Quem entrar por ele ganha a tag." : resultado.erro);
}

export async function apagarLinkDoPainel(formData: FormData) {
  const operador = await exigirOperadorComModuloNaAcao("telegram");
  const linkId = z.uuid().parse(formData.get("linkId"));
  const resultado = await comOperador(obterDb(), operador.id, (tx) => apagarLinkDeEntrada(tx, linkId));
  voltar(resultado.ok ? "Link apagado. Quem já entrou por ele continua com a tag." : resultado.erro);
}
