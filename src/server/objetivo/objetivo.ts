import { limparEdicao } from "@/domain/edicao";
import {
  explicarErroDoObjetivo,
  lerObjetivoConfirmado,
  limparResumo,
  mesmasRespostas,
  respostasDoObjetivo,
  type ObjetivoConfirmado,
  type RespostasDoObjetivo,
  type ResumoDaIa,
} from "@/domain/objetivo";
import { ErroDoModelo, type Resposta } from "@/server/agente/modelo";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { entradaDoResumoDoObjetivo, promptDoResumoDoObjetivo, VERSAO_DO_PROMPT_DO_OBJETIVO } from "./prompts";

/** Resume o objetivo para a pessoa validar. Em produção é o Claude (`claude.ts`); nos testes, um falso. */
export interface ResumidorDeObjetivo {
  resumir(p: { sistema: string; entrada: string }): Promise<Resposta<ResumoDaIa>>;
}

export type ResultadoDoObjetivo = { ok: true } | { ok: false; erro: string };

export type SituacaoDoObjetivo = {
  /** O rascunho: as respostas como a pessoa deixou, confirmadas ou não. */
  respostas: RespostasDoObjetivo | null;
  /** O resumo da IA para o rascunho; null quando ainda não pediu ou mudou uma resposta. */
  resumo: string | null;
  /** O que vale para o SDR. */
  confirmado: { objetivo: ObjetivoConfirmado; em: Date; por: string | null } | null;
  /** O rascunho tem o que o confirmado não tem. */
  rascunhoPendente: boolean;
};

type Linha = {
  respostas: unknown;
  resumo: string | null;
  confirmado: unknown;
  confirmado_em: Date | null;
  confirmado_por: string | null;
};

