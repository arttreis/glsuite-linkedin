import { avaliarAceite, type ConviteParaAceite, type Taxa } from "@/domain/guardas";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { carregarPerfil, feriadosDaPraca } from "@/server/despachante/perfis";
import { pausarPerfil } from "@/server/perfis/pausa";

/**
 * Erro de limite do LinkedIn que se repete pausa o perfil (§4.4). Conta só o que
 * aconteceu depois do último "despausar": quem despausou já viu os anteriores.
 */
export async function avaliarErrosDeLimite(db: Db, perfilId: string, agora: Date): Promise<boolean> {
  const { erros_limite: regra } = await lerConfiguracao(db, "guardas");
  const [contagem] = await db.query<{ n: number }>(
    `select count(*)::int as n
       from public.eventos e join public.perfis p on p.id = e.perfil_id
      where e.perfil_id = $1::uuid and e.tipo = 'erro_limite'
        and e.em > $2::timestamptz - make_interval(hours => $3::int)
        and e.em > coalesce(p.despausado_em, '-infinity'::timestamptz)`,
    [perfilId, agora, regra.janela_horas],
  );
  if (contagem!.n < regra.quantidade) return false;
  return pausarPerfil(db, {
    perfilId,
    motivo: `Erro de limite do LinkedIn repetido (${contagem!.n} em ${regra.janela_horas} h).`,
    ator: "guardas",
    agora,
  });
}

/** Convites enviados desde a última ativação, com a data de aceite do lead. */
export async function convitesDesdeAtivacao(db: Db, perfilId: string, agora: Date): Promise<ConviteParaAceite[]> {
  const linhas = await db.query<{ enviada_em: Date; aceito_em: Date | null }>(
    `select a.enviada_em, l.aceito_em
       from public.acoes a
       join public.leads l on l.id = a.lead_id
       join public.perfis p on p.id = a.perfil_id
      where a.perfil_id = $1::uuid and a.tipo = 'convite' and a.status = 'enviada'
        and a.enviada_em > coalesce(p.despausado_em, p.ativado_em, '-infinity'::timestamptz)
        and a.enviada_em > $2::timestamptz - interval '60 days'`,
    [perfilId, agora],
  );
  return linhas.map((linha) => ({
    enviadaEm: new Date(linha.enviada_em),
    aceitoEm: linha.aceito_em ? new Date(linha.aceito_em) : null,
  }));
}

export type ResultadoDasGuardas = { perfilId: string; pausou: boolean; motivo?: string; aceite?: Taxa };

/**
 * Roda as regras de parada de um perfil ativo: erro de limite repetido, taxa de
 * aceite baixa e queda brusca de aceite. Desconexão, checkpoint e captcha
 * pausam na hora, pelo status da conta e pelos erros da Unipile.
 */
export async function avaliarGuardas(db: Db, perfilId: string, agora: Date): Promise<ResultadoDasGuardas> {
  const perfil = await carregarPerfil(db, perfilId);
  const [ativo] = await db.query("select 1 from public.perfis where id = $1::uuid and status = 'ativo'", [perfilId]);
  if (!perfil || !ativo) return { perfilId, pausou: false };

  if (await avaliarErrosDeLimite(db, perfilId, agora)) {
    return { perfilId, pausou: true, motivo: "erro de limite repetido" };
  }

  const guardas = await lerConfiguracao(db, "guardas");
  const veredito = avaliarAceite(await convitesDesdeAtivacao(db, perfilId, agora), guardas, {
    agora,
    fuso: perfil.fuso,
    feriados: await feriadosDaPraca(db, perfil.praca),
  });
  if (!veredito.pausar) return { perfilId, pausou: false, aceite: veredito.taxa };

  const pausou = await pausarPerfil(db, { perfilId, motivo: veredito.motivo, ator: "guardas", agora });
  return { perfilId, pausou, motivo: veredito.motivo, aceite: veredito.taxa };
}

export async function avaliarGuardasDeTodos(db: Db, agora: Date): Promise<ResultadoDasGuardas[]> {
  const ativos = await db.query<{ id: string }>("select id from public.perfis where status = 'ativo'");
  const resultados: ResultadoDasGuardas[] = [];
  for (const { id } of ativos) resultados.push(await avaliarGuardas(db, id, agora));
  return resultados;
}
