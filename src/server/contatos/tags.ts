import { chaveDaTag, ehCorDaTag, MAX_TAGS_POR_ORGANIZACAO, nomeDaTag, type CorDaTag } from "@/domain/contatos";
import { sqlDoFiltro, type FiltroDeContatos } from "@/domain/filtro-de-contatos";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Resultado } from "@/server/publicos/publicos";

export type TagDaOrganizacao = { id: string; nome: string; cor: CorDaTag; contatos: number };

/** As tags da organização em ordem alfabética, com quantos contatos (que o operador enxerga) têm cada uma. */
export async function listarTags(db: Db, organizacaoId: string): Promise<TagDaOrganizacao[]> {
  return db.query<TagDaOrganizacao>(
    `select t.id, t.nome, t.cor,
            (select count(*)::int from public.contato_tags ct join public.contatos c on c.id = ct.contato_id where ct.tag_id = t.id) as contatos
       from public.tags t where t.organizacao_id = $1::uuid order by t.chave`,
    [organizacaoId],
  );
}

const LIMITE = `A organização já tem ${MAX_TAGS_POR_ORGANIZACAO} tags, o máximo. Apague as que não usa antes de criar outra.`;

/** Cria a tag (§4.16). Mesmo nome sem caixa e acento já é a mesma tag: devolve o erro dizendo qual. */
export async function criarTag(
  db: Db,
  p: { organizacaoId: string; nome: unknown; cor?: unknown; operadorId: string; agora: Date },
): Promise<Resultado<{ id: string }>> {
  const nome = nomeDaTag(p.nome);
  if (!nome) return { ok: false, erro: "Dê um nome à tag." };
  const cor: CorDaTag = ehCorDaTag(p.cor) ? p.cor : "cinza";
  return db.transacao(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`tags:${p.organizacaoId}`]);
    const [existente] = await tx.query<{ nome: string }>(
      "select nome from public.tags where organizacao_id = $1::uuid and chave = $2",
      [p.organizacaoId, chaveDaTag(nome)],
    );
    if (existente) return { ok: false, erro: `Já existe a tag "${existente.nome}".` };
    const [contagem] = await tx.query<{ n: number }>("select count(*)::int as n from public.tags where organizacao_id = $1::uuid", [p.organizacaoId]);
    if (contagem!.n >= MAX_TAGS_POR_ORGANIZACAO) return { ok: false, erro: LIMITE };
    const [tag] = await tx.query<{ id: string }>(
      `insert into public.tags (organizacao_id, nome, chave, cor, criado_por, criado_em)
       values ($1::uuid, $2, $3, $4, $5::uuid, $6) returning id`,
      [p.organizacaoId, nome, chaveDaTag(nome), cor, p.operadorId, p.agora],
    );
    return { ok: true, id: tag!.id };
  });
}

/**
 * As tags pelo nome, criando as que faltam (importação, §4.16). Devolve o id de
 * cada uma pela chave. Passar do teto da organização recusa tudo, para a
 * importação não entrar pela metade.
 */
export async function garantirTags(
  db: Db,
  p: { organizacaoId: string; nomes: readonly string[]; operadorId: string; agora: Date },
): Promise<Resultado<{ idPorChave: Map<string, string>; criadas: number }>> {
  const porChave = new Map<string, string>();
  for (const bruto of p.nomes) {
    const nome = nomeDaTag(bruto);
    if (nome && !porChave.has(chaveDaTag(nome))) porChave.set(chaveDaTag(nome), nome);
  }
  if (porChave.size === 0) return { ok: true, idPorChave: new Map(), criadas: 0 };
  return db.transacao(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`tags:${p.organizacaoId}`]);
    const existentes = await tx.query<{ id: string; chave: string }>("select id, chave from public.tags where organizacao_id = $1::uuid", [p.organizacaoId]);
    const idPorChave = new Map(existentes.filter((t) => porChave.has(t.chave)).map((t) => [t.chave, t.id]));
    const faltam = [...porChave].filter(([chave]) => !idPorChave.has(chave)).map(([chave, nome]) => ({ chave, nome }));
    if (existentes.length + faltam.length > MAX_TAGS_POR_ORGANIZACAO) return { ok: false, erro: LIMITE };
    if (faltam.length > 0) {
      const criadas = await tx.query<{ id: string; chave: string }>(
        `insert into public.tags (organizacao_id, nome, chave, criado_por, criado_em)
         select $1::uuid, r.nome, r.chave, $3::uuid, $4 from jsonb_to_recordset($2::jsonb) as r (nome text, chave text)
         returning id, chave`,
        [p.organizacaoId, JSON.stringify(faltam), p.operadorId, p.agora],
      );
      for (const tag of criadas) idPorChave.set(tag.chave, tag.id);
    }
    return { ok: true, idPorChave, criadas: faltam.length };
  });
}

/** Renomeia ou troca a cor (§4.16): vale para todos os contatos que têm a tag. Roda como o operador. */
export async function editarTag(db: Db, p: { tagId: string; nome?: unknown; cor?: unknown }): Promise<Resultado> {
  const [tag] = await db.query<{ organizacao_id: string; nome: string; cor: CorDaTag }>(
    "select organizacao_id, nome, cor from public.tags where id = $1::uuid",
    [p.tagId],
  );
  if (!tag) return { ok: false, erro: "Tag não encontrada." };
  const nome = p.nome === undefined ? tag.nome : nomeDaTag(p.nome);
  if (!nome) return { ok: false, erro: "Dê um nome à tag." };
  const cor = p.cor === undefined ? tag.cor : ehCorDaTag(p.cor) ? p.cor : null;
  if (!cor) return { ok: false, erro: "Cor desconhecida." };
  const [outra] = await db.query<{ nome: string }>(
    "select nome from public.tags where organizacao_id = $1::uuid and chave = $2 and id <> $3::uuid",
    [tag.organizacao_id, chaveDaTag(nome), p.tagId],
  );
  if (outra) return { ok: false, erro: `Já existe a tag "${outra.nome}".` };
  await db.query("update public.tags set nome = $2, chave = $3, cor = $4 where id = $1::uuid", [p.tagId, nome, chaveDaTag(nome), cor]);
  return { ok: true };
}

