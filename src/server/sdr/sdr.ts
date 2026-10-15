import { dossie as esquemaDoDossie } from "@/domain/dossie";
import { limparEdicao } from "@/domain/edicao";
import { explicarErroDoSdr, sdr as esquemaDoSdr, soDaPessoa, type Sdr, type SdrDaIa } from "@/domain/sdr";
import { ErroDoModelo, type Resposta } from "@/server/agente/modelo";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { objetivoConfirmado } from "@/server/objetivo/objetivo";
import { entradaDeGerarSdr, promptDeGerarSdr, VERSAO_DO_PROMPT_DO_SDR } from "./prompts";

/** Gera o SDR a partir da análise. Em produção é o Claude (`claude.ts`); nos testes, um falso. */
export interface GeradorDeSdr {
  gerar(p: { sistema: string; entrada: string }): Promise<Resposta<SdrDaIa>>;
}

export type SdrDaOrganizacao = { id: string; versao: number; sdr: Sdr; atualizadoEm: Date };

export type ResultadoDoSdr = { ok: true; sdr: SdrDaOrganizacao } | { ok: false; erro: string };

export type Origem = "ia" | "humano" | "ajuste" | "desfazer";

export type VersaoDoSdr = { versao: number; origem: Origem; resumo: string | null; pedido: string | null; em: Date; por: string | null };

/** Cada versão do SDR, a mais nova primeiro, para o histórico em Configurações (§4.12). */
export async function historicoDoSdr(db: Db, organizacaoId: string): Promise<VersaoDoSdr[]> {
  return db.query<VersaoDoSdr>(
    `select v.versao, v.origem, v.resumo, v.pedido, v.em, o.nome as por
       from public.sdr_versoes v
       join public.sdrs s on s.id = v.sdr_id
       left join public.operadores o on o.id = v.por
      where s.organizacao_id = $1::uuid
      order by v.versao desc`,
    [organizacaoId],
  );
}

/** Volta o SDR para uma versão antiga, como uma versão nova: o histórico não perde nada. */
export async function voltarParaVersao(
  db: Db,
  p: { organizacaoId: string; versao: number; operadorId: string; agora: Date },
): Promise<{ ok: true; versao: number } | { ok: false; erro: string }> {
  const [antiga] = await db.query<{ sdr: unknown }>(
    `select v.sdr from public.sdr_versoes v join public.sdrs s on s.id = v.sdr_id
      where s.organizacao_id = $1::uuid and v.versao = $2`,
    [p.organizacaoId, p.versao],
  );
  const lido = esquemaDoSdr.safeParse(antiga?.sdr);
  if (!lido.success) return { ok: false, erro: "Essa versão não pode ser restaurada." };
  const gravada = await gravarVersaoDoSdr(db, {
    organizacaoId: p.organizacaoId,
    sdr: lido.data,
    origem: "desfazer",
    resumo: `Voltou para a versão ${p.versao}.`,
    por: p.operadorId,
    agora: p.agora,
  });
  return { ok: true, versao: gravada.versao };
}

/** A versão do SDR e a última mudança, para o Dashboard (§4.9). */
export type ResumoDoSdr = {
  versao: number;
  ultimaMudanca: { origem: Origem; resumo: string | null; pedido: string | null; em: Date; por: string | null } | null;
};

