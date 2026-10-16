import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

/**
 * Exclui uma conta do LinkedIn (§4.12). Apagar a linha não dá: leads, ações,
 * conversas e eventos apontam para ela. Então arquiva: pausa (se ativa), solta
 * a conta da Unipile e some das listas do painel; o histórico fica. Roda dentro
 * de `comOperador`: quem decide se pode é o RLS (o admin ou quem vinculou a
 * conta). Excluir de novo não gera outro evento.
 */
export async function excluirConta(
  db: Db,
  p: { perfilId: string; operadorId: string; operadorNome: string; agora: Date },
): Promise<{ ok: true; nome: string } | { ok: false; erro: string }> {
  const [perfil] = await db.query<{ nome: string; casa: boolean }>("select nome, casa from public.perfis where id = $1::uuid", [p.perfilId]);
  if (!perfil) return { ok: false, erro: "Você não opera esta conta." };
  if (perfil.casa) return { ok: false, erro: "A conta da casa não pode ser excluída." };

  const motivo = `Conta excluída por ${p.operadorNome}`;
  const [excluida] = await db.query<{ nome: string; status: string; account_id: string | null }>(
    `update public.perfis p
        set status = 'pausado',
            motivo_pausa = case when antes.status = 'ativo' then $2 else p.motivo_pausa end,
            pausado_em = case when antes.status = 'ativo' then $3 else p.pausado_em end,
            arquivado_em = $3, unipile_account_id = null, unipile_status = null
       from (select id, status, unipile_account_id from public.perfis where id = $1::uuid) antes
      where p.id = antes.id and not p.casa and p.arquivado_em is null
      returning p.nome, antes.status, antes.unipile_account_id as account_id`,
    [p.perfilId, motivo, p.agora],
  );
  if (!excluida) {
    const [ja] = await db.query<{ arquivada: boolean }>("select arquivado_em is not null as arquivada from public.perfis where id = $1::uuid", [
      p.perfilId,
    ]);
    return ja?.arquivada ? { ok: true, nome: perfil.nome } : { ok: false, erro: "Você não opera esta conta." };
  }

  if (excluida.status === "ativo") {
    await registrarEvento(db, {
      tipo: "perfil_pausado",
      entidade: "perfil",
      entidadeId: p.perfilId,
      perfilId: p.perfilId,
      payload: { motivo },
      ator: p.operadorId,
      em: p.agora,
    });
  }
  await registrarEvento(db, {
    tipo: "perfil_excluido",
    entidade: "perfil",
    entidadeId: p.perfilId,
    perfilId: p.perfilId,
    payload: { account_id: excluida.account_id, nome: excluida.nome },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true, nome: excluida.nome };
}
