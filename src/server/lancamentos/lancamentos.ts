import { chaveDaTag } from "@/domain/contatos";
import {
  lerDadosDoLancamento,
  lerSdrDoLancamento,
  problemaNasDatas,
  type Aula,
  type DatasDoLancamento,
  type PerguntaFrequente,
  type StatusDoLancamento,
} from "@/domain/lancamentos";
import { liberado, MODULOS_DOS_LANCAMENTOS } from "@/domain/modulos";
import { garantirTags } from "@/server/contatos/tags";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { ModuloNaoContratado, modulosDaOrganizacao } from "@/server/modulos/modulos";
import type { Resultado } from "@/server/publicos/publicos";

/**
 * Lançamentos (§4.21). As funções do painel rodam como o operador
 * (`comOperador`, RLS); o cron encerra pela conexão do sistema. Toda função
 * confere o módulo da organização antes de ler ou escrever: a recusa vale
 * para quem chama direto, sem a tela.
 */

export type Lancamento = {
  id: string;
  organizacaoId: string;
  nome: string;
  produto: string | null;
  tagId: string | null;
  tagNome: string | null;
  datas: DatasDoLancamento;
  linkDoCarrinho: string | null;
  preco: string | null;
  perguntas: PerguntaFrequente[];
  sdrSabe: string | null;
  status: StatusDoLancamento;
  noArEm: Date | null;
  /** O nome do operador; null quando foi o sistema. */
  noArPor: string | null;
  pausadoEm: Date | null;
  pausadoPor: string | null;
  encerradoEm: Date | null;
  encerradoPor: string | null;
  criadoEm: Date;
};

export type LancamentoNaLista = Pick<Lancamento, "id" | "nome" | "produto" | "status" | "datas" | "pausadoEm" | "encerradoEm">;

type AulaGuardada = { nome?: string; quando?: string; link?: string | null };
type ColunasDasDatas = { captacao_em: Date | null; aulas: AulaGuardada[]; carrinho_abre_em: Date | null; carrinho_fecha_em: Date | null };

/** As datas como o domínio usa. Aula sem data vira data inválida: `problemaNasDatas` recusa. */
function datasDaLinha(linha: ColunasDasDatas): DatasDoLancamento {
  return {
    captacaoEm: linha.captacao_em,
    aulas: (linha.aulas ?? []).map<Aula>((aula) => ({ nome: aula.nome ?? "", quando: new Date(aula.quando ?? Number.NaN), link: aula.link ?? null })),
    carrinhoAbreEm: linha.carrinho_abre_em,
    carrinhoFechaEm: linha.carrinho_fecha_em,
  };
}

const aulasParaGuardar = (aulas: readonly Aula[]) =>
  JSON.stringify(aulas.map((aula) => ({ nome: aula.nome, quando: aula.quando.toISOString(), link: aula.link })));

/** Lança `ModuloNaoContratado("comunidades")` se a organização não tem nenhum de `MODULOS_DOS_LANCAMENTOS`. */
export async function exigirModuloDosLancamentos(db: Db, organizacaoId: string): Promise<void> {
  const modulos = await modulosDaOrganizacao(db, organizacaoId);
  if (!liberado(modulos, MODULOS_DOS_LANCAMENTOS)) throw new ModuloNaoContratado(MODULOS_DOS_LANCAMENTOS[0]);
}

const NAO_ENCONTRADO = "Lançamento não encontrado.";

/**
 * Cria o lançamento montando, com a tag de mesmo nome (§4.21, D29): nome igual
 * ao de uma tag que já existe, sem caixa e acento, reaproveita a tag. Passar do
 * teto de tags da organização recusa e não cria o lançamento.
 */
