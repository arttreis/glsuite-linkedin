/** Verificação de vida para deploy e monitoramento. Não toca banco nem segredo. */
export function GET() {
  return Response.json({
    ok: true,
    servico: "guessless-sdr",
    versao: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  });
}
