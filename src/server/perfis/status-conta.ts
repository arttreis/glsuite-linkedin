import { motivoDePausaDoStatus, STATUS_SAUDAVEIS, statusMaisGrave } from "@/domain/conta";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { ErroUnipile } from "@/server/unipile/erros";
import { pausarPerfil } from "./pausa";

export { motivoDePausaDoStatus, STATUS_SAUDAVEIS, statusMaisGrave };

export async function aplicarStatusDaConta(
  db: Db,
  p: { accountId: string; status: string; origem: "webhook" | "sincronizacao"; agora: Date },
): Promise<{ perfilId: string | null; pausou: boolean }> {
  return db.transacao(async (tx) => {
    const [perfil] = await tx.query<{ id: string; unipile_status: string | null }>(
      "select id, unipile_status from public.perfis where unipile_account_id = $1 for update",
      [p.accountId],
    );
    if (!perfil) return { perfilId: null, pausou: false };

    if (perfil.unipile_status !== p.status) {
      // unipile_status_em marca só a troca entre saudável e não saudável: é dela
      // que o despachante conta o tempo de estabilidade antes de voltar a enviar.
      const trocouDeClasse =
        perfil.unipile_status === null || STATUS_SAUDAVEIS.has(perfil.unipile_status) !== STATUS_SAUDAVEIS.has(p.status);
      await tx.query(
        `update public.perfis
            set unipile_status = $2,
                unipile_status_em = case when $4::boolean then $3::timestamptz else unipile_status_em end
          where id = $1::uuid`,
        [perfil.id, p.status, p.agora, trocouDeClasse],
      );
      await registrarEvento(tx, {
        tipo: "conta_status",
        entidade: "perfil",
        entidadeId: perfil.id,
        perfilId: perfil.id,
        payload: { de: perfil.unipile_status, para: p.status, origem: p.origem },
        ator: p.origem === "webhook" ? "unipile" : "sistema",
        em: p.agora,
      });
    }

    const motivo = motivoDePausaDoStatus(p.status);
    const pausou = motivo
      ? await pausarPerfil(tx, { perfilId: perfil.id, motivo, ator: "unipile", agora: p.agora })
      : false;
    return { perfilId: perfil.id, pausou };
  });
}

/**
 * Confere na Unipile o status de cada conta conectada. Cobre webhook perdido:
 * roda no tick do cron e pelo botão do painel.
 */
export async function sincronizarStatusDasContas(db: Db, unipile: ClienteUnipile, agora: Date): Promise<number> {
  const perfis = await db.query<{ unipile_account_id: string }>(
    "select unipile_account_id from public.perfis where unipile_account_id is not null",
  );
  let alterados = 0;
  for (const { unipile_account_id: accountId } of perfis) {
    let status: string;
    try {
      status = statusMaisGrave((await unipile.obterConta(accountId)).status);
    } catch (erro) {
      if (erro instanceof ErroUnipile && erro.status === 404) status = "DELETED";
      else continue;
    }
    const resultado = await aplicarStatusDaConta(db, { accountId, status, origem: "sincronizacao", agora });
    if (resultado.pausou) alterados += 1;
  }
  return alterados;
}
