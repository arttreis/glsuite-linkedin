import { dossie as esquemaDoDossie, normalizarUrlDoSite, type Dossie } from "@/domain/dossie";
import { ErroDoModelo, type Uso } from "@/server/agente/modelo";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import type { FonteDoSite, LeitorDeSite } from "./leitor";
import { entradaDaEstruturacao, promptDaEstruturacao, promptDaLeitura, VERSAO_DOS_PROMPTS_DO_DOSSIE } from "./prompts";

/** Leitura em "lendo" há mais que isso parou no meio (deploy, timeout): pode recomeçar. */
const LEITURA_PARADA_MS = 5 * 60 * 1000;

export type SituacaoDaOferta = {
  ofertaId: string | null;
  url: string | null;
  leitura: { status: "nenhuma" | "lendo" | "pronta" | "erro" | "parada"; erro: string | null; iniciadaEm: Date | null };
  dossie: Dossie | null;
  fontes: FonteDoSite[];
  geradoEm: Date | null;
  editadoEm: Date | null;
  custoUsd: number | null;
};

type LinhaDaOferta = {
  id: string;
  url: string;
  status: "lendo" | "pronta" | "erro";
  dossie: unknown;
  fontes: FonteDoSite[];
  erro: string | null;
  leitura_iniciada_em: Date;
  gerado_em: Date | null;
  editado_em: Date | null;
  custo_usd: string | null;
};

