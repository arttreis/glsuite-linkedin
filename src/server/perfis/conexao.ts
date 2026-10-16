import { z } from "zod";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { ErroUnipile, PECA_A_CHAVE } from "@/server/unipile/erros";
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
  const [perfil] = await deps.db.query<{ id: string; unipile_account_id: string | null; unipile_status: string | null; casa: boolean }>(
    "select id, unipile_account_id, unipile_status, casa from public.perfis where id = $1::uuid",
    [p.perfilId],
  );
  if (!perfil) throw new Error("Perfil não encontrado");

  // Conta removida da Unipile não se reconecta: o id não existe mais, então
  // conecta de novo como conta nova e o callback troca o id no perfil.
  const contaParaReconectar = perfil.unipile_status === "DELETED" ? null : perfil.unipile_account_id;
  const notify = new URL("/api/unipile/conta", deps.urlApp);
  notify.searchParams.set("segredo", deps.segredo);
  return deps.unipile.gerarLinkDeConexao({
    tipo: contaParaReconectar ? "reconnect" : "create",
    contaParaReconectar: contaParaReconectar ?? undefined,
    nome: perfil.id,
    notifyUrl: notify.toString(),
    sucessoUrl: urlDeVolta(
      deps.urlApp,
      p.voltarPara,
      perfil.casa ? { conexao: "ok" } : { conexao: "ok", perfil: perfil.id, desde: String(p.agora.getTime()) },
    ),
    falhaUrl: urlDeVolta(deps.urlApp, p.voltarPara, { conexao: "falhou" }),
    expiraEm: new Date(p.agora.getTime() + 30 * 60_000),
  });
}

/**
 * A volta do hosted auth para a tela. No sucesso de uma conta que não é a casa,
 * leva o perfil e a hora do link: o callback chega por outro caminho, e a tela
 * usa os dois para dizer se a conta foi ligada a uma que já existia ou
 * recusada (`desfechoDaConexao`).
 */
function urlDeVolta(urlApp: string, voltarPara: string | undefined, parametros: Record<string, string>): string {
  const url = new URL(voltarPara ?? "/settings/linkedin", urlApp);
  for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor);
  return url.toString();
}

/**
 * O que a tela diz quando a Unipile não gera o link. O link só usa a chave da
 * API, então 401 aqui é a chave, não a conta. Erro que não é da Unipile sobe.
 */
export function mensagemDaFalhaDoLink(erro: unknown): string {
  if (!(erro instanceof ErroUnipile)) throw erro;
  if (erro.status === 401) return `A Unipile recusou a chave da API (${erro.message}). ${PECA_A_CHAVE}`;
  return `A Unipile não gerou o link de conexão (${erro.message}). Tente de novo em instantes.`;
}

const esquemaNotificacao = z.object({
  status: z.enum(["CREATION_SUCCESS", "RECONNECTED"]),
  account_id: z.string().min(1),
  name: z.uuid(),
});

/** `ligadaAExistente`: o LinkedIn já era de outro perfil da organização, que foi ligado às marcas do pendente. */
export type ResultadoConexao = { ok: true; perfilId: string; ligadaAExistente?: true } | { ok: false; motivo: string };

export const MOTIVO_OUTRA_ORGANIZACAO = "conta do LinkedIn já conectada em outra organização";

