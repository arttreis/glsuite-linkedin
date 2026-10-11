import type { Db } from "@/server/db/tipos";

/** As etapas do funil no período, do convite à reunião (§4.9). */
export type NumerosDoPeriodo = {
  convites: number;
  aceites: number;
  conversas: number;
  qualificados: number;
  reunioes: number;
};

export const PERIODOS = { "7d": { dias: 7, rotulo: "7 dias" }, "30d": { dias: 30, rotulo: "30 dias" } } as const;
export type Periodo = keyof typeof PERIODOS;

export function lerPeriodo(valor: unknown): Periodo {
  return valor === "30d" ? "30d" : "7d";
}

/**
 * O que aconteceu nos últimos dias, contado de onde cada fato fica gravado:
 * convites enviados em `acoes`, aceites em `leads.aceito_em` e as etapas da
 * conversa pelos eventos de transição do lead (cada lead conta uma vez por
 * etapa). Roda dentro de `comOperador`: só as contas que a pessoa opera.
 */
export async function numerosDoPeriodo(db: Db, p: { periodo: Periodo; agora: Date }): Promise<NumerosDoPeriodo> {
  const desde = new Date(p.agora.getTime() - PERIODOS[p.periodo].dias * 24 * 60 * 60 * 1000);
  const [n] = await db.query<NumerosDoPeriodo>(
    `with transicoes as (
       select e.payload ->> 'para' as para, count(distinct e.entidade_id)::int as leads
         from public.eventos e
        where e.tipo = 'lead_transicao' and e.entidade = 'lead'
          and e.payload ->> 'para' in ('em_conversa', 'qualificado', 'reuniao_marcada')
          and e.em >= $1::timestamptz and e.em < $2::timestamptz
        group by 1
     )
     select
       (select count(*)::int from public.acoes
         where tipo = 'convite' and status = 'enviada' and enviada_em >= $1::timestamptz and enviada_em < $2::timestamptz) as convites,
       (select count(*)::int from public.leads where aceito_em >= $1::timestamptz and aceito_em < $2::timestamptz) as aceites,
       coalesce((select leads from transicoes where para = 'em_conversa'), 0) as conversas,
       coalesce((select leads from transicoes where para = 'qualificado'), 0) as qualificados,
       coalesce((select leads from transicoes where para = 'reuniao_marcada'), 0) as reunioes`,
    [desde, p.agora],
  );
  return n!;
}