export async function criarLancamento(
  db: Db,
  p: { organizacaoId: string; operadorId: string; entrada: unknown; agora: Date },
): Promise<Resultado<{ id: string }>> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  const lido = lerDadosDoLancamento(p.entrada);
  if (!lido.ok) return lido;
  const { nome, produto, datas } = lido.dados;
  return db.transacao(async (tx) => {
    const tags = await garantirTags(tx, { organizacaoId: p.organizacaoId, nomes: [nome], operadorId: p.operadorId, agora: p.agora });
    if (!tags.ok) return tags;
    const tagId = tags.idPorChave.get(chaveDaTag(nome)) ?? null;
    const [criado] = await tx.query<{ id: string }>(
      `insert into public.lancamentos (organizacao_id, nome, produto, tag_id, captacao_em, aulas, carrinho_abre_em, carrinho_fecha_em, criado_por, criado_em)
       values ($1::uuid, $2, $3, $4::uuid, $5, $6::jsonb, $7, $8, $9::uuid, $10) returning id`,
      [p.organizacaoId, nome, produto, tagId, datas.captacaoEm, aulasParaGuardar(datas.aulas), datas.carrinhoAbreEm, datas.carrinhoFechaEm, p.operadorId, p.agora],
    );
    await registrarEvento(tx, {
      tipo: "lancamento_criado",
      entidade: "lancamento",
      entidadeId: criado!.id,
      payload: { tag_id: tagId, tag_nova: tags.criadas > 0 },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true, id: criado!.id };
  });
}

/** Salva nome, produto e datas. Mudar o nome não renomeia a tag: ela já pode estar em contatos e segmentos. */
export async function salvarLancamento(db: Db, p: { id: string; organizacaoId: string; entrada: unknown; agora: Date }): Promise<Resultado> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  const lido = lerDadosDoLancamento(p.entrada);
  if (!lido.ok) return lido;
  const { nome, produto, datas } = lido.dados;
  const salvos = await db.query(
    `update public.lancamentos
        set nome = $3, produto = $4, captacao_em = $5, aulas = $6::jsonb, carrinho_abre_em = $7, carrinho_fecha_em = $8
      where id = $1::uuid and organizacao_id = $2::uuid returning id`,
    [p.id, p.organizacaoId, nome, produto, datas.captacaoEm, aulasParaGuardar(datas.aulas), datas.carrinhoAbreEm, datas.carrinhoFechaEm],
  );
  return salvos.length > 0 ? { ok: true } : { ok: false, erro: NAO_ENCONTRADO };
}

/** A aba SDR (§4.21 e §4.26): o preço e as condições, as perguntas, o que mais ele sabe e o link do carrinho. */
export async function salvarSdrDoLancamento(db: Db, p: { id: string; organizacaoId: string; entrada: unknown; agora: Date }): Promise<Resultado> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  const lido = lerSdrDoLancamento(p.entrada);
  if (!lido.ok) return lido;
  const { preco, perguntas, sdrSabe, linkDoCarrinho } = lido.dados;
  const salvos = await db.query(
    `update public.lancamentos set preco = $3, perguntas = $4::jsonb, sdr_sabe = $5, link_do_carrinho = $6
      where id = $1::uuid and organizacao_id = $2::uuid returning id`,
    [p.id, p.organizacaoId, preco, JSON.stringify(perguntas), sdrSabe, linkDoCarrinho],
  );
  return salvos.length > 0 ? { ok: true } : { ok: false, erro: NAO_ENCONTRADO };
}

type LinhaDoLancamento = ColunasDasDatas & Omit<Lancamento, "datas" | "perguntas"> & { perguntas: PerguntaFrequente[] };

