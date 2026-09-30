import { obterDb } from "@/server/db";
import { obterClienteRd, obterEnviadorDeEmail, obterModeloDeLinguagem, obterUnipile, segredoDoCron } from "@/server/dependencias";
import { executarTick } from "@/server/tick";
import { segredoConfere } from "@/server/unipile/webhooks";

/**
 * Tick do despachante, a cada 5 min. Chamado pelo pg_cron do Supabase (padrão:
 * funciona em qualquer plano) ou pela Vercel Cron (só no plano Pro). Ver
 * docs/pesquisa/cron.md.
 */
async function tick(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!segredoConfere(token, segredoDoCron())) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  const relatorio = await executarTick({
    db: obterDb(),
    unipile: obterUnipile(),
    agora: new Date(),
    enviador: obterEnviadorDeEmail(),
    modelo: obterModeloDeLinguagem(),
    rd: obterClienteRd(),
  });
  return Response.json(relatorio);
}

export const GET = tick;
export const POST = tick;
