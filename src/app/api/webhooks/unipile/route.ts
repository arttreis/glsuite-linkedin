import { after } from "next/server";
import { processarMensagensPendentes } from "@/server/agente/agente";
import { obterDb } from "@/server/db";
import { obterModeloDeLinguagem, obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { processarWebhook } from "@/server/webhooks/processar";
import { receberWebhookUnipile } from "@/server/webhooks/receber";

export async function POST(request: Request) {
  const db = obterDb();
  const resposta = await receberWebhookUnipile(request, {
    db,
    segredo: segredoDaUnipile(),
    agora: () => new Date(),
    processar: (webhookId) => processarWebhook({ db, unipile: obterUnipile(), agora: new Date() }, webhookId),
  });

  // Quem respondeu não espera o próximo tick: o agente roda depois da resposta à
  // Unipile (que quer 200 em até 30 s). Se falhar aqui, o tick pega.
  const modelo = obterModeloDeLinguagem();
  if (modelo && resposta.ok) {
    after(() => processarMensagensPendentes({ db, modelo, agora: new Date() }, 3));
  }
  return resposta;
}
