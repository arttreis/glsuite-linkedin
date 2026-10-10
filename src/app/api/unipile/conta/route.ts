import { after, type NextRequest } from "next/server";
import { concluirPrimeiroAcesso, organizacaoNoPrimeiroAcesso } from "@/server/acesso/vinculo";
import { importarHistorico } from "@/server/conversas/externas";
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
  if (resultado.ok) {
    // Conta conectada: no primeiro acesso, a campanha começa (§4.6); e o
    // histórico de conversas vai para a inbox (§4.6 do épico anterior), sem
    // segurar a resposta à Unipile. Se falhar, a tela e o botão da inbox refazem.
    after(async () => {
      try {
        const organizacaoId = await organizacaoNoPrimeiroAcesso(obterDb(), resultado.perfilId);
        if (organizacaoId) {
          await concluirPrimeiroAcesso({ db: obterDb(), unipile: obterUnipile(), agora: new Date() }, { organizacaoId });
        }
      } catch (erro) {
        console.error("primeiro acesso não concluído pelo aviso da Unipile", erro);
      }
      try {
        await importarHistorico({ db: obterDb(), unipile: obterUnipile(), agora: new Date() }, { perfilId: resultado.perfilId });
      } catch (erro) {
        console.error("histórico da Unipile não importado", erro);
      }
    });
  }
  return Response.json(resultado, { status: resultado.ok ? 200 : 422 });
}
