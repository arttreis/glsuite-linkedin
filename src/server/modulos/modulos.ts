import { MODULOS, NOME_DO_MODULO, type Modulo } from "@/domain/modulos";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { pausarPerfil } from "@/server/perfis/pausa";
import type { Resultado } from "@/server/publicos/publicos";

/** Recusa de uma ação do servidor de módulo que a organização não contratou (§4.14). */
export class ModuloNaoContratado extends Error {
  constructor(readonly modulo: Modulo) {
    super(`O módulo ${NOME_DO_MODULO[modulo]} não está no plano da sua organização.`);
  }
}

/** Os módulos ligados da organização, na ordem do catálogo. Roda como o operador ou pela conexão do sistema. */
export async function modulosDaOrganizacao(db: Db, organizacaoId: string): Promise<Modulo[]> {
  const linhas = await db.query<{ modulo: string }>(
    "select modulo from public.modulos_da_organizacao where organizacao_id = $1::uuid and ativo",
    [organizacaoId],
  );
  const ligados = new Set(linhas.map((linha) => linha.modulo));
  return MODULOS.filter((modulo) => ligados.has(modulo));
}

export type SituacaoDoModulo = {
  modulo: Modulo;
  ativo: boolean;
  /** Quando ligou pela última vez. */
  desde: Date | null;
  motivo: string | null;
  alteradoEm: Date | null;
  alteradoPor: string | null;
};

const COLUNAS_DA_SITUACAO = `modulo, ativo, desde, motivo, alterado_em as "alteradoEm", alterado_por as "alteradoPor"`;

/** Cada módulo do catálogo na ordem dele; o que nunca foi contratado aparece desligado. */
function noCatalogo(linhas: readonly SituacaoDoModulo[]): SituacaoDoModulo[] {
  return MODULOS.map((modulo) => {
    const linha = linhas.find((l) => l.modulo === modulo);
    return linha
      ? { modulo, ativo: linha.ativo, desde: linha.desde, motivo: linha.motivo, alteradoEm: linha.alteradoEm, alteradoPor: linha.alteradoPor }
      : { modulo, ativo: false, desde: null, motivo: null, alteradoEm: null, alteradoPor: null };
  });
}

