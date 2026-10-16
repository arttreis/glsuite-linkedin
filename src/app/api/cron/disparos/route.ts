import { obterDb } from "@/server/db";
import { obterEnviadores, segredoDoCron } from "@/server/dependencias";
import { processarDisparos } from "@/server/disparos/fila";
import { reprocessarAvisosPendentes } from "@/server/disparos/webhook-whatsapp";
import { obterCofre } from "@/server/segredos";
import { segredoConfere } from "@/server/unipile/webhooks";

// A rodada trabalha até 45 s e para; a próxima continua de onde parou.
export const maxDuration = 120;

/**
 * A fila dos disparos (§4.18), a cada minuto pelo pg_cron do Supabase
 * (`supabase/snippets/disparos-pg-cron.sql`). Também retenta os avisos dos
 * canais que falharam ao processar. Exige `Authorization: Bearer <CRON_SECRET>`.
 */
async function rodada(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!segredoConfere(token, segredoDoCron())) return Response.json({ erro: "não autorizado" }, { status: 401 });
  const db = obterDb();
  const cofre = obterCofre();
  const fila = await processarDisparos({ db, cofre, agora: () => new Date(), enviadores: obterEnviadores() });
  const avisos = await reprocessarAvisosPendentes({ db, cofre, agora: () => new Date() });
  return Response.json({ fila, avisos });
}

export const GET = rodada;
export const POST = rodada;
