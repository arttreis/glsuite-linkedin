import "server-only";
import type { CorDaTag } from "@/domain/contatos";
import { listarTags } from "@/server/contatos/tags";
import type { Db } from "@/server/db/tipos";

/** O que o editor de segmento oferece para escolher: as tags e as campanhas da organização. Roda como o operador. */
export async function opcoesDoEditor(
  db: Db,
  organizacaoId: string,
): Promise<{ tags: { id: string; nome: string; cor: CorDaTag }[]; campanhas: { id: string; nome: string }[] }> {
  const tags = await listarTags(db, organizacaoId);
  const campanhas = await db.query<{ id: string; nome: string }>(
    `select c.id, c.nome from public.campanhas c join public.perfis pf on pf.id = c.perfil_id
      where pf.organizacao_id = $1::uuid and not pf.casa order by c.nome`,
    [organizacaoId],
  );
  return { tags: tags.map(({ id, nome, cor }) => ({ id, nome, cor })), campanhas };
}
