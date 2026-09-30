import type { Db } from "@/server/db/tipos";

export type ItemDaFila = {
  acaoId: string;
  leadId: string;
  tipo: "convite" | "dm";
  toque: string | null;
  origem: "template" | "ia" | "humano";
  textoGerado: string | null;
  textoFinal: string | null;
  motivoRevisao: string | null;
  criadaEm: Date;
  pessoa: string;
  cargo: string | null;
  empresa: string | null;
  perfil: string;
  perfilId: string;
  estadoLead: string;
  ultimaEntrada: string | null;
  ultimaEntradaEm: Date | null;
  acaoSugerida: string | null;
  motivoDoAgente: string | null;
  estagioSugerido: string | null;
  confianca: number | null;
  /** T1 personalizado: o fato da pesquisa em que a nota se apoia. */
  gancho: string | null;
};

/** Tudo o que espera decisão humana: rascunhos da IA e ações que o validador barrou. */
export async function listarFila(db: Db, p: { perfilId?: string | null } = {}): Promise<ItemDaFila[]> {
  return db.query<ItemDaFila>(
    `select a.id as "acaoId", a.lead_id as "leadId", a.tipo, a.toque, a.origem,
            a.texto_gerado as "textoGerado", a.texto_final as "textoFinal", a.motivo_revisao as "motivoRevisao",
            a.criada_em as "criadaEm", pe.nome as pessoa, pe.cargo, pe.empresa, pf.nome as perfil, pf.id as "perfilId",
            l.estado as "estadoLead",
            entrada.texto as "ultimaEntrada", entrada.em as "ultimaEntradaEm",
            r.acao_sugerida as "acaoSugerida", r.motivo as "motivoDoAgente",
            r.estagio_sugerido as "estagioSugerido", coalesce(r.confianca, (t1.payload->>'confianca')::float8) as confianca,
            t1.payload->>'gancho' as gancho
       from public.acoes a
       join public.leads l on l.id = a.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = a.perfil_id
       left join public.rascunhos r on r.acao_id = a.id
       left join lateral (
         select payload from public.eventos e
          where e.entidade = 'acao' and e.entidade_id = a.id::text and e.tipo = 't1_personalizado'
          order by em desc limit 1
       ) t1 on true
       left join lateral (
         select texto, em from public.mensagens m
          where m.lead_id = a.lead_id and m.direcao = 'entrada'
          order by em desc limit 1
       ) entrada on true
      where a.status = 'aguardando_aprovacao' and ($1::uuid is null or a.perfil_id = $1::uuid)
      order by (a.toque is not null), coalesce(entrada.em, a.criada_em)
      limit 200`,
    [p.perfilId ?? null],
  );
}

export type TaxaDeEdicao = {
  perfilId: string;
  perfil: string;
  decididas: number;
  aprovadas: number;
  editadas: number;
  rejeitadas: number;
  /** (editadas + rejeitadas) / decididas; null sem decisões no período. */
  taxa: number | null;
};

/**
 * Taxa de edição por perfil (§7.1, decisão D6): dos rascunhos de conversa da
 * IA que um humano decidiu no período, quantos foram editados ou rejeitados. É
 * a métrica do gate do modo automático (SDR-17), que só automatiza a conversa:
 * o T1 personalizado (SDR-15) sempre passa por aprovação e fica de fora.
 */
export async function taxaDeEdicao(db: Db, p: { agora: Date; dias?: number }): Promise<TaxaDeEdicao[]> {
  const linhas = await db.query<Omit<TaxaDeEdicao, "taxa">>(
    `select pf.id as "perfilId", pf.nome as perfil,
            count(a.id)::int as decididas,
            count(a.id) filter (where a.decisao_humana = 'aprovada')::int as aprovadas,
            count(a.id) filter (where a.decisao_humana = 'editada')::int as editadas,
            count(a.id) filter (where a.decisao_humana = 'rejeitada')::int as rejeitadas
       from public.perfis pf
       left join public.acoes a
         on a.perfil_id = pf.id and a.origem = 'ia' and a.toque is null and a.decisao_humana is not null
        and a.decidida_em > $1::timestamptz - make_interval(days => $2::int)
      group by pf.id, pf.nome, pf.slug
      order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], pf.slug)`,
    [p.agora, p.dias ?? 14],
  );
  return linhas.map((linha) => ({
    ...linha,
    taxa: linha.decididas > 0 ? (linha.editadas + linha.rejeitadas) / linha.decididas : null,
  }));
}