/** Apaga a tag e tira de todos os contatos (§4.16). Roda como o operador. */
export async function apagarTag(
  db: Db,
  p: { tagId: string; operadorId: string; agora: Date },
): Promise<Resultado<{ contatos: number }>> {
  return db.transacao(async (tx) => {
    const [tag] = await tx.query<{ nome: string }>("select nome from public.tags where id = $1::uuid for update", [p.tagId]);
    if (!tag) return { ok: false, erro: "Tag não encontrada." };
    const [contagem] = await tx.query<{ n: number }>("select count(*)::int as n from public.contato_tags where tag_id = $1::uuid", [p.tagId]);
    await tx.query("delete from public.tags where id = $1::uuid", [p.tagId]);
    await registrarEvento(tx, {
      tipo: "tag_apagada",
      entidade: "tag",
      entidadeId: p.tagId,
      payload: { nome: tag.nome, contatos: contagem!.n },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true, contatos: contagem!.n };
  });
}

/** Em quem pôr ou tirar a tag: os contatos marcados na tela, ou todos os do filtro (§4.16). */
export type AlvoDaTag = { ids: string[] } | { filtro: FiltroDeContatos };

function contatosDoAlvo(alvo: AlvoDaTag, primeiro: number): { where: string; parametros: unknown[] } {
  if ("ids" in alvo) return { where: `c.id = any($${primeiro}::uuid[])`, parametros: [alvo.ids] };
  const { condicoes, parametros } = sqlDoFiltro(alvo.filtro, primeiro);
  return { where: condicoes.length > 0 ? condicoes.join(" and ") : "true", parametros };
}

/**
 * Põe a tag nos contatos do alvo que ainda não a têm. "Todos do filtro" roda
 * o mesmo filtro da lista no servidor, então vale para todos, não só os da
 * página. Roda como o operador: só contatos que ele enxerga. Grava um evento
 * com quantos.
 */
export async function porTag(
  db: Db,
  p: { organizacaoId: string; tagId: string; alvo: AlvoDaTag; operadorId: string; agora: Date },
): Promise<Resultado<{ contatos: number }>> {
  const [tag] = await db.query("select 1 from public.tags where id = $1::uuid and organizacao_id = $2::uuid", [p.tagId, p.organizacaoId]);
  if (!tag) return { ok: false, erro: "Tag não encontrada." };
  const { where, parametros } = contatosDoAlvo(p.alvo, 5);
  const postas = await db.query(
    `insert into public.contato_tags (contato_id, tag_id, em, por)
     select c.id, $2::uuid, $3, $4 from public.contatos c
      where c.organizacao_id = $1::uuid and ${where}
     on conflict (contato_id, tag_id) do nothing
     returning contato_id`,
    [p.organizacaoId, p.tagId, p.agora, p.operadorId, ...parametros],
  );
  if (postas.length > 0) {
    await registrarEvento(db, {
      tipo: "tag_posta",
      entidade: "tag",
      entidadeId: p.tagId,
      payload: { contatos: postas.length, alvo: "ids" in p.alvo ? "selecionados" : "filtro" },
      ator: p.operadorId,
      em: p.agora,
    });
  }
  return { ok: true, contatos: postas.length };
}

/** Tira a tag dos contatos do alvo. Mesmas regras do `porTag`. */
export async function tirarTag(
  db: Db,
  p: { organizacaoId: string; tagId: string; alvo: AlvoDaTag; operadorId: string; agora: Date },
): Promise<Resultado<{ contatos: number }>> {
  const { where, parametros } = contatosDoAlvo(p.alvo, 3);
  const tiradas = await db.query(
    `delete from public.contato_tags ct using public.contatos c
      where ct.contato_id = c.id and ct.tag_id = $2::uuid and c.organizacao_id = $1::uuid and ${where}
      returning ct.contato_id`,
    [p.organizacaoId, p.tagId, ...parametros],
  );
  if (tiradas.length > 0) {
    await registrarEvento(db, {
      tipo: "tag_tirada",
      entidade: "tag",
      entidadeId: p.tagId,
      payload: { contatos: tiradas.length, alvo: "ids" in p.alvo ? "selecionados" : "filtro" },
      ator: p.operadorId,
      em: p.agora,
    });
  }
  return { ok: true, contatos: tiradas.length };
}

/** O contato do lead e as tags dele, para o painel do lead no Chats (§4.16). Roda como o operador. */
export async function tagsDoLead(db: Db, leadId: string): Promise<{ contatoId: string; tags: { id: string; nome: string; cor: CorDaTag }[] } | null> {
  const [linha] = await db.query<{ contatoId: string; tags: { id: string; nome: string; cor: CorDaTag }[] }>(
    `select c.id as "contatoId",
            coalesce((select json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor) order by t.chave)
                        from public.contato_tags ct join public.tags t on t.id = ct.tag_id where ct.contato_id = c.id), '[]'::json) as tags
       from public.leads l join public.contatos c on c.pessoa_id = l.pessoa_id
      where l.id = $1::uuid`,
    [leadId],
  );
  return linha ?? null;
}