/** O lançamento da organização; de outra, null. */
export async function obterLancamento(db: Db, p: { id: string; organizacaoId: string }): Promise<Lancamento | null> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  const [linha] = await db.query<LinhaDoLancamento>(
    `select l.id, l.organizacao_id as "organizacaoId", l.nome, l.produto, l.tag_id as "tagId", t.nome as "tagNome",
            l.captacao_em, l.aulas, l.carrinho_abre_em, l.carrinho_fecha_em,
            l.link_do_carrinho as "linkDoCarrinho", l.preco, l.perguntas, l.sdr_sabe as "sdrSabe", l.status,
            l.no_ar_em as "noArEm", (select o.nome from public.operadores o where o.id = l.no_ar_por) as "noArPor",
            l.pausado_em as "pausadoEm", (select o.nome from public.operadores o where o.id = l.pausado_por) as "pausadoPor",
            l.encerrado_em as "encerradoEm", (select o.nome from public.operadores o where o.id = l.encerrado_por) as "encerradoPor",
            l.criado_em as "criadoEm"
       from public.lancamentos l left join public.tags t on t.id = l.tag_id
      where l.id = $1::uuid and l.organizacao_id = $2::uuid`,
    [p.id, p.organizacaoId],
  );
  if (!linha) return null;
  const { captacao_em, aulas, carrinho_abre_em, carrinho_fecha_em, ...resto } = linha;
  return { ...resto, perguntas: resto.perguntas ?? [], datas: datasDaLinha({ captacao_em, aulas, carrinho_abre_em, carrinho_fecha_em }) };
}

/** Os lançamentos da organização, os mais novos primeiro. */
export async function listarLancamentos(db: Db, organizacaoId: string): Promise<LancamentoNaLista[]> {
  await exigirModuloDosLancamentos(db, organizacaoId);
  const linhas = await db.query<ColunasDasDatas & Omit<LancamentoNaLista, "datas">>(
    `select id, nome, produto, status, captacao_em, aulas, carrinho_abre_em, carrinho_fecha_em,
            pausado_em as "pausadoEm", encerrado_em as "encerradoEm"
       from public.lancamentos where organizacao_id = $1::uuid
      order by criado_em desc, id`,
    [organizacaoId],
  );
  return linhas.map(({ captacao_em, aulas, carrinho_abre_em, carrinho_fecha_em, ...resto }) => ({
    ...resto,
    datas: datasDaLinha({ captacao_em, aulas, carrinho_abre_em, carrinho_fecha_em }),
  }));
}

type Estado = ColunasDasDatas & { status: StatusDoLancamento; pausado_em: Date | null };

/** O lançamento travado para mudar de estado, dentro da transação. */
async function travar(tx: Db, p: { id: string; organizacaoId: string }): Promise<Estado | null> {
  const [linha] = await tx.query<Estado>(
    `select status, pausado_em, captacao_em, aulas, carrinho_abre_em, carrinho_fecha_em
       from public.lancamentos where id = $1::uuid and organizacao_id = $2::uuid for update`,
    [p.id, p.organizacaoId],
  );
  return linha ?? null;
}

const JA_ENCERRADO = "Este lançamento já foi encerrado.";

/**
 * Pôr no ar (§4.21): só de montando e só com as datas válidas; grava quem e
 * quando. Por ora, a conferência é só das datas (os grupos entram no SDR-76).
 */
export async function porNoAr(db: Db, p: { id: string; organizacaoId: string; operadorId: string; agora: Date }): Promise<Resultado> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  return db.transacao(async (tx) => {
    const atual = await travar(tx, p);
    if (!atual) return { ok: false, erro: NAO_ENCONTRADO };
    if (atual.status === "no_ar") return { ok: false, erro: "Este lançamento já está no ar." };
    if (atual.status === "encerrado") return { ok: false, erro: "Lançamento encerrado não volta ao ar." };
    const problema = problemaNasDatas(datasDaLinha(atual));
    if (problema) return { ok: false, erro: problema };
    await tx.query("update public.lancamentos set status = 'no_ar', no_ar_em = $2, no_ar_por = $3::uuid where id = $1::uuid", [p.id, p.agora, p.operadorId]);
    await registrarEvento(tx, { tipo: "lancamento_no_ar", entidade: "lancamento", entidadeId: p.id, ator: p.operadorId, em: p.agora });
    return { ok: true };
  });
}

