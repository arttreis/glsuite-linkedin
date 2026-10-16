import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

export type MembroDaEquipe = {
  id: string;
  nome: string;
  email: string;
  papel: "admin" | "operador";
  ativo: boolean;
  perfilIds: string[];
};

/** Os membros e as contas que cada um opera (§4.12). Roda dentro de `comOperador`. */
export async function equipeDaOrganizacao(db: Db): Promise<{ membros: MembroDaEquipe[]; contas: { id: string; nome: string }[] }> {
  const membros = await db.query<MembroDaEquipe>(
    `select o.id, o.nome, o.email, o.papel, o.ativo,
            coalesce(array_agg(op.perfil_id) filter (where op.perfil_id is not null), '{}') as "perfilIds"
       from public.operadores o
       left join public.operador_perfis op
         on op.operador_id = o.id and not exists (select 1 from public.perfis pf where pf.id = op.perfil_id and pf.arquivado_em is not null)
      group by o.id
      order by o.ativo desc, o.papel, o.nome`,
  );
  const contas = await db.query<{ id: string; nome: string }>("select id, nome from public.perfis where not casa and arquivado_em is null order by nome");
  return { membros, contas };
}

type Resultado = { ok: true } | { ok: false; erro: string };

/** O admin que pede e o membro, da mesma organização; só o admin muda a equipe (§4.12). */
async function exigirAdmin(db: Db, adminId: string, membroId: string): Promise<{ organizacaoId: string } | { erro: string }> {
  const [linha] = await db.query<{ papel: string; organizacao_id: string; mesma: boolean }>(
    `select a.papel, a.organizacao_id, m.organizacao_id = a.organizacao_id as mesma
       from public.operadores a, public.operadores m
      where a.id = $1::uuid and m.id = $2::uuid and a.ativo`,
    [adminId, membroId],
  );
  if (!linha || !linha.mesma) return { erro: "Membro não encontrado." };
  if (linha.papel !== "admin") return { erro: "Só um admin da organização muda a equipe." };
  return { organizacaoId: linha.organizacao_id };
}

export async function mudarPapelDoMembro(
  db: Db,
  p: { adminId: string; membroId: string; papel: "admin" | "operador"; agora: Date },
): Promise<Resultado> {
  return db.transacao(async (tx) => {
    const acesso = await exigirAdmin(tx, p.adminId, p.membroId);
    if ("erro" in acesso) return { ok: false, erro: acesso.erro };
    if (p.papel === "operador") {
      const [outros] = await tx.query<{ n: number }>(
        "select count(*)::int as n from public.operadores where organizacao_id = $1::uuid and papel = 'admin' and ativo and id <> $2::uuid",
        [acesso.organizacaoId, p.membroId],
      );
      if (outros!.n === 0) return { ok: false, erro: "A organização precisa de pelo menos um admin." };
    }
    await tx.query("update public.operadores set papel = $2 where id = $1::uuid", [p.membroId, p.papel]);
    await registrarEvento(tx, {
      tipo: "papel_alterado",
      entidade: "operador",
      entidadeId: p.membroId,
      payload: { papel: p.papel },
      ator: p.adminId,
      em: p.agora,
    });
    return { ok: true };
  });
}

/** As contas que o membro opera: troca a lista inteira. Só contas da organização, sem a da casa. */
export async function definirContasDoMembro(
  db: Db,
  p: { adminId: string; membroId: string; perfilIds: string[]; agora: Date },
): Promise<Resultado> {
  return db.transacao(async (tx) => {
    const acesso = await exigirAdmin(tx, p.adminId, p.membroId);
    if ("erro" in acesso) return { ok: false, erro: acesso.erro };
    const validas = await tx.query<{ id: string }>(
      "select id from public.perfis where organizacao_id = $1::uuid and not casa and arquivado_em is null and id = any($2::uuid[])",
      [acesso.organizacaoId, p.perfilIds],
    );
    if (validas.length !== new Set(p.perfilIds).size) return { ok: false, erro: "Conta fora da organização." };
    // A conta excluída (arquivada) não aparece na tela: o acesso a ela fica, para o histórico.
    await tx.query(
      `delete from public.operador_perfis
        where operador_id = $1::uuid and not (perfil_id = any($2::uuid[]))
          and perfil_id not in (select id from public.perfis where arquivado_em is not null)`,
      [p.membroId, p.perfilIds],
    );
    for (const { id } of validas) {
      await tx.query(
        "insert into public.operador_perfis (operador_id, perfil_id) values ($1::uuid, $2::uuid) on conflict do nothing",
        [p.membroId, id],
      );
    }
    await registrarEvento(tx, {
      tipo: "contas_do_membro",
      entidade: "operador",
      entidadeId: p.membroId,
      payload: { perfis: validas.map((v) => v.id) },
      ator: p.adminId,
      em: p.agora,
    });
    return { ok: true };
  });
}
