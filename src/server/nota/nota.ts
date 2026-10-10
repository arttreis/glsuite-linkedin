import { notasValidas } from "@/domain/nota";
import { ErroDoModelo, type Uso } from "@/server/agente/modelo";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { obterPublico, type Resultado } from "@/server/publicos/publicos";
import { aprovarLeads, type ResultadoDaTriagem } from "@/server/triagem/triagem";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import type { AvaliadorDeAderencia } from "./avaliador";
import { entradaDaNota, promptDaNota, VERSAO_DO_PROMPT_DA_NOTA } from "./prompts";

/** Pessoas por chamada à IA. */
const LOTE = 20;

type LeadSemNota = { id: string; cargo: string | null; empresa: string | null; localizacao: string | null };

const somar = (a: Uso, b: Uso): Uso => ({
  entrada: a.entrada + b.entrada,
  saida: a.saida + b.saida,
  cacheLeitura: a.cacheLeitura + b.cacheLeitura,
  cacheEscrita: a.cacheEscrita + b.cacheEscrita,
});

export type SituacaoDasNotas = { semNota: number; acimaDoCorte: number; corte: number };

/** Quantos leads em triagem estão sem nota e quantos passam do corte (D9), sem bloqueio. */
export async function situacaoDasNotas(db: Db, campanhaId: string): Promise<SituacaoDasNotas> {
  const { nota_de_corte: corte } = await lerConfiguracao(db, "busca");
  const [linha] = await db.query<{ sem_nota: number; acima: number }>(
    `select count(*) filter (where nota is null)::int as sem_nota,
            count(*) filter (where nota >= $2 and bloqueio_motivo is null)::int as acima
       from public.leads where campanha_id = $1::uuid and estado = 'triagem'`,
    [campanhaId, corte],
  );
  return { semNota: linha!.sem_nota, acimaDoCorte: linha!.acima, corte };
}

/**
 * Dá a nota de aderência (§4.13) aos leads em triagem da campanha de público
 * que ainda não têm nota, venham da busca ou de arquivo. Usa só o que a busca
 * trouxe (cargo, empresa, local): não visita perfil nem chama o LinkedIn. Nota
 * não aprova ninguém; quem aprova é o humano, na triagem. Roda com a conexão
 * do sistema; quem chama autoriza o operador antes.
 */
export async function darNotas(
  deps: { db: Db; avaliador: AvaliadorDeAderencia; agora: Date },
  p: { campanhaId: string; limite?: number },
): Promise<Resultado<{ avaliados: number; restantes: number }>> {
  const { db } = deps;
  const [campanha] = await db.query<{ publico_id: string | null }>("select publico_id from public.campanhas where id = $1::uuid", [
    p.campanhaId,
  ]);
  if (!campanha?.publico_id) return { ok: false, erro: "Só campanha de público tem nota de aderência." };
  const publico = await obterPublico(db, campanha.publico_id);
  if (!publico) return { ok: false, erro: "Público não encontrado." };

  const leads = await db.query<LeadSemNota>(
    `select l.id, pe.cargo, pe.empresa, pe.localizacao
       from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
      where l.campanha_id = $1::uuid and l.estado = 'triagem' and l.nota is null
      order by l.criado_em, l.id
      limit $2`,
    [p.campanhaId, p.limite ?? 100],
  );

  const sistema = promptDaNota(publico);
  let avaliados = 0;
  let uso: Uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
  let modelo: string | null = null;
  let falha: string | null = null;
  for (let inicio = 0; inicio < leads.length; inicio += LOTE) {
    const lote = leads.slice(inicio, inicio + LOTE);
    try {
      const resposta = await deps.avaliador.avaliar({ sistema, entrada: entradaDaNota(lote) });
      uso = somar(uso, resposta.uso);
      modelo = resposta.modelo;
      for (const nota of notasValidas(resposta.saida, lote.length)) {
        const [gravada] = await db.query<{ id: string }>(
          `update public.leads set nota = $2, nota_motivo = $3, nota_em = $4
            where id = $1::uuid and estado = 'triagem' and nota is null returning id`,
          [lote[nota.indice]!.id, nota.nota, nota.motivo, deps.agora],
        );
        if (gravada) avaliados++;
      }
    } catch (erro) {
      if (!(erro instanceof ErroDoModelo)) console.error("Nota de aderência falhou", erro);
      falha = erro instanceof ErroDoModelo ? erro.message.replace(/\.$/, "") : "a IA não respondeu";
      break;
    }
  }

  if (modelo) {
    await registrarEvento(db, {
      tipo: "notas_dadas",
      entidade: "campanha",
      entidadeId: p.campanhaId,
      payload: {
        avaliados,
        modelo,
        custo_usd: Number((custoDaChamada(modelo, uso) ?? 0).toFixed(4)),
        versao_prompt: VERSAO_DO_PROMPT_DA_NOTA,
      },
      em: deps.agora,
    });
  }
  const { semNota: restantes } = await situacaoDasNotas(db, p.campanhaId);
  if (falha && avaliados === 0) return { ok: false, erro: `Não consegui dar as notas: ${falha}.` };
  return { ok: true, avaliados, restantes };
}

/**
 * "Aprovar os que passam do corte": a decisão é do humano que clica, e cada
 * lead passa pelas mesmas regras da aprovação na triagem (bloqueio, opt-out,
 * máximo da campanha). Lead sem nota ou abaixo do corte fica para olhar um
 * por um.
 */
export async function aprovarAcimaDoCorte(
  db: Db,
  p: { campanhaId: string; operadorId: string; agora: Date; unipile?: ClienteUnipile },
): Promise<ResultadoDaTriagem & { corte: number }> {
  const { nota_de_corte: corte } = await lerConfiguracao(db, "busca");
  const ids = await db.query<{ id: string }>(
    `select id from public.leads
      where campanha_id = $1::uuid and estado = 'triagem' and bloqueio_motivo is null and nota >= $2
      order by nota desc, criado_em`,
    [p.campanhaId, corte],
  );
  const resultado = await aprovarLeads(db, {
    leadIds: ids.map((l) => l.id),
    operadorId: p.operadorId,
    agora: p.agora,
    unipile: p.unipile,
  });
  return { ...resultado, corte };
}