/** Pausar (§4.21): só no ar e sem pausa. Aqui só grava o estado; a agenda pausa no SDR-93. */
export async function pausarLancamento(db: Db, p: { id: string; organizacaoId: string; operadorId: string; agora: Date }): Promise<Resultado> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  return db.transacao(async (tx) => {
    const atual = await travar(tx, p);
    if (!atual) return { ok: false, erro: NAO_ENCONTRADO };
    if (atual.status === "encerrado") return { ok: false, erro: JA_ENCERRADO };
    if (atual.status === "montando") return { ok: false, erro: "Só dá para pausar lançamento no ar." };
    if (atual.pausado_em) return { ok: false, erro: "Este lançamento já está pausado." };
    await tx.query("update public.lancamentos set pausado_em = $2, pausado_por = $3::uuid where id = $1::uuid", [p.id, p.agora, p.operadorId]);
    await registrarEvento(tx, { tipo: "lancamento_pausado", entidade: "lancamento", entidadeId: p.id, ator: p.operadorId, em: p.agora });
    return { ok: true };
  });
}

/** Retomar é manual (§4.21): só o pausado. */
export async function retomarLancamento(db: Db, p: { id: string; organizacaoId: string; operadorId: string; agora: Date }): Promise<Resultado> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  return db.transacao(async (tx) => {
    const atual = await travar(tx, p);
    if (!atual) return { ok: false, erro: NAO_ENCONTRADO };
    if (atual.status === "encerrado") return { ok: false, erro: JA_ENCERRADO };
    if (atual.status !== "no_ar" || !atual.pausado_em) return { ok: false, erro: "Este lançamento não está pausado." };
    await tx.query("update public.lancamentos set pausado_em = null, pausado_por = null where id = $1::uuid", [p.id]);
    await registrarEvento(tx, { tipo: "lancamento_retomado", entidade: "lancamento", entidadeId: p.id, ator: p.operadorId, em: p.agora });
    return { ok: true };
  });
}

/**
 * O único caminho para encerrar (à mão e sozinho). O SDR-85 (#74) acrescenta
 * aqui o cancelamento da agenda. De montando ou no ar; encerrado não volta.
 * `por`: o id do operador, ou null quando foi o sistema.
 */
export async function encerrarLancamento(db: Db, p: { id: string; organizacaoId: string; por: string | null; agora: Date }): Promise<Resultado> {
  await exigirModuloDosLancamentos(db, p.organizacaoId);
  return db.transacao(async (tx) => {
    const atual = await travar(tx, p);
    if (!atual) return { ok: false, erro: NAO_ENCONTRADO };
    if (atual.status === "encerrado") return { ok: false, erro: JA_ENCERRADO };
    await tx.query(
      `update public.lancamentos set status = 'encerrado', encerrado_em = $2, encerrado_por = $3::uuid, pausado_em = null, pausado_por = null
        where id = $1::uuid`,
      [p.id, p.agora, p.por],
    );
    await registrarEvento(tx, {
      tipo: "lancamento_encerrado",
      entidade: "lancamento",
      entidadeId: p.id,
      payload: { sozinho: p.por === null },
      ator: p.por ?? "sistema",
      em: p.agora,
    });
    return { ok: true };
  });
}

/**
 * Pela conexão do sistema, no cron. Encerra o lançamento no ar (pausado
 * também) 7 dias depois de o carrinho fechar. Montando não encerra sozinho:
 * nunca foi ao ar e nada dele roda. Organização sem o módulo fica de fora:
 * nada dele roda em segundo plano (§4.14). Devolve quantos encerrou.
 */
export async function encerrarLancamentosVencidos(db: Db, agora: Date): Promise<number> {
  const vencidos = await db.query<{ id: string; organizacao_id: string }>(
    `select l.id, l.organizacao_id from public.lancamentos l
      where l.status = 'no_ar' and l.carrinho_fecha_em <= $1::timestamptz - interval '7 days'
        and exists (select 1 from public.modulos_da_organizacao m
                     where m.organizacao_id = l.organizacao_id and m.ativo and m.modulo = any($2::text[]))
      order by l.carrinho_fecha_em, l.id`,
    [agora, [...MODULOS_DOS_LANCAMENTOS]],
  );
  let encerrados = 0;
  for (const lancamento of vencidos) {
    const resultado = await encerrarLancamento(db, { id: lancamento.id, organizacaoId: lancamento.organizacao_id, por: null, agora });
    if (resultado.ok) encerrados += 1;
  }
  return encerrados;
}
