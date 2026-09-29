import type { Db } from "@/server/db/tipos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { manipuladoresPadrao } from "./manipuladores";
import {
  interpretarWebhookUnipile,
  type MensagemRecebida,
  type NovaRelacao,
  type StatusDaConta,
} from "@/server/unipile/webhooks";

export type ContextoWebhook = { db: Db; unipile: ClienteUnipile; agora: Date };

export type Manipuladores = {
  mensagem(ctx: ContextoWebhook, dados: MensagemRecebida): Promise<void>;
  novaRelacao(ctx: ContextoWebhook, dados: NovaRelacao): Promise<void>;
  statusDaConta(ctx: ContextoWebhook, dados: StatusDaConta): Promise<void>;
};

export type ResultadoProcessamento = "processado" | "ja_processado" | "erro";

/**
 * Processa um webhook guardado. O efeito e a marca de processado vão na mesma
 * transação, com o registro travado: entrega repetida ou reprocessamento
 * concorrente não duplicam efeito. Em erro, a transação volta inteira e o
 * erro fica registrado para a próxima tentativa (tick do cron).
 */
export async function processarWebhook(
  ctx: ContextoWebhook,
  webhookId: string,
  manipuladores: Manipuladores = manipuladoresPadrao,
): Promise<ResultadoProcessamento> {
  try {
    return await ctx.db.transacao(async (tx) => {
      const [registro] = await tx.query<{ payload: unknown }>(
        `select payload from public.webhooks_recebidos
          where id = $1::uuid and processado_em is null
          for update skip locked`,
        [webhookId],
      );
      if (!registro) return "ja_processado" as const;

      const contexto = { ...ctx, db: tx };
      const evento = interpretarWebhookUnipile(registro.payload);
      if (evento.fonte === "messaging") await manipuladores.mensagem(contexto, evento.dados);
      else if (evento.fonte === "users") await manipuladores.novaRelacao(contexto, evento.dados);
      else if (evento.fonte === "account_status") await manipuladores.statusDaConta(contexto, evento.dados);

      await tx.query(
        `update public.webhooks_recebidos
            set processado_em = $2, erro = null, tentativas = tentativas + 1
          where id = $1::uuid`,
        [webhookId, ctx.agora],
      );
      return "processado" as const;
    });
  } catch (erro) {
    await ctx.db.query(
      "update public.webhooks_recebidos set erro = $2, tentativas = tentativas + 1 where id = $1::uuid",
      [webhookId, (erro as Error).message ?? String(erro)],
    );
    return "erro";
  }
}

/** Retenta webhooks que falharam (chamado pelo tick). Desiste depois de 10 tentativas. */
export async function reprocessarWebhooksPendentes(
  ctx: ContextoWebhook,
  manipuladores: Manipuladores = manipuladoresPadrao,
): Promise<number> {
  const pendentes = await ctx.db.query<{ id: string }>(
    `select id from public.webhooks_recebidos
      where processado_em is null and tentativas < 10
      order by recebido_em
      limit 50`,
  );
  let processados = 0;
  for (const { id } of pendentes) {
    if ((await processarWebhook(ctx, id, manipuladores)) === "processado") processados += 1;
  }
  return processados;
}