/** Cada módulo do catálogo, contratado ou não, para o Plano e a Plataforma. */
export async function situacaoDosModulos(db: Db, organizacaoId: string): Promise<SituacaoDoModulo[]> {
  const linhas = await db.query<SituacaoDoModulo>(
    `select ${COLUNAS_DA_SITUACAO} from public.modulos_da_organizacao where organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  return noCatalogo(linhas);
}

export type MudancaDeModulo = {
  organizacaoId: string;
  modulo: Modulo;
  ativo: boolean;
  motivo: string | null;
  /** E-mail de quem é da plataforma. */
  por: string;
  agora: Date;
};

/**
 * Liga ou desliga um módulo da organização (§4.14). Só a Plataforma chama,
 * com a conexão do sistema, depois de conferir `PLATAFORMA_ADMINS`. Pedir o
 * estado em que o módulo já está não muda nada nem grava evento.
 *
 * Desligar o SDR no LinkedIn pausa as contas ativas da organização, com o
 * motivo e o alerta de sempre; religar não despausa (despausar é manual,
 * §4.13).
 */
export async function alterarModulo(db: Db, p: MudancaDeModulo): Promise<Resultado<{ mudou: boolean; contasPausadas: number }>> {
  if (!p.motivo) return { ok: false, erro: "Diga o motivo: ele fica na trilha da organização." };
  return db.transacao(async (tx) => {
    const [organizacao] = await tx.query<{ id: string }>("select id from public.organizacoes where id = $1::uuid for update", [p.organizacaoId]);
    if (!organizacao) return { ok: false, erro: "Organização não encontrada." };

    const [atual] = await tx.query<{ ativo: boolean }>(
      "select ativo from public.modulos_da_organizacao where organizacao_id = $1::uuid and modulo = $2",
      [p.organizacaoId, p.modulo],
    );
    if ((atual?.ativo ?? false) === p.ativo) return { ok: true, mudou: false, contasPausadas: 0 };

    await tx.query(
      `insert into public.modulos_da_organizacao (organizacao_id, modulo, ativo, desde, motivo, alterado_em, alterado_por)
       values ($1::uuid, $2, $3, $4, $5, $4, $6)
       on conflict (organizacao_id, modulo) do update
         set ativo = excluded.ativo,
             desde = case when excluded.ativo then excluded.desde else public.modulos_da_organizacao.desde end,
             motivo = excluded.motivo, alterado_em = excluded.alterado_em, alterado_por = excluded.alterado_por`,
      [p.organizacaoId, p.modulo, p.ativo, p.agora, p.motivo, p.por],
    );
    await registrarEvento(tx, {
      tipo: p.ativo ? "modulo_ligado" : "modulo_desligado",
      entidade: "organizacao",
      entidadeId: p.organizacaoId,
      payload: { modulo: p.modulo, motivo: p.motivo },
      ator: p.por,
      em: p.agora,
    });

    let contasPausadas = 0;
    if (!p.ativo && p.modulo === "linkedin") {
      const ativas = await tx.query<{ id: string }>(
        "select id from public.perfis where organizacao_id = $1::uuid and status = 'ativo' and not casa",
        [p.organizacaoId],
      );
      for (const perfil of ativas) {
        const pausou = await pausarPerfil(tx, {
          perfilId: perfil.id,
          motivo: `O módulo ${NOME_DO_MODULO.linkedin} foi desligado: ${p.motivo}`,
          ator: p.por,
          agora: p.agora,
        });
        if (pausou) contasPausadas += 1;
      }
    }
    return { ok: true, mudou: true, contasPausadas };
  });
}

export type UsoDoMes = {
  /** Contas do LinkedIn vinculadas (sem a conta da casa). */
  contasDoLinkedin: number;
  convites: number;
  mensagensDoLinkedin: number;
};

/**
 * O uso da organização no mês corrente, no horário de Brasília (§4.14). Conta
 * a organização inteira, não só as contas que o operador opera: é o que o
 * plano dela consome. Roda pela conexão do sistema.
 */
export async function usoDoMes(db: Db, p: { organizacaoId: string; agora: Date }): Promise<UsoDoMes> {
  const [uso] = await db.query<UsoDoMes>(
    `with mes as (
       select date_trunc('month', $2::timestamptz at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as inicio
     ), contas as (
       select id from public.perfis where organizacao_id = $1::uuid and not casa
     )
     select
       (select count(*)::int from public.perfis where organizacao_id = $1::uuid and not casa and unipile_account_id is not null) as "contasDoLinkedin",
       (select count(*)::int from public.acoes a, mes
         where a.perfil_id in (select id from contas) and a.status = 'enviada' and a.tipo = 'convite'
           and a.enviada_em >= mes.inicio and a.enviada_em < $2::timestamptz) as convites,
       (select count(*)::int from public.mensagens m, mes
         where m.perfil_id in (select id from contas) and m.direcao = 'saida'
           and m.em >= mes.inicio and m.em < $2::timestamptz) as "mensagensDoLinkedin"`,
    [p.organizacaoId, p.agora],
  );
  return uso!;
}

export type OrganizacaoNaPlataforma = {
  id: string;
  nome: string;
  slug: string;
  criadoEm: Date;
  primeiroAcessoEm: Date | null;
  admins: string[];
  operadores: number;
  contasDoLinkedin: number;
  modulos: SituacaoDoModulo[];
};

/** Todas as organizações, para a Plataforma (§4.14). Só pela conexão do sistema. */
export async function organizacoesNaPlataforma(db: Db): Promise<OrganizacaoNaPlataforma[]> {
  const organizacoes = await db.query<Omit<OrganizacaoNaPlataforma, "modulos">>(
    `select g.id, g.nome, g.slug, g.criado_em as "criadoEm", g.primeiro_acesso_em as "primeiroAcessoEm",
            coalesce(array(select o.email from public.operadores o
                            where o.organizacao_id = g.id and o.ativo and o.papel = 'admin' order by o.email), '{}') as admins,
            (select count(*)::int from public.operadores o where o.organizacao_id = g.id and o.ativo) as operadores,
            (select count(*)::int from public.perfis p
              where p.organizacao_id = g.id and not p.casa and p.unipile_account_id is not null) as "contasDoLinkedin"
       from public.organizacoes g
      order by g.criado_em`,
  );
  const modulos = await db.query<SituacaoDoModulo & { organizacaoId: string }>(
    `select organizacao_id as "organizacaoId", ${COLUNAS_DA_SITUACAO} from public.modulos_da_organizacao`,
  );
  return organizacoes.map((organizacao) => ({
    ...organizacao,
    modulos: noCatalogo(modulos.filter((linha) => linha.organizacaoId === organizacao.id)),
  }));
}
