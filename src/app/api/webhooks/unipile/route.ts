import { obterDb } from "@/server/db";
import { obterUnipile, segredoDaUnipile } from "@/server/dependencias";
import { processarWebhook } from "@/server/webhooks/processar";
import { receberWebhookUnipile } from "@/server/webhooks/receber";

export async function POST(request: Request) {
  const db = obterDb();
  return receberWebhookUnipile(request, {
    db,
    segredo: segredoDaUnipile(),
    agora: () => new Date(),
    processar: (webhookId) => processarWebhook({ db, unipile: obterUnipile(), agora: new Date() }, webhookId),
  });
}
