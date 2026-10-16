import type { NextRequest } from "next/server";
import { obterDb } from "@/server/db";
import { obterClienteTelegram } from "@/server/dependencias";
import { receberWebhookDoTelegram } from "@/server/disparos/webhook-telegram";
import { obterCofre } from "@/server/segredos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhook do bot do Telegram de um canal (§4.20). O Telegram manda o segredo
 * do canal em `X-Telegram-Bot-Api-Secret-Token`; sem ele, recusa.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/telegram/[canal]">) {
  const { canal } = await ctx.params;
  if (!UUID.test(canal)) return Response.json({ erro: "canal não encontrado" }, { status: 404 });
  return receberWebhookDoTelegram(request, canal, { db: obterDb(), cofre: obterCofre(), telegram: obterClienteTelegram(), agora: () => new Date() });
}
