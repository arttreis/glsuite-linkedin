import { obterDb } from "@/server/db";
import { obterClienteTelegram, obterEnviadores, segredoDoCron } from "@/server/dependencias";
import { processarDisparos } from "@/server/disparos/fila";
import { reprocessarAvisosDoTelegram } from "@/server/disparos/webhook-telegram";
import { reprocessarAvisosPendentes } from "@/server/disparos/webhook-whatsapp";
import { encerrarLancamentosVencidos } from "@/server/lancamentos/lancamentos";
import { obterCofre } from "@/server/segredos";
import { segredoConfere } from "@/server/unipile/webhooks";

// A rodada trabalha até 45 s e para; a próxima continua de onde parou.
export const maxDuration = 120;

/**
 * A fila dos disparos (§4.18), a cada minuto pelo pg_cron do Supabase
 * (`supabase/snippets/disparos-pg-cron.sql`). Também retenta os avisos dos
 * canais que falharam ao processar e encerra os lançamentos com o carrinho
 * fechado há 7 dias (§4.21). Exige `Authorization: Bearer <CRON_SECRET>`.
 */
async function rodada(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!segredoConfere(token, segredoDoCron())) return Response.json({ erro: "não autorizado" }, { status: 401 });
  const db = obterDb();
  const cofre = obterCofre();
  const fila = await processarDisparos({ db, cofre, agora: () => new Date(), enviadores: obterEnviadores() });
  const avisos = {
    whatsapp: await reprocessarAvisosPendentes({ db, cofre, agora: () => new Date() }),
    telegram: await reprocessarAvisosDoTelegram({ db, cofre, telegram: obterClienteTelegram(), agora: () => new Date() }),
  };
  // Os lançamentos não derrubam a fila: o erro vai no lugar do número.
  let lancamentos: { encerrados: number } | { erro: string };
  try {
    lancamentos = { encerrados: await encerrarLancamentosVencidos(db, new Date()) };
  } catch (erro) {
    lancamentos = { erro: erro instanceof Error ? erro.message : String(erro) };
  }
  return Response.json({ fila, avisos, lancamentos });
}

export const GET = rodada;
export const POST = rodada;
