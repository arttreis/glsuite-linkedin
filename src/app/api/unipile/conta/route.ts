import type { NextRequest } from "next/server";
import { obterDb } from "@/server/db";
import { obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { registrarContaConectada } from "@/server/perfis/conexao";
import { segredoConfere } from "@/server/unipile/webhooks";

/** notify_url do hosted auth: a Unipile avisa que a conta foi conectada. */
export async function POST(request: NextRequest) {
  if (!segredoConfere(request.nextUrl.searchParams.get("segredo"), segredoDaUnipile())) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  const corpo = await request.json().catch(() => null);
  const resultado = await registrarContaConectada({ db: obterDb(), unipile: obterUnipile() }, corpo, new Date());
  return Response.json(resultado, { status: resultado.ok ? 200 : 422 });
}