export async function resumoDoSdr(db: Db, organizacaoId: string): Promise<ResumoDoSdr | null> {
  const [linha] = await db.query<{
    versao: number;
    origem: Origem | null;
    resumo: string | null;
    pedido: string | null;
    em: Date | null;
    por: string | null;
  }>(
    `select s.versao, v.origem, v.resumo, v.pedido, v.em, o.nome as por
       from public.sdrs s
       left join lateral (
         select sv.origem, sv.resumo, sv.pedido, sv.em, sv.por from public.sdr_versoes sv
          where sv.sdr_id = s.id order by sv.versao desc limit 1
       ) v on true
       left join public.operadores o on o.id = v.por
      where s.organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  if (!linha) return null;
  return {
    versao: linha.versao,
    ultimaMudanca:
      linha.origem && linha.em
        ? { origem: linha.origem, resumo: linha.resumo, pedido: linha.pedido, em: linha.em, por: linha.por }
        : null,
  };
}

/** O SDR da organização na versão atual, ou null se ela ainda não tem. Roda como o operador ou como sistema. */
export async function obterSdr(db: Db, organizacaoId: string): Promise<SdrDaOrganizacao | null> {
  const [linha] = await db.query<{ id: string; versao: number; sdr: unknown; atualizado_em: Date }>(
    "select id, versao, sdr, atualizado_em from public.sdrs where organizacao_id = $1::uuid",
    [organizacaoId],
  );
  if (!linha) return null;
  const lido = esquemaDoSdr.safeParse(linha.sdr);
  return lido.success ? { id: linha.id, versao: linha.versao, sdr: lido.data, atualizadoEm: linha.atualizado_em } : null;
}

/**
 * Grava o SDR como versão nova (a primeira, se não havia) e guarda a versão no
 * histórico, com o pedido e o resumo quando é um ajuste.
 */
export async function gravarVersaoDoSdr(
  db: Db,
  p: {
    organizacaoId: string;
    sdr: Sdr;
    origem: Origem;
    pedido?: string | null;
    resumo?: string | null;
    por: string | null;
    agora: Date;
    geradoDeOfertaEm?: Date | null;
    geradoDeObjetivoEm?: Date | null;
  },
): Promise<SdrDaOrganizacao> {
  return db.transacao(async (tx) => {
    const [gravado] = await tx.query<{ id: string; versao: number }>(
      `insert into public.sdrs (organizacao_id, versao, sdr, gerado_de_oferta_em, gerado_de_objetivo_em, atualizado_por, criado_em, atualizado_em)
       values ($1::uuid, 1, $2::jsonb, $3, $6, $4::uuid, $5, $5)
       on conflict (organizacao_id) do update
         set versao = public.sdrs.versao + 1, sdr = excluded.sdr, atualizado_por = excluded.atualizado_por,
             atualizado_em = excluded.atualizado_em,
             gerado_de_oferta_em = coalesce(excluded.gerado_de_oferta_em, public.sdrs.gerado_de_oferta_em),
             gerado_de_objetivo_em = coalesce(excluded.gerado_de_objetivo_em, public.sdrs.gerado_de_objetivo_em)
       returning id, versao`,
      [p.organizacaoId, JSON.stringify(p.sdr), p.geradoDeOfertaEm ?? null, p.por, p.agora, p.geradoDeObjetivoEm ?? null],
    );
    await tx.query(
      `insert into public.sdr_versoes (sdr_id, versao, sdr, origem, pedido, resumo, por, em)
       values ($1::uuid, $2, $3::jsonb, $4, $5, $6, $7::uuid, $8)`,
      [gravado!.id, gravado!.versao, JSON.stringify(p.sdr), p.origem, p.pedido ?? null, p.resumo ?? null, p.por, p.agora],
    );
    return { id: gravado!.id, versao: gravado!.versao, sdr: p.sdr, atualizadoEm: p.agora };
  });
}

/**
 * Gera o SDR da análise e do objetivo confirmados (§4.2.1, §4.3), em nome de
 * `nome` (quem vai conversar). Sem análise confirmada, recusa; sem objetivo
 * (organização de antes do passo Objetivo), sai só da análise. Se já existe
 * SDR, a geração vira versão nova e mantém o que só a pessoa decide (link de
 * agenda, cautela).
 */
export async function gerarSdr(
  deps: { db: Db; gerador: GeradorDeSdr },
  p: { organizacaoId: string; nome: string; operadorId: string | null; agora: Date },
): Promise<ResultadoDoSdr> {
  const { db } = deps;
  const [oferta] = await db.query<{ dossie_confirmado: unknown; confirmado_em: Date | null }>(
    "select dossie_confirmado, confirmado_em from public.ofertas where organizacao_id = $1::uuid",
    [p.organizacaoId],
  );
  const analise = esquemaDoDossie.safeParse(oferta?.dossie_confirmado);
  if (!analise.success) return { ok: false, erro: "Confirme a análise do site antes de montar o SDR." };
  const objetivo = await objetivoConfirmado(db, p.organizacaoId);

  let resposta: Resposta<SdrDaIa>;
  try {
    resposta = await deps.gerador.gerar({
      sistema: promptDeGerarSdr({ nome: p.nome, comObjetivo: objetivo !== null }),
      entrada: entradaDeGerarSdr(analise.data, objetivo?.objetivo ?? null),
    });
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) console.error("SDR não gerado", erro);
    return { ok: false, erro: erro instanceof ErroDoModelo ? erro.message : "A IA não respondeu. Tente de novo." };
  }

  const atual = await obterSdr(db, p.organizacaoId);
  const novo = esquemaDoSdr.safeParse({ ...resposta.saida, ...soDaPessoa(atual?.sdr) });
  if (!novo.success) return { ok: false, erro: "A IA devolveu um SDR fora do formato. Tente de novo." };

  const gravado = await gravarVersaoDoSdr(db, {
    organizacaoId: p.organizacaoId,
    sdr: novo.data,
    origem: "ia",
    por: p.operadorId,
    agora: p.agora,
    geradoDeOfertaEm: oferta?.confirmado_em ?? null,
    geradoDeObjetivoEm: objetivo?.em ?? null,
  });
  await registrarEvento(db, {
    tipo: "sdr_gerado",
    entidade: "sdr",
    entidadeId: gravado.id,
    payload: {
      versao: gravado.versao,
      modelo: resposta.modelo,
      custo_usd: Number((custoDaChamada(resposta.modelo, resposta.uso) ?? 0).toFixed(4)),
      versao_prompt: VERSAO_DO_PROMPT_DO_SDR,
      com_objetivo: objetivo !== null,
    },
    ator: p.operadorId ?? "sistema",
    em: p.agora,
  });
  return { ok: true, sdr: gravado };
}

/**
 * O SDR da organização, gerado agora se ainda não existe. Só para telas em que
 * alguém vai ver o SDR (primeiro acesso, Configurações): o agente nunca gera
 * sozinho, para não mudar a voz de quem já conversa sem ninguém ver.
 */
export async function garantirSdr(
  deps: { db: Db; gerador: GeradorDeSdr | null },
  p: { organizacaoId: string; nome: string; operadorId: string | null; agora: Date },
): Promise<ResultadoDoSdr> {
  const atual = await obterSdr(deps.db, p.organizacaoId);
  if (atual) return { ok: true, sdr: atual };
  if (!deps.gerador) return { ok: false, erro: "Montar o SDR precisa da chave da Anthropic. Peça ao admin para configurar." };
  return gerarSdr({ db: deps.db, gerador: deps.gerador }, p);
}

/**
 * Edição humana do SDR: vira versão nova. Roda como o operador. `sdr` pode
 * trazer só uma parte (o editor do SDR, a seção da passagem para você): o
 * resto vem da versão atual, e uma tela não desfaz o que a outra salvou.
 */
export async function salvarSdr(
  db: Db,
  p: { organizacaoId: string; sdr: unknown; operadorId: string; agora: Date; resumo?: string | null },
): Promise<{ ok: true; versao: number } | { ok: false; erro: string }> {
  const parte = limparEdicao(p.sdr);
  const atual = await obterSdr(db, p.organizacaoId);
  const validado = esquemaDoSdr.safeParse(parte !== null && typeof parte === "object" ? { ...atual?.sdr, ...parte } : parte);
  if (!validado.success) return { ok: false, erro: explicarErroDoSdr(validado.error) };
  const gravado = await gravarVersaoDoSdr(db, {
    organizacaoId: p.organizacaoId,
    sdr: validado.data,
    origem: "humano",
    resumo: p.resumo ?? null,
    por: p.operadorId,
    agora: p.agora,
  });
  return { ok: true, versao: gravado.versao };
}
