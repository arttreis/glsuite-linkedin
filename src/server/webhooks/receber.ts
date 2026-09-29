import type { Db } from "@/server/db/tipos";
import { idDoEvento, interpretarWebhookUnipile, segredoConfere } from "@/server/unipile/webhooks";

export type DependenciasDoReceptor = {
  db: Db;
  segredo: string;
  agora: () => Date;
  processar: (webhookId: string) => Promise<unknown>;
};

/**
 * Receptor dos webhooks da Unipile:
 * 1. confere o header secreto cadastrado no webhook (a V1 não assina);
 * 2. grava em `webhooks_recebidos` com chave de idempotência (entrega repetida
 *    vira no-op);
 * 3. processa na hora. Se falhar, o tick retenta; a Unipile recebe 200 de
 *    qualquer jeito, para não reenviar o que já está guardado.
 */
export async function receberWebhookUnipile(req: Request, deps: DependenciasDoReceptor): Promise<Response> {
  if (!segredoConfere(req.headers.get("unipile-auth"), deps.segredo)) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  const bruto = await req.text();
  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return Response.json({ erro: "corpo não é JSON" }, { status: 400 });
  }

  const evento = interpretarWebhookUnipile(corpo);
  const recebidoEm = deps.agora();
  const [registro] = await deps.db.query<{ id: string }>(
    `insert into public.webhooks_recebidos (provider_event_id, fonte, tipo, payload, recebido_em)
     values ($1, $2, $3, $4::jsonb, $5)
     on conflict (provider_event_id) do nothing
     returning id`,
    [idDoEvento(evento, bruto, recebidoEm), evento.fonte, evento.tipo, bruto, recebidoEm],
  );
  if (!registro) return Response.json({ ok: true, duplicado: true });

  await deps.processar(registro.id);
  return Response.json({ ok: true });
}
