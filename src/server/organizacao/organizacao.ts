import { z } from "zod";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

const nomeDaOrganizacao = z.string().trim().min(2).max(80);

/**
 * Troca o nome da organização. Roda dentro de `comOperador`: quem decide se o
 * operador pode é o RLS (só o admin da própria organização edita).
 */
export async function renomearOrganizacao(
  db: Db,
  p: { organizacaoId: string; nome: string; operadorId: string; agora: Date },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const nome = nomeDaOrganizacao.safeParse(p.nome);
  if (!nome.success) return { ok: false, erro: "Use de 2 a 80 caracteres." };

  const [antes] = await db.query<{ nome: string }>("select nome from public.organizacoes where id = $1::uuid", [
    p.organizacaoId,
  ]);
  const alteradas = await db.query(
    "update public.organizacoes set nome = $2, atualizado_em = $3 where id = $1::uuid returning id",
    [p.organizacaoId, nome.data, p.agora],
  );
  if (alteradas.length === 0) return { ok: false, erro: "Só um admin da organização muda o nome." };

  await registrarEvento(db, {
    tipo: "organizacao_renomeada",
    entidade: "organizacao",
    entidadeId: p.organizacaoId,
    payload: { de: antes?.nome ?? null, para: nome.data },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}

export type Membro = {
  id: string;
  nome: string;
  email: string;
  papel: "admin" | "operador";
  ativo: boolean;
  perfis: string[];
};

/** Membros da organização do operador logado, com os perfis que cada um opera. */
export async function membrosDaOrganizacao(db: Db): Promise<Membro[]> {
  return db.query<Membro>(
    `select o.id, o.nome, o.email, o.papel, o.ativo,
            coalesce(array_agg(p.nome order by p.nome) filter (where p.id is not null), '{}') as perfis
       from public.operadores o
       left join public.operador_perfis op on op.operador_id = o.id
       left join public.perfis p on p.id = op.perfil_id
      group by o.id
      order by o.ativo desc, o.papel, o.nome`,
  );
}
