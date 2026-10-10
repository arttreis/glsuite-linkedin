import type { Praca } from "@/domain/validador";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";

/**
 * Funil por perfil × campanha × ângulo (§9 SDR-14). Tudo sai contado de
 * `acoes`, `mensagens` e `eventos`: os números batem com as tabelas.
 *
 * - toques: T1 a T4 que saíram (convite, DM da régua, tarefa manual feita);
 * - convites: convites enviados;
 * - aceites: convidados com aceite registrado;
 * - respostas: leads com ao menos uma mensagem da pessoa;
 * - conversas: leads que chegaram a `em_conversa` (opt-out direto não conta);
 * - qualificados e reuniões: marcados pelo humano.
 */
export type Contagens = {
  toques: number;
  convites: number;
  aceites: number;
  respostas: number;
  conversas: number;
  qualificados: number;
  reunioes: number;
};

export type LinhaDoFunil = Contagens & {
  chave: string;
  perfil: string;
  praca: Praca;
  campanha: string | null;
  angulo: string | null;
  variante: string | null;
  /** O público da campanha (§4.12); null em campanha criada à mão. */
  publico: string | null;
  taxaAceite: number | null;
  taxaRespostaSobreAceite: number | null;
  /** Marco de leitura: só mostra taxa com toques suficientes (default 100). */
  comAmostra: boolean;
};

export type Funil = {
  /** A visão que testa a hipótese do público (§4.12). */
  porPublico: LinhaDoFunil[];
  porCampanha: LinhaDoFunil[];
  porAngulo: LinhaDoFunil[];
  porPerfil: LinhaDoFunil[];
  porVariante: LinhaDoFunil[];
  leituraMinima: number;
};

type Base = Contagens & {
  perfil: string;
  praca: Praca;
  campanha_id: string;
  campanha: string;
  angulo: string | null;
  variante: string;
  publico: string | null;
};

const ZERO: Contagens = { toques: 0, convites: 0, aceites: 0, respostas: 0, conversas: 0, qualificados: 0, reunioes: 0 };

function somar(a: Contagens, b: Contagens): Contagens {
  return {
    toques: a.toques + b.toques,
    convites: a.convites + b.convites,
    aceites: a.aceites + b.aceites,
    respostas: a.respostas + b.respostas,
    conversas: a.conversas + b.conversas,
    qualificados: a.qualificados + b.qualificados,
    reunioes: a.reunioes + b.reunioes,
  };
}

function linha(
  chave: string,
  rotulos: Pick<LinhaDoFunil, "perfil" | "praca" | "campanha" | "angulo" | "variante" | "publico">,
  c: Contagens,
  leituraMinima: number,
): LinhaDoFunil {
  const comAmostra = c.toques >= leituraMinima;
  return {
    chave,
    ...rotulos,
    ...c,
    taxaAceite: comAmostra && c.convites > 0 ? c.aceites / c.convites : null,
    taxaRespostaSobreAceite: comAmostra && c.aceites > 0 ? c.respostas / c.aceites : null,
    comAmostra,
  };
}

function agrupar(bases: Base[], chaveDe: (b: Base) => string, rotulosDe: (b: Base) => Parameters<typeof linha>[1], leituraMinima: number) {
  const grupos = new Map<string, { rotulos: Parameters<typeof linha>[1]; contagens: Contagens }>();
  for (const base of bases) {
    const chave = chaveDe(base);
    const atual = grupos.get(chave) ?? { rotulos: rotulosDe(base), contagens: ZERO };
    grupos.set(chave, { rotulos: atual.rotulos, contagens: somar(atual.contagens, base) });
  }
  return [...grupos.entries()].map(([chave, g]) => linha(chave, g.rotulos, g.contagens, leituraMinima));
}

