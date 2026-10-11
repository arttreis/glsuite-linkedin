import type { EstadoDoLead } from "@/domain/estados";
import { COLUNAS_DO_PIPELINE } from "@/domain/pipeline";
import type { Db } from "@/server/db/tipos";

export type CartaoDoPipeline = {
  id: string;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  nota: number | null;
  estado: EstadoDoLead;
  conta: string;
  ultimaAtividade: Date;
};

export type ColunaComCartoes = { id: string; rotulo: string; total: number; cartoes: CartaoDoPipeline[] };

/** Cards por coluna; o total diz quantos há além desses. */
const POR_COLUNA = 60;

// O id da coluna sai do próprio domínio: os valores são constantes, não entrada.
const COLUNA_EM_SQL = `case ${COLUNAS_DO_PIPELINE.map(
  (coluna) => `when l.estado in (${coluna.estados.map((estado) => `'${estado}'`).join(", ")}) then '${coluna.id}'`,
).join(" ")} end`;

/**
 * O Pipeline (§4.10): os leads nas colunas, a última atividade primeiro.
 * Roda dentro de `comOperador`: só as contas que a pessoa opera, sem a conta
 * da casa. Filtra por campanha e por conta.
 */
export async function quadroDoPipeline(
  db: Db,
  p: { campanhaId?: string | null; perfilId?: string | null } = {},
): Promise<ColunaComCartoes[]> {
  const linhas = await db.query<CartaoDoPipeline & { coluna: string; total: number }>(
    `with cartoes as (
       select l.id, pe.nome, pe.cargo, pe.empresa, l.nota, l.estado, pf.nome as conta,
              ${COLUNA_EM_SQL} as coluna,
              greatest(l.criado_em, l.convite_enviado_em, l.aceito_em, l.ultimo_toque_em, l.respondeu_em,
                       (select max(m.em) from public.mensagens m where m.lead_id = l.id)) as "ultimaAtividade"
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.perfis pf on pf.id = l.perfil_id
        where not pf.casa
          and ($1::uuid is null or l.campanha_id = $1::uuid)
          and ($2::uuid is null or l.perfil_id = $2::uuid)
     ), numerados as (
       select c.*, row_number() over (partition by coluna order by "ultimaAtividade" desc, id) as posicao,
              count(*) over (partition by coluna)::int as total
         from cartoes c
        where coluna is not null
     )
     select id, nome, cargo, empresa, nota, estado, conta, coluna, "ultimaAtividade", total
       from numerados
      where posicao <= ${POR_COLUNA}
      order by "ultimaAtividade" desc, id`,
    [p.campanhaId ?? null, p.perfilId ?? null],
  );

  return COLUNAS_DO_PIPELINE.map((coluna) => {
    const daColuna = linhas.filter((linha) => linha.coluna === coluna.id);
    return {
      id: coluna.id,
      rotulo: coluna.rotulo,
      total: daColuna[0]?.total ?? 0,
      cartoes: daColuna.map((linha) => ({
        id: linha.id,
        nome: linha.nome,
        cargo: linha.cargo,
        empresa: linha.empresa,
        nota: linha.nota,
        estado: linha.estado,
        conta: linha.conta,
        ultimaAtividade: linha.ultimaAtividade,
      })),
    };
  });
}

/** As campanhas e as contas para os filtros. */
export async function filtrosDoPipeline(db: Db): Promise<{ campanhas: { id: string; nome: string }[]; contas: { id: string; nome: string }[] }> {
  return {
    campanhas: await db.query(
      `select c.id, c.nome from public.campanhas c join public.perfis pf on pf.id = c.perfil_id
        where not pf.casa order by c.nome`,
    ),
    contas: await db.query("select id, nome from public.perfis where not casa and public.pode_ver_perfil(id) order by nome"),
  };
}
