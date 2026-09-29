import { dataLocal, limitesDoDia, type Janela } from "@/domain/calendario";
import { calcularSaldo, limitesDaSemana, semanaDesdeAtivacao, type Contagem, type EtapaDaRampa } from "@/domain/rampa";
import type { Praca } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";

export type PerfilDoDespachante = {
  id: string;
  slug: string;
  nome: string;
  praca: Praca;
  fuso: string;
  janela: Janela;
  rampa: EtapaDaRampa[];
  teto_convites_semana: number;
  ativado_em: Date;
  proxima_acao_apos: Date | null;
  unipile_account_id: string;
  unipile_status: string | null;
  unipile_status_em: Date | null;
};

const COLUNAS = `id, slug, nome, praca, fuso, janela, rampa, teto_convites_semana, ativado_em,
                 proxima_acao_apos, unipile_account_id, unipile_status, unipile_status_em`;

export async function carregarPerfisAtivos(db: Db): Promise<PerfilDoDespachante[]> {
  return db.query<PerfilDoDespachante>(
    `select ${COLUNAS} from public.perfis
      where status = 'ativo' and unipile_account_id is not null
      order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], slug), slug`,
  );
}

export async function carregarPerfil(db: Db, perfilId: string): Promise<PerfilDoDespachante | null> {
  const [perfil] = await db.query<PerfilDoDespachante>(`select ${COLUNAS} from public.perfis where id = $1::uuid`, [perfilId]);
  return perfil ?? null;
}

export async function carregarFeriados(db: Db): Promise<Map<Praca, Set<string>>> {
  const linhas = await db.query<{ praca: Praca; data: string }>("select praca, data from public.feriados");
  const porPraca = new Map<Praca, Set<string>>();
  for (const { praca, data } of linhas) {
    if (!porPraca.has(praca)) porPraca.set(praca, new Set());
    porPraca.get(praca)!.add(data);
  }
  return porPraca;
}

export async function feriadosDaPraca(db: Db, praca: Praca): Promise<Set<string>> {
  const linhas = await db.query<{ data: string }>("select data from public.feriados where praca = $1", [praca]);
  return new Set(linhas.map((linha) => linha.data));
}

/**
 * O que o perfil já fez: convites e DMs de hoje (no fuso do perfil) e convites
 * dos últimos 7 dias. Ações em voo (`enviando`) contam como enviadas.
 */
export async function contarEnvios(db: Db, perfil: PerfilDoDespachante, agora: Date): Promise<Contagem> {
  const { inicio, fim } = limitesDoDia(agora, perfil.fuso);
  const [contagem] = await db.query<Contagem>(
    `select
       count(*) filter (where tipo = 'convite' and quando >= $2 and quando < $3)::int as "convitesHoje",
       count(*) filter (where tipo = 'dm' and quando >= $2 and quando < $3)::int as "dmsHoje",
       count(*) filter (where tipo = 'convite' and quando > $4)::int as "convitesUltimos7Dias"
       from (
         select tipo, coalesce(enviada_em, atualizada_em) as quando
           from public.acoes
          where perfil_id = $1::uuid and status in ('enviada', 'enviando') and tipo in ('convite', 'dm')
       ) envios`,
    [perfil.id, inicio, fim, new Date(agora.getTime() - 7 * 86_400_000)],
  );
  return contagem!;
}

export function saldoDoPerfil(perfil: PerfilDoDespachante, contagem: Contagem, agora: Date) {
  const semana = semanaDesdeAtivacao(dataLocal(perfil.ativado_em, perfil.fuso), dataLocal(agora, perfil.fuso));
  return calcularSaldo(limitesDaSemana(perfil.rampa, semana), perfil.teto_convites_semana, contagem);
}
