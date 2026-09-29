import type { NextRequest } from "next/server";
import { atualizarSessao } from "@/server/supabase/sessao-proxy";

export async function proxy(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  // Rotas de API (webhooks, cron, saúde) se autenticam por segredo próprio.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