/** O objetivo da organização como a tela mostra. Roda como o operador (RLS) ou como sistema. */
export async function objetivoDaOrganizacao(db: Db, organizacaoId: string): Promise<SituacaoDoObjetivo> {
  const [linha] = await db.query<Linha>(
    `select o.respostas, o.resumo, o.confirmado, o.confirmado_em, op.nome as confirmado_por
       from public.objetivos o
       left join public.operadores op on op.id = o.confirmado_por
      where o.organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  const lido = respostasDoObjetivo.safeParse(linha?.respostas);
  const respostas = lido.success ? lido.data : null;
  const objetivo = lerObjetivoConfirmado(linha?.confirmado);
  const confirmado = objetivo && linha?.confirmado_em ? { objetivo, em: linha.confirmado_em, por: linha.confirmado_por } : null;
  return {
    respostas,
    resumo: respostas ? (linha?.resumo ?? null) : null,
    confirmado,
    rascunhoPendente:
      respostas !== null && (!confirmado || !mesmasRespostas(respostas, confirmado.objetivo) || linha?.resumo !== confirmado.objetivo.resumo),
  };
}

/** O objetivo que vale para o SDR, com quando foi confirmado, ou null. */
export async function objetivoConfirmado(db: Db, organizacaoId: string): Promise<{ objetivo: ObjetivoConfirmado; em: Date } | null> {
  const [linha] = await db.query<{ confirmado: unknown; confirmado_em: Date | null }>(
    "select confirmado, confirmado_em from public.objetivos where organizacao_id = $1::uuid",
    [organizacaoId],
  );
  const objetivo = lerObjetivoConfirmado(linha?.confirmado);
  return objetivo && linha?.confirmado_em ? { objetivo, em: linha.confirmado_em } : null;
}

/**
 * Grava as respostas como rascunho, a cada mudança: quem fecha a aba volta
 * com elas. Resposta mudada apaga o resumo, que era de outras respostas.
 */
export async function salvarRespostas(
  db: Db,
  p: { organizacaoId: string; respostas: unknown; operadorId: string; agora: Date },
): Promise<{ ok: true; respostas: RespostasDoObjetivo } | { ok: false; erro: string }> {
  const lido = respostasDoObjetivo.safeParse(limparEdicao(p.respostas));
  if (!lido.success) return { ok: false, erro: explicarErroDoObjetivo(lido.error) };

  const [atual] = await db.query<{ respostas: unknown; resumo: string | null }>(
    "select respostas, resumo from public.objetivos where organizacao_id = $1::uuid",
    [p.organizacaoId],
  );
  const anteriores = respostasDoObjetivo.safeParse(atual?.respostas);
  const resumo = anteriores.success && mesmasRespostas(anteriores.data, lido.data) ? (atual?.resumo ?? null) : null;
  await db.query(
    `insert into public.objetivos (organizacao_id, respostas, resumo, atualizado_em, atualizado_por)
     values ($1::uuid, $2::jsonb, $3, $4, $5::uuid)
     on conflict (organizacao_id) do update
       set respostas = excluded.respostas, resumo = excluded.resumo,
           atualizado_em = excluded.atualizado_em, atualizado_por = excluded.atualizado_por`,
    [p.organizacaoId, JSON.stringify(lido.data), resumo, p.agora, p.operadorId],
  );
  return { ok: true, respostas: lido.data };
}

/**
 * Grava as respostas e pede à IA o resumo para a pessoa validar (§4.2.1).
 * Roda com a conexão do sistema, sempre na organização do operador: a
 * chamada leva segundos e não deve segurar uma transação aberta. Falha da IA
 * deixa as respostas salvas e diz o motivo.
 */
export async function resumirObjetivo(
  deps: { db: Db; resumidor: ResumidorDeObjetivo; agora: Date },
  p: { organizacaoId: string; respostas: unknown; operadorId: string },
): Promise<{ ok: true; resumo: string } | { ok: false; erro: string }> {
  const { db } = deps;
  const analise = await dossieConfirmado(db, p.organizacaoId);
  if (!analise) return { ok: false, erro: "Confirme a análise do site antes do objetivo." };

  const salvo = await salvarRespostas(db, { ...p, agora: deps.agora });
  if (!salvo.ok) return salvo;

  let resposta: Resposta<ResumoDaIa>;
  try {
    resposta = await deps.resumidor.resumir({
      sistema: promptDoResumoDoObjetivo(),
      entrada: entradaDoResumoDoObjetivo(analise, salvo.respostas),
    });
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) console.error("Resumo do objetivo não gerado", erro);
    return { ok: false, erro: erro instanceof ErroDoModelo ? erro.message : "A IA não respondeu. Tente de novo." };
  }

  const resumo = limparResumo(resposta.saida.resumo);
  if (!resumo) return { ok: false, erro: "A IA devolveu um resumo vazio. Tente de novo." };

  // Só vale para as respostas que foram resumidas: se mudaram no meio, fica sem resumo.
  await db.query("update public.objetivos set resumo = $2 where organizacao_id = $1::uuid and respostas = $3::jsonb", [
    p.organizacaoId,
    resumo,
    JSON.stringify(salvo.respostas),
  ]);
  await registrarEvento(db, {
    tipo: "objetivo_resumido",
    entidade: "organizacao",
    entidadeId: p.organizacaoId,
    payload: {
      modelo: resposta.modelo,
      custo_usd: Number((custoDaChamada(resposta.modelo, resposta.uso) ?? 0).toFixed(4)),
      versao_prompt: VERSAO_DO_PROMPT_DO_OBJETIVO,
      cortado: resumo !== resposta.saida.resumo.replace(/\s+/g, " ").trim(),
    },
    ator: p.operadorId,
    em: deps.agora,
  });
  return { ok: true, resumo };
}

/**
 * "Confirmar": as respostas e o resumo que a pessoa leu passam a valer, com
 * quem confirmou e quando. Sem resumo das respostas atuais, não confirma.
 * Roda como o operador.
 */
export async function confirmarObjetivo(
  db: Db,
  p: { organizacaoId: string; operadorId: string; agora: Date },
): Promise<ResultadoDoObjetivo> {
  const [linha] = await db.query<{ respostas: unknown; resumo: string | null }>(
    "select respostas, resumo from public.objetivos where organizacao_id = $1::uuid",
    [p.organizacaoId],
  );
  const respostas = respostasDoObjetivo.safeParse(linha?.respostas);
  if (!respostas.success || !linha?.resumo) return { ok: false, erro: "Responda e veja o resumo antes de confirmar." };

  const confirmado: ObjetivoConfirmado = { ...respostas.data, resumo: linha.resumo };
  await db.query(
    `update public.objetivos set confirmado = $2::jsonb, confirmado_em = $3, confirmado_por = $4::uuid
      where organizacao_id = $1::uuid`,
    [p.organizacaoId, JSON.stringify(confirmado), p.agora, p.operadorId],
  );
  await registrarEvento(db, {
    tipo: "objetivo_confirmado",
    entidade: "organizacao",
    entidadeId: p.organizacaoId,
    payload: { acao: confirmado.acao, principal: confirmado.principal, duracao: confirmado.duracao },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}

/**
 * O objetivo mudou depois que o SDR foi montado: a tela oferece gerar o SDR
 * de novo. Nunca gera sozinha (§4.2.1). Sem SDR ou sem objetivo, false.
 */
export async function sdrDesatualizado(db: Db, organizacaoId: string): Promise<boolean> {
  const [linha] = await db.query<{ desatualizado: boolean }>(
    `select o.confirmado_em > coalesce(s.gerado_de_objetivo_em, '-infinity'::timestamptz) as desatualizado
       from public.objetivos o
       join public.sdrs s on s.organizacao_id = o.organizacao_id
      where o.organizacao_id = $1::uuid and o.confirmado_em is not null`,
    [organizacaoId],
  );
  return linha?.desatualizado ?? false;
}
