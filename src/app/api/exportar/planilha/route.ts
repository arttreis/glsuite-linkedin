import type { NextRequest } from "next/server";
import { z } from "zod";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";
import { gerarPlanilhaEspelho } from "@/server/exportacao/planilha";
import { exigirOperador } from "@/server/supabase/servidor";

/** CSV da planilha-espelho da praça. Roda com o RLS do operador: só sai o que ele enxerga. */
export async function GET(request: NextRequest) {
  const operador = await exigirOperador();
  const praca = z.enum(["domestico", "canada", "espanha"]).safeParse(request.nextUrl.searchParams.get("praca"));
  if (!praca.success) return Response.json({ erro: "praça inválida" }, { status: 400 });

  const csv = await comOperador(obterDb(), operador.id, (tx) => gerarPlanilhaEspelho(tx, praca.data));
  const hoje = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="planilha-espelho-${praca.data}-${hoje}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
