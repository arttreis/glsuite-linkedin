import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { envPublico } from "@/lib/env";

const ROTAS_PUBLICAS = ["/login", "/auth/"];

/**
 * Renova a sessão do Supabase a cada requisição do painel e faz a checagem
 * otimista de login. A autorização de verdade acontece no servidor (layout do
 * painel e RLS).
 */
export async function atualizarSessao(request: NextRequest) {
  const env = envPublico();
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesParaGravar, cabecalhos) => {
        for (const { name, value } of cookiesParaGravar) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesParaGravar) resposta.cookies.set(name, value, options);
        for (const [nome, valor] of Object.entries(cabecalhos ?? {})) resposta.headers.set(nome, valor);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const caminho = request.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((rota) => caminho === rota || caminho.startsWith(rota));

  if (!data?.claims && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("proximo", caminho);
    return NextResponse.redirect(url);
  }

  resposta.headers.set("Cache-Control", "private, no-store");
  return resposta;
}
