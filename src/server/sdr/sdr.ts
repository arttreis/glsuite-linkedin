import { dossie as esquemaDoDossie } from "@/domain/dossie";
import { limparEdicao } from "@/domain/edicao";
import { explicarErroDoSdr, sdr as esquemaDoSdr, type Sdr, type SdrDaIa } from "@/domain/sdr";
import { ErroDoModelo, type Resposta } from "@/server/agente/modelo";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { entradaDeGerarSdr, promptDeGerarSdr, VERSAO_DO_PROMPT_DO_SDR } from "./prompts";

/** Gera o SDR a partir da análise. Em produção é o Claude (`claude.ts`); nos testes, um falso. */
export interface GeradorDeSdr {
  gerar(p: { sistema: string; entrada: string }): Promise<Resposta<SdrDaIa>>;
}

export type SdrDaOrganizacao = { id: string; versao: number; sdr: Sdr; atualizadoEm: Date };

export type ResultadoDoSdr = { ok: true; sdr: SdrDaOrganizacao } | { ok: false; erro: string };

type Origem = "ia" | "humano" | "ajuste" | "desfazer";

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
  },
): Promise<SdrDaOrganizacao> {
  return db.transacao(async (tx) => {
    const [gravado] = await tx.query<{ id: string; versao: number }>(
      `insert into public.sdrs (organizacao_id, versao, sdr, gerado_de_oferta_em, atualizado_por, criado_em, atualizado_em)
       values ($1::uuid, 1, $2::jsonb, $3, $4::uuid, $5, $5)
       on conflict (organizacao_id) do update
         set versao = public.sdrs.versao + 1, sdr = excluded.sdr, atualizado_por = excluded.atualizado_por,
             atualizado_em = excluded.atualizado_em,
             gerado_de_oferta_em = coalesce(excluded.gerado_de_oferta_em, public.sdrs.gerado_de_oferta_em)
       returning id, versao`,
      [p.organizacaoId, JSON.stringify(p.sdr), p.geradoDeOfertaEm ?? null, p.por, p.agora],
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
 * Gera o SDR da análise confirmada (§4.3), em nome de `nome` (quem vai
 * conversar). Sem análise confirmada, recusa. Se já existe SDR, a geração vira
 * versão nova e mantém o link de agenda.
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

  let resposta: Resposta<SdrDaIa>;
  try {
    resposta = await deps.gerador.gerar({ sistema: promptDeGerarSdr({ nome: p.nome }), entrada: entradaDeGerarSdr(analise.data) });
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) console.error("SDR não gerado", erro);
    return { ok: false, erro: erro instanceof ErroDoModelo ? erro.message : "A IA não respondeu. Tente de novo." };
  }

  const atual = await obterSdr(db, p.organizacaoId);
  const novo = esquemaDoSdr.safeParse({ ...resposta.saida, link_agenda: atual?.sdr.link_agenda ?? null });
  if (!novo.success) return { ok: false, erro: "A IA devolveu um SDR fora do formato. Tente de novo." };

  const gravado = await gravarVersaoDoSdr(db, {
    organizacaoId: p.organizacaoId,
    sdr: novo.data,
    origem: "ia",
    por: p.operadorId,
    agora: p.agora,
    geradoDeOfertaEm: oferta?.confirmado_em ?? null,
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

/** Edição humana do SDR: vira versão nova. Roda como o operador. */
export async function salvarSdr(
  db: Db,
  p: { organizacaoId: string; sdr: unknown; operadorId: string; agora: Date },
): Promise<{ ok: true; versao: number } | { ok: false; erro: string }> {
  const validado = esquemaDoSdr.safeParse(limparEdicao(p.sdr));
  if (!validado.success) return { ok: false, erro: explicarErroDoSdr(validado.error) };
  const gravado = await gravarVersaoDoSdr(db, {
    organizacaoId: p.organizacaoId,
    sdr: validado.data,
    origem: "humano",
    por: p.operadorId,
    agora: p.agora,
  });
  return { ok: true, versao: gravado.versao };
}