export async function calcularFunil(db: Db, p: { perfilId?: string | null; publicoId?: string | null } = {}): Promise<Funil> {
  const leituraMinima = await lerConfiguracao(db, "leitura_minima_toques");
  const bases = await db.query<Base>(
    `with por_lead as (
       select l.id, l.perfil_id, l.campanha_id, l.angulo, coalesce(l.variante_copy, 'template') as variante,
              (select count(*) from public.acoes a
                where a.lead_id = l.id and a.status = 'enviada' and a.toque is not null)::int as toques,
              exists (select 1 from public.acoes a where a.lead_id = l.id and a.tipo = 'convite' and a.status = 'enviada') as convidado,
              l.aceito_em is not null as aceitou,
              exists (select 1 from public.mensagens m where m.lead_id = l.id and m.direcao = 'entrada') as respondeu,
              exists (select 1 from public.eventos e
                       where e.entidade = 'lead' and e.entidade_id = l.id::text and e.tipo = 'lead_transicao'
                         and e.payload ->> 'para' = 'em_conversa') as conversou,
              (l.estado in ('qualificado', 'reuniao_marcada') or exists (
                 select 1 from public.eventos e
                  where e.entidade = 'lead' and e.entidade_id = l.id::text and e.tipo = 'lead_transicao'
                    and e.payload ->> 'para' = 'qualificado')) as qualificou,
              (l.reuniao_em is not null or l.estado = 'reuniao_marcada') as reuniu
         from public.leads l
        where l.estado not in ('triagem', 'rejeitado') and ($1::uuid is null or l.perfil_id = $1::uuid)
          and ($2::uuid is null or l.campanha_id in (select id from public.campanhas where publico_id = $2::uuid))
     )
     select pf.nome as perfil, pf.praca, c.id as campanha_id, c.nome as campanha, pl.angulo, pl.variante, pu.nome as publico,
            sum(pl.toques)::int as toques,
            count(*) filter (where pl.convidado)::int as convites,
            count(*) filter (where pl.convidado and pl.aceitou)::int as aceites,
            count(*) filter (where pl.respondeu)::int as respostas,
            count(*) filter (where pl.conversou)::int as conversas,
            count(*) filter (where pl.qualificou)::int as qualificados,
            count(*) filter (where pl.reuniu)::int as reunioes
       from por_lead pl
       join public.perfis pf on pf.id = pl.perfil_id
       join public.campanhas c on c.id = pl.campanha_id
       left join public.publicos pu on pu.id = c.publico_id
      group by pf.nome, pf.praca, pf.slug, c.id, c.nome, pl.angulo, pl.variante, pu.nome
      order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], pf.slug), c.nome, pl.angulo, pl.variante`,
    [p.perfilId ?? null, p.publicoId ?? null],
  );

  return {
    leituraMinima,
    porPublico: agrupar(
      bases.filter((b) => b.publico !== null),
      (b) => b.publico!,
      (b) => ({ perfil: "todos", praca: b.praca, campanha: null, angulo: null, variante: null, publico: b.publico }),
      leituraMinima,
    ),
    porCampanha: agrupar(
      bases,
      (b) => `${b.campanha_id}|${b.angulo}|${b.variante}`,
      (b) => ({ perfil: b.perfil, praca: b.praca, campanha: b.campanha, angulo: b.angulo, variante: b.variante, publico: b.publico }),
      leituraMinima,
    ),
    porAngulo: agrupar(
      bases,
      (b) => b.angulo ?? "sem ângulo",
      (b) => ({ perfil: "todos", praca: b.praca, campanha: null, angulo: b.angulo, variante: null, publico: null }),
      leituraMinima,
    ),
    porPerfil: agrupar(
      bases,
      (b) => b.perfil,
      (b) => ({ perfil: b.perfil, praca: b.praca, campanha: null, angulo: null, variante: null, publico: null }),
      leituraMinima,
    ),
    porVariante: agrupar(
      bases,
      (b) => `${b.campanha_id}|${b.variante}`,
      (b) => ({ perfil: b.perfil, praca: b.praca, campanha: b.campanha, angulo: null, variante: b.variante, publico: null }),
      leituraMinima,
    ),
  };
}

/** Referência de trabalho (§9 SDR-14). A casa ainda não tem linha de base: o sistema cria a primeira. */
export function referencia(praca: Praca) {
  return {
    aceite: { minimo: 0.25, maximo: 0.35 },
    respostaSobreAceite: praca === "espanha" ? { minimo: 0.15, maximo: 0.25 } : { minimo: 0.1, maximo: 0.15 },
  };
}