/** A oferta da organização como a tela mostra. Roda como o operador (RLS) ou como sistema. */
export async function ofertaDaOrganizacao(db: Db, organizacaoId: string, agora: Date): Promise<SituacaoDaOferta> {
  const [linha] = await db.query<LinhaDaOferta>(
    `select id, url, status, dossie, fontes, erro, leitura_iniciada_em, gerado_em, editado_em, custo_usd
       from public.ofertas where organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  if (!linha) {
    return {
      ofertaId: null,
      url: null,
      leitura: { status: "nenhuma", erro: null, iniciadaEm: null },
      dossie: null,
      fontes: [],
      geradoEm: null,
      editadoEm: null,
      custoUsd: null,
    };
  }
  const parada = linha.status === "lendo" && agora.getTime() - new Date(linha.leitura_iniciada_em).getTime() > LEITURA_PARADA_MS;
  const lido = esquemaDoDossie.safeParse(linha.dossie);
  return {
    ofertaId: linha.id,
    url: linha.url,
    leitura: { status: parada ? "parada" : linha.status, erro: linha.erro, iniciadaEm: linha.leitura_iniciada_em },
    dossie: lido.success ? lido.data : null,
    fontes: linha.fontes,
    geradoEm: linha.gerado_em,
    editadoEm: linha.editado_em,
    custoUsd: linha.custo_usd === null ? null : Number(linha.custo_usd),
  };
}

/**
 * Marca a oferta como "lendo" para a URL dada. Quem chama dispara
 * `concluirLeitura` depois (fora da requisição). Roda como o operador: o RLS
 * garante que a oferta é da organização dele.
 */
export async function iniciarLeitura(
  db: Db,
  p: { organizacaoId: string; url: string; operadorId: string; agora: Date },
): Promise<{ ok: true; ofertaId: string } | { ok: false; erro: string }> {
  const config = await lerConfiguracao(db, "dossie");
  if (!config.ativo) return { ok: false, erro: "A leitura de site está desligada pelo admin." };
  const endereco = normalizarUrlDoSite(p.url);
  if (!endereco.ok) return endereco;

  const atual = await ofertaDaOrganizacao(db, p.organizacaoId, p.agora);
  if (atual.leitura.status === "lendo") return { ok: false, erro: "Já estou lendo o site. Espere terminar." };

  const [linha] = await db.query<{ id: string }>(
    `insert into public.ofertas (organizacao_id, url, status, erro, leitura_iniciada_em, criado_por, atualizado_em)
     values ($1::uuid, $2, 'lendo', null, $3, $4::uuid, $3)
     on conflict (organizacao_id) do update
       set url = excluded.url, status = 'lendo', erro = null,
           leitura_iniciada_em = excluded.leitura_iniciada_em, atualizado_em = excluded.atualizado_em
     returning id`,
    [p.organizacaoId, endereco.url, p.agora, p.operadorId],
  );
  await registrarEvento(db, {
    tipo: "dossie_leitura_iniciada",
    entidade: "oferta",
    entidadeId: linha!.id,
    payload: { url: endereco.url },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true, ofertaId: linha!.id };
}

const somarUso = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  saida: a.saida + b.saida,
  cacheLeitura: a.cacheLeitura + b.cacheLeitura,
  cacheEscrita: a.cacheEscrita + b.cacheEscrita,
});

/**
 * Lê o site e grava o dossiê. Roda como sistema, depois da resposta. Falha
 * vira status "erro" com o motivo, sem apagar o dossiê da leitura anterior.
 */
export async function concluirLeitura(
  deps: { db: Db; leitor: LeitorDeSite; agora: () => Date },
  p: { ofertaId: string },
): Promise<void> {
  const { db, leitor } = deps;
  const [oferta] = await db.query<{ url: string; status: string }>("select url, status from public.ofertas where id = $1::uuid", [
    p.ofertaId,
  ]);
  if (!oferta || oferta.status !== "lendo") return;
  const endereco = normalizarUrlDoSite(oferta.url);
  if (!endereco.ok) return falhar(db, p.ofertaId, endereco.erro, deps.agora());

  const inicio = Date.now();
  try {
    const config = await lerConfiguracao(db, "dossie");
    const leitura = await leitor.ler({
      sistema: promptDaLeitura({ maxPaginas: config.max_paginas }),
      url: endereco.url,
      dominio: endereco.dominio,
      maxPaginas: config.max_paginas,
    });
    const estruturado = await leitor.estruturar({
      sistema: promptDaEstruturacao(),
      entrada: entradaDaEstruturacao({ url: endereco.url, notas: leitura.notas, fontes: leitura.fontes }),
    });
    const uso = somarUso(leitura.uso, estruturado.uso);
    const custo = (custoDaChamada(leitura.modelo, leitura.uso) ?? 0) + (custoDaChamada(estruturado.modelo, estruturado.uso) ?? 0);
    const agora = deps.agora();

    await db.query(
      `update public.ofertas
          set status = 'pronta', dossie = $2::jsonb, fontes = $3::jsonb, erro = null, modelo = $4,
              uso = $5::jsonb, custo_usd = $6, gerado_em = $7, editado_por = null, editado_em = null, atualizado_em = $7
        where id = $1::uuid and status = 'lendo'`,
      [p.ofertaId, JSON.stringify(estruturado.saida), JSON.stringify(leitura.fontes), estruturado.modelo, JSON.stringify(uso), custo, agora],
    );
    await registrarEvento(db, {
      tipo: "dossie_gerado",
      entidade: "oferta",
      entidadeId: p.ofertaId,
      payload: {
        modelo: estruturado.modelo,
        paginas: leitura.fontes.length,
        custo_usd: Number(custo.toFixed(4)),
        duracao_ms: Date.now() - inicio,
        versao_prompt: VERSAO_DOS_PROMPTS_DO_DOSSIE,
      },
      em: agora,
    });
  } catch (erro) {
    const motivo = erro instanceof ErroDoModelo ? erro.message : "a IA não respondeu";
    await falhar(db, p.ofertaId, motivo, deps.agora());
    if (!(erro instanceof ErroDoModelo)) console.error("Leitura do site falhou", erro);
  }
}

async function falhar(db: Db, ofertaId: string, motivo: string, agora: Date): Promise<void> {
  await db.query(
    "update public.ofertas set status = 'erro', erro = $2, atualizado_em = $3 where id = $1::uuid",
    [ofertaId, motivo, agora],
  );
  await registrarEvento(db, { tipo: "dossie_falhou", entidade: "oferta", entidadeId: ofertaId, payload: { motivo }, em: agora });
}
