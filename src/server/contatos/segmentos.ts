import { chaveDaTag } from "@/domain/contatos";
import { descreverFiltro, filtroDoSegmento, semCondicao, type FiltroDeContatos } from "@/domain/filtro-de-contatos";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Resultado } from "@/server/publicos/publicos";
import { contarContatos, listarContatos, type ContatoDaLista } from "./contatos";

export const MAX_NOME_DO_SEGMENTO = 80;
/** Quantos contatos a prévia do segmento mostra enquanto a pessoa monta. */
export const NA_PREVIA = 12;

export type Segmento = { id: string; nome: string; filtros: FiltroDeContatos; atualizadoEm: Date };
export type SegmentoNaLista = Segmento & { descricao: string; contatos: number };

/**
 * Os nomes das tags e das campanhas da organização pelo id, para descrever os
 * filtros em português. Roda como o operador.
 */
export async function nomesParaOsFiltros(db: Db, organizacaoId: string): Promise<Map<string, string>> {
  const linhas = await db.query<{ id: string; nome: string }>(
    `select id, nome from public.tags where organizacao_id = $1::uuid
     union all
     select c.id, c.nome from public.campanhas c join public.perfis pf on pf.id = c.perfil_id where pf.organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  return new Map(linhas.map((linha) => [linha.id, linha.nome]));
}

/** Os segmentos da organização com quantos contatos cada um tem agora (§4.17). Roda como o operador. */
export async function listarSegmentos(db: Db, organizacaoId: string): Promise<SegmentoNaLista[]> {
  const linhas = await db.query<{ id: string; nome: string; filtros: unknown; atualizadoEm: Date }>(
    `select id, nome, filtros, atualizado_em as "atualizadoEm" from public.segmentos where organizacao_id = $1::uuid order by chave`,
    [organizacaoId],
  );
  const nomes = await nomesParaOsFiltros(db, organizacaoId);
  const segmentos: SegmentoNaLista[] = [];
  for (const linha of linhas) {
    const filtros = filtroDoSegmento(linha.filtros);
    segmentos.push({
      ...linha,
      filtros,
      descricao: descreverFiltro(filtros, nomes),
      contatos: await contarContatos(db, { organizacaoId, filtro: filtros }),
    });
  }
  return segmentos;
}

/** O segmento da organização, ou null (apagado ou de outra organização). */
export async function obterSegmento(db: Db, p: { id: string; organizacaoId: string }): Promise<Segmento | null> {
  const [linha] = await db.query<{ id: string; nome: string; filtros: unknown; atualizadoEm: Date }>(
    `select id, nome, filtros, atualizado_em as "atualizadoEm" from public.segmentos where id = $1::uuid and organizacao_id = $2::uuid`,
    [p.id, p.organizacaoId],
  );
  return linha ? { ...linha, filtros: filtroDoSegmento(linha.filtros) } : null;
}

export type PreviaDoSegmento = { total: number; primeiros: ContatoDaLista[]; descricao: string };

/** Quantos o filtro tem agora e os primeiros (§4.17): a tela mostra enquanto a pessoa monta. Roda como o operador. */
export async function previaDoSegmento(db: Db, p: { organizacaoId: string; filtros: unknown }): Promise<PreviaDoSegmento> {
  const filtros = filtroDoSegmento(p.filtros);
  const { contatos, total } = await listarContatos(db, { organizacaoId: p.organizacaoId, filtro: filtros });
  return { total, primeiros: contatos.slice(0, NA_PREVIA), descricao: descreverFiltro(filtros, await nomesParaOsFiltros(db, p.organizacaoId)) };
}

const nomeDoSegmento = (valor: unknown) => (typeof valor === "string" ? valor.replace(/\s+/g, " ").trim().slice(0, MAX_NOME_DO_SEGMENTO).trim() : "");

/**
 * Cria ou salva o segmento (§4.17). O nome não repete na organização (sem
 * caixa e acento), e o segmento precisa de pelo menos uma condição: sem
 * nenhuma, ele seria a base inteira. Roda como o operador.
 */
export async function salvarSegmento(
  db: Db,
  p: { organizacaoId: string; id: string | null; nome: unknown; filtros: unknown; operadorId: string; agora: Date },
): Promise<Resultado<{ id: string }>> {
  const nome = nomeDoSegmento(p.nome);
  if (!nome) return { ok: false, erro: "Dê um nome ao segmento." };
  const filtros = filtroDoSegmento(p.filtros);
  if (semCondicao(filtros)) return { ok: false, erro: "Escolha pelo menos uma condição: sem nenhuma, o segmento seria todos os contatos." };
  const chave = chaveDaTag(nome);
  const [mesmoNome] = await db.query<{ id: string; nome: string }>(
    "select id, nome from public.segmentos where organizacao_id = $1::uuid and chave = $2",
    [p.organizacaoId, chave],
  );
  if (mesmoNome && mesmoNome.id !== p.id) return { ok: false, erro: `Já existe o segmento "${mesmoNome.nome}".` };
  const guardado = { ...filtros, situacao: undefined };

  if (p.id) {
    const salvos = await db.query<{ id: string }>(
      "update public.segmentos set nome = $3, chave = $4, filtros = $5::jsonb where id = $1::uuid and organizacao_id = $2::uuid returning id",
      [p.id, p.organizacaoId, nome, chave, JSON.stringify(guardado)],
    );
    if (salvos.length === 0) return { ok: false, erro: "Segmento não encontrado." };
    return { ok: true, id: p.id };
  }
  const [criado] = await db.query<{ id: string }>(
    `insert into public.segmentos (organizacao_id, nome, chave, filtros, criado_por, criado_em, atualizado_em)
     values ($1::uuid, $2, $3, $4::jsonb, $5::uuid, $6, $6) returning id`,
    [p.organizacaoId, nome, chave, JSON.stringify(guardado), p.operadorId, p.agora],
  );
  await registrarEvento(db, { tipo: "segmento_criado", entidade: "segmento", entidadeId: criado!.id, payload: { nome }, ator: p.operadorId, em: p.agora });
  return { ok: true, id: criado!.id };
}

/** Apaga o segmento. Os disparos feitos com ele guardam o filtro que usaram e não mudam (§4.17). */
export async function apagarSegmento(db: Db, p: { id: string; organizacaoId: string; operadorId: string; agora: Date }): Promise<Resultado> {
  const apagados = await db.query<{ nome: string }>(
    "delete from public.segmentos where id = $1::uuid and organizacao_id = $2::uuid returning nome",
    [p.id, p.organizacaoId],
  );
  if (apagados.length === 0) return { ok: false, erro: "Segmento não encontrado." };
  await registrarEvento(db, { tipo: "segmento_apagado", entidade: "segmento", entidadeId: p.id, payload: { nome: apagados[0]!.nome }, ator: p.operadorId, em: p.agora });
  return { ok: true };
}
