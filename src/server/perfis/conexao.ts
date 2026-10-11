import { z } from "zod";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { statusMaisGrave } from "./status-conta";

type Dependencias = { db: Db; unipile: ClienteUnipile };

/**
 * Link do hosted auth da Unipile para conectar (ou reconectar) a conta do
 * LinkedIn de um perfil. `name` leva o id do perfil, que volta no callback.
 * O link vale 30 min, mas a Unipile invalida todos no restart diário: por isso
 * ele é gerado a cada clique.
 */
export async function gerarLinkDeConexao(
  deps: Dependencias & { urlApp: string; segredo: string },
  p: { perfilId: string; agora: Date; voltarPara?: string },
): Promise<string> {
  const [perfil] = await deps.db.query<{ id: string; unipile_account_id: string | null }>(
    "select id, unipile_account_id from public.perfis where id = $1::uuid",
    [p.perfilId],
  );
  if (!perfil) throw new Error("Perfil não encontrado");

  const notify = new URL("/api/unipile/conta", deps.urlApp);
  notify.searchParams.set("segredo", deps.segredo);
  return deps.unipile.gerarLinkDeConexao({
    tipo: perfil.unipile_account_id ? "reconnect" : "create",
    contaParaReconectar: perfil.unipile_account_id ?? undefined,
    nome: perfil.id,
    notifyUrl: notify.toString(),
    sucessoUrl: new URL(`${p.voltarPara ?? "/settings/linkedin"}?conexao=ok`, deps.urlApp).toString(),
    falhaUrl: new URL(`${p.voltarPara ?? "/settings/linkedin"}?conexao=falhou`, deps.urlApp).toString(),
    expiraEm: new Date(p.agora.getTime() + 30 * 60_000),
  });
}

const esquemaNotificacao = z.object({
  status: z.enum(["CREATION_SUCCESS", "RECONNECTED"]),
  account_id: z.string().min(1),
  name: z.uuid(),
});

export type ResultadoConexao = { ok: true; perfilId: string } | { ok: false; motivo: string };

/**
 * Callback do hosted auth. O payload não é assinado, então a conta é
 * confirmada na própria Unipile antes de ser ligada ao perfil. O perfil
 * continua pausado: ativar é sempre um ato humano (§4.4).
 */
export async function registrarContaConectada(
  deps: Dependencias,
  corpo: unknown,
  agora: Date,
): Promise<ResultadoConexao> {
  const notificacao = esquemaNotificacao.safeParse(corpo);
  if (!notificacao.success) return { ok: false, motivo: "payload inválido" };
  const { account_id: accountId, name: perfilId, status } = notificacao.data;

  const [perfil] = await deps.db.query<{ id: string }>("select id from public.perfis where id = $1::uuid", [perfilId]);
  if (!perfil) return { ok: false, motivo: "perfil desconhecido" };

  const conta = await deps.unipile.obterConta(accountId);
  if (conta.tipo !== "LINKEDIN") return { ok: false, motivo: `conta ${conta.tipo} não é do LinkedIn` };
  const dono = await deps.unipile.obterDonoDaConta(accountId);
  const tipoConta = dono.salesNavigator ? "sales_navigator" : dono.premium ? "premium" : "gratuita";

  return deps.db.transacao(async (tx) => {
    const [outro] = await tx.query<{ slug: string }>(
      "select slug from public.perfis where unipile_account_id = $1 and id <> $2::uuid",
      [accountId, perfilId],
    );
    if (outro) return { ok: false as const, motivo: `conta já ligada ao perfil ${outro.slug}` };

    await tx.query(
      `update public.perfis
          set unipile_account_id = $2, linkedin_provider_id = $3, tipo_conta = $4,
              limite_nota_convite = $5, unipile_status = $6, unipile_status_em = $7
        where id = $1::uuid`,
      [perfilId, accountId, dono.providerId, tipoConta, tipoConta === "gratuita" ? 200 : 300, statusMaisGrave(conta.status), agora],
    );
    await registrarEvento(tx, {
      tipo: status === "RECONNECTED" ? "conta_reconectada" : "conta_conectada",
      entidade: "perfil",
      entidadeId: perfilId,
      perfilId,
      payload: { account_id: accountId, tipo_conta: tipoConta, provider_id: dono.providerId },
      ator: "unipile",
      em: agora,
    });
    return { ok: true as const, perfilId };
  });
}

const FONTES_DE_WEBHOOK = ["messaging", "users", "account_status"] as const;

const EVENTOS_DE_STATUS = [
  "creation_success",
  "creation_fail",
  "deleted",
  "reconnected",
  "sync_success",
  "stopped",
  "ok",
  "connecting",
  "error",
  "credentials",
  "permissions",
];

/**
 * Garante os 3 webhooks do SDR na Unipile, com o header secreto. Idempotente:
 * não recria o que já existe para a mesma URL e fonte.
 */
export async function garantirWebhooks(
  unipile: ClienteUnipile,
  p: { urlApp: string; segredo: string },
): Promise<{ criados: string[]; existentes: string[] }> {
  const url = new URL("/api/webhooks/unipile", p.urlApp).toString();
  const atuais = await unipile.listarWebhooks();
  const criados: string[] = [];
  const existentes: string[] = [];
  for (const fonte of FONTES_DE_WEBHOOK) {
    if (atuais.some((w) => w.url === url && w.fonte === fonte)) {
      existentes.push(fonte);
      continue;
    }
    await unipile.criarWebhook({
      url,
      fonte,
      nome: `guessless-sdr ${fonte}`,
      headers: { "Unipile-Auth": p.segredo, "Content-Type": "application/json" },
      eventos:
        fonte === "account_status" ? EVENTOS_DE_STATUS : fonte === "messaging" ? ["message_received"] : ["new_relation"],
    });
    criados.push(fonte);
  }
  return { criados, existentes };
}
