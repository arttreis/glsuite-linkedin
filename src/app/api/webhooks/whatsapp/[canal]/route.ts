import type { NextRequest } from "next/server";
import { obterDb } from "@/server/db";
import { receberWebhookWhatsapp, verificarWebhookWhatsapp } from "@/server/disparos/webhook-whatsapp";
import { obterCofre } from "@/server/segredos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Webhook do WhatsApp de um canal (§4.19). O app do cliente na Meta manda os
 * status e as mensagens para cá, assinados com o app secret dele. GET é a
 * verificação da Meta.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/webhooks/whatsapp/[canal]">) {
  const { canal } = await ctx.params;
  if (!UUID.test(canal)) return new Response("canal não encontrado", { status: 404 });
  return verificarWebhookWhatsapp(request.nextUrl, canal, { db: obterDb(), cofre: obterCofre(), agora: () => new Date() });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/whatsapp/[canal]">) {
  const { canal } = await ctx.params;
  if (!UUID.test(canal)) return Response.json({ erro: "canal não encontrado" }, { status: 404 });
  return receberWebhookWhatsapp(request, canal, { db: obterDb(), cofre: obterCofre(), agora: () => new Date() });
}