/**
 * Callback do hosted auth. O payload não é assinado, então a conta é
 * confirmada na própria Unipile antes de ser ligada ao perfil. O perfil
 * continua pausado: ativar é sempre um ato humano (§4.4).
 *
 * O mesmo LinkedIn nunca vira dois perfis (§4.30): se o dono já é de outro
 * perfil da organização, o pendente some e o perfil que existe entra nas
 * marcas dele; se é de outra organização, recusa. A casa não conta.
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
    const [pendente] = await tx.query<{ casa: boolean; organizacao_id: string; conectado: boolean }>(
      "select casa, organizacao_id, unipile_account_id is not null as conectado from public.perfis where id = $1::uuid for update",
      [perfilId],
    );
    if (!pendente) return { ok: false as const, motivo: "perfil desconhecido" };
    if (!pendente.casa) {
      const [mesmoLinkedin] = await tx.query<{ id: string; slug: string; organizacao_id: string }>(
        "select id, slug, organizacao_id from public.perfis where linkedin_provider_id = $1 and id <> $2::uuid and not casa",
        [dono.providerId, perfilId],
      );
      if (mesmoLinkedin && mesmoLinkedin.organizacao_id !== pendente.organizacao_id) {
        // Nada muda no perfil; o evento é o que a tela lê para dizer por quê, sem nomear a outra organização.
        await registrarEvento(tx, {
          tipo: "conexao_recusada",
          entidade: "perfil",
          entidadeId: perfilId,
          perfilId,
          payload: { motivo: "outra_organizacao", account_id: accountId },
          ator: "unipile",
          em: agora,
        });
        return { ok: false as const, motivo: MOTIVO_OUTRA_ORGANIZACAO };
      }
      if (mesmoLinkedin) {
        if (pendente.conectado) return { ok: false as const, motivo: `conta já ligada ao perfil ${mesmoLinkedin.slug}` };
        return ligarAoPerfilQueJaExiste(tx, { pendenteId: perfilId, existenteId: mesmoLinkedin.id, accountId, agora });
      }
    }

    const [outro] = await tx.query<{ slug: string }>(
      "select slug from public.perfis where unipile_account_id = $1 and id <> $2::uuid",
      [accountId, perfilId],
    );
    if (outro) return { ok: false as const, motivo: `conta já ligada ao perfil ${outro.slug}` };

    // Conta nova no perfil leva o nome de quem é dono no LinkedIn; reconectar a
    // mesma conta mantém o nome que alguém tenha editado.
    await tx.query(
      `update public.perfis
          set unipile_account_id = $2, linkedin_provider_id = $3, tipo_conta = $4,
              limite_nota_convite = $5, unipile_status = $6, unipile_status_em = $7,
              nome = case when unipile_account_id is distinct from $2 and $8 <> '' then $8 else nome end
        where id = $1::uuid`,
      [perfilId, accountId, dono.providerId, tipoConta, tipoConta === "gratuita" ? 200 : 300, statusMaisGrave(conta.status), agora, dono.nome.trim()],
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

/**
 * O pendente é a mesma pessoa de um perfil que já existe: o perfil que existe
 * entra nas marcas do pendente, quem vinculou passa a operá-lo, e o pendente
 * (que não tem campanha nem lead) some. A trilha do pendente fica em
 * `eventos` pelo `entidade_id`. O teto continua um só (§4.13).
 */
async function ligarAoPerfilQueJaExiste(
  tx: Db,
  p: { pendenteId: string; existenteId: string; accountId: string; agora: Date },
): Promise<ResultadoConexao> {
  const [campanha] = await tx.query("select 1 from public.campanhas where perfil_id = $1::uuid limit 1", [p.pendenteId]);
  if (campanha) return { ok: false, motivo: "o perfil pendente já tem campanha" };

  const ligadas = await tx.query<{ marca_id: string }>(
    `insert into public.marcas_dos_perfis (perfil_id, marca_id, ligado_em, ligado_por)
     select $1::uuid, mp.marca_id, $3, p.operador_id
       from public.marcas_dos_perfis mp join public.perfis p on p.id = mp.perfil_id
      where mp.perfil_id = $2::uuid
     on conflict (perfil_id, marca_id) do nothing
     returning marca_id`,
    [p.existenteId, p.pendenteId, p.agora],
  );
  await tx.query(
    `insert into public.operador_perfis (operador_id, perfil_id)
     select operador_id, $1::uuid from public.operador_perfis where perfil_id = $2::uuid
     on conflict do nothing`,
    [p.existenteId, p.pendenteId],
  );
  await tx.query("update public.eventos set perfil_id = null where perfil_id = $1::uuid", [p.pendenteId]);
  await tx.query("update public.alertas set perfil_id = null where perfil_id = $1::uuid", [p.pendenteId]);
  await tx.query("delete from public.perfis where id = $1::uuid", [p.pendenteId]);

  for (const { marca_id } of ligadas) {
    await registrarEvento(tx, {
      tipo: "conta_ligada_a_marca",
      entidade: "perfil",
      entidadeId: p.existenteId,
      perfilId: p.existenteId,
      payload: { marca_id, origem: "callback", pendente_id: p.pendenteId, account_id: p.accountId },
      ator: "unipile",
      em: p.agora,
    });
  }
  return { ok: true, perfilId: p.existenteId, ligadaAExistente: true };
}

export type DesfechoDaConexao = "ligada_a_existente" | "outra_organizacao" | null;

/**
 * O que a tela diz na volta do hosted auth (`?conexao=ok&perfil&desde`), pelos
 * eventos gravados depois do link: o pendente ligado a um perfil que já
 * existia, ou recusado por estar noutra organização. Null: seguiu o caminho de
 * sempre (ou o callback ainda não chegou). Roda pela conexão do sistema: o
 * pendente ligado já não existe para o RLS.
 */
export async function desfechoDaConexao(db: Db, p: { perfilId: string; desde: Date }): Promise<DesfechoDaConexao> {
  const [linha] = await db.query<{ ligada: boolean; recusada: boolean }>(
    `select exists (select 1 from public.eventos
                     where tipo = 'conta_ligada_a_marca' and em >= $2::timestamptz and payload ->> 'pendente_id' = $1::text) as ligada,
            exists (select 1 from public.eventos
                     where perfil_id = $1::uuid and tipo = 'conexao_recusada' and em >= $2::timestamptz) as recusada`,
    [p.perfilId, p.desde],
  );
  if (linha!.ligada) return "ligada_a_existente";
  return linha!.recusada ? "outra_organizacao" : null;
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
