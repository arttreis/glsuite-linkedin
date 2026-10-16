import { descreverFiltros, type FiltrosDeBusca, type SituacaoNaBase } from "@/domain/busca";
import type { PessoaImportada } from "@/domain/importacao";
import { chaveDaEmpresa, primeiroNome } from "@/domain/texto";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { importarPessoas } from "@/server/importacao/importar";
import { STATUS_SAUDAVEIS } from "@/server/perfis/status-conta";
import type { ClienteUnipile, ResultadoDeBusca, TipoDeParametro } from "@/server/unipile/cliente";
import { classificarErro, ErroUnipile } from "@/server/unipile/erros";

export type Busca = { url: string } | { filtros: FiltrosDeBusca };

export type PessoaEncontrada = ResultadoDeBusca & { situacao: SituacaoNaBase };

export type PaginaDaBusca = {
  pessoas: PessoaEncontrada[];
  /** Para "carregar mais"; null quando a busca acabou. */
  cursor: string | null;
  /** Perfis trazidos pelo perfil nas últimas 24 horas, já com esta página, e o teto. */
  teto: { usados: number; maximo: number };
  /** A busca parou antes do pedido (teto ou erro no meio); o que veio até ali está em `pessoas`. */
  aviso: string | null;
};

/** Erro que a tela mostra como veio. */
export class ErroDaBusca extends Error {}

const JANELA_DO_TETO_MS = 24 * 3_600_000;

type ContaDaCampanha = { perfilId: string; perfil: string; accountId: string };

/** A busca usa a conta do perfil da campanha: só roda com ela conectada e saudável. */
async function contaDaCampanha(db: Db, campanhaId: string): Promise<ContaDaCampanha> {
  const [linha] = await db.query<{
    perfil_id: string;
    perfil: string;
    account_id: string | null;
    unipile_status: string | null;
    praca: string;
  }>(
    `select pf.id as perfil_id, pf.nome as perfil, pf.unipile_account_id as account_id, pf.unipile_status, pf.praca
       from public.campanhas c join public.perfis pf on pf.id = c.perfil_id
      where c.id = $1::uuid`,
    [campanhaId],
  );
  if (!linha) throw new ErroDaBusca("Campanha não encontrada.");
  if (!linha.account_id) throw new ErroDaBusca(`O perfil ${linha.perfil} não tem LinkedIn conectado. Conecte em Perfis.`);
  if (linha.unipile_status && !STATUS_SAUDAVEIS.has(linha.unipile_status)) {
    throw new ErroDaBusca(`A conta do LinkedIn de ${linha.perfil} precisa ser reconectada em Perfis antes de buscar.`);
  }
  // Ler e mostrar dados de pessoa já é tratamento: na Espanha, só com o DPA.
  if (linha.praca === "espanha" && !(await lerConfiguracao(db, "travas")).dpa_espanha) {
    throw new ErroDaBusca("Na Espanha, nenhum dado de pessoa pode ser lido antes de o DPA ser assinado.");
  }
  return { perfilId: linha.perfil_id, perfil: linha.perfil, accountId: linha.account_id };
}

async function perfisTrazidos(db: Db, perfilId: string, agora: Date): Promise<number> {
  const [linha] = await db.query<{ total: number }>(
    `select coalesce(sum((payload->>'quantidade')::int), 0)::int as total
       from public.eventos
      where tipo = 'busca_linkedin' and perfil_id = $1::uuid and em > $2::timestamptz`,
    [perfilId, new Date(agora.getTime() - JANELA_DO_TETO_MS)],
  );
  return linha?.total ?? 0;
}

function mensagemDoErro(erro: unknown, perfil: string): string {
  switch (classificarErro(erro)) {
    case "limite":
      return "O LinkedIn limitou a busca desta conta agora. Espere algumas horas antes de buscar de novo.";
    case "conta":
      return `A conta do LinkedIn de ${perfil} precisa de atenção (desconectada ou restrita). Veja em Perfis.`;
    case "transitorio":
      return "A busca não respondeu. Tente de novo em instantes.";
    case "permanente": {
      const detalhe = erro instanceof ErroUnipile ? (erro.detalhe ?? erro.message) : String(erro);
      return `O LinkedIn recusou a busca. Confira os filtros ou a URL. (${detalhe})`;
    }
  }
}

/**
 * Situação de cada pessoa na base, na ordem de prioridade: opt-out, já na
 * campanha, de outro perfil com lead vivo (§4.7), já na base, nova. Mesma
 * leitura da triagem (`motivoDeBloqueio`), em lote e só como aviso.
 */
export async function situacoesNaBase(
  db: Db,
  p: { campanhaId: string; perfilId: string; providerIds: string[] },
): Promise<Map<string, SituacaoNaBase>> {
  if (p.providerIds.length === 0) return new Map();
  const linhas = await db.query<{
    provider_id: string;
    optout: boolean;
    na_base: boolean;
    na_campanha: boolean;
    outro_dono: string | null;
  }>(
    `select x.provider_id,
            coalesce(pe.optout_em is not null, false)
              or exists (select 1 from public.optouts o where o.provider_id = x.provider_id) as optout,
            pe.id is not null as na_base,
            exists (select 1 from public.leads l where l.pessoa_id = pe.id and l.campanha_id = $2::uuid) as na_campanha,
            (select pf.nome
               from public.leads l join public.perfis pf on pf.id = l.perfil_id
              where l.pessoa_id = pe.id and l.perfil_id = pe.dono_perfil_id and pe.dono_perfil_id <> $3::uuid
                and l.estado <> 'rejeitado'
                and not (l.estado = 'triagem' and l.bloqueio_motivo is not null)
              limit 1) as outro_dono
       from unnest($1::text[]) as x(provider_id)
       left join public.pessoas pe on pe.provider_id = x.provider_id`,
    [p.providerIds, p.campanhaId, p.perfilId],
  );
  return new Map(
    linhas.map((linha): [string, SituacaoNaBase] => {
      if (linha.optout) return [linha.provider_id, { tipo: "optout" }];
      if (linha.na_campanha) return [linha.provider_id, { tipo: "na_campanha" }];
      if (linha.outro_dono) return [linha.provider_id, { tipo: "de_outro_perfil", perfil: linha.outro_dono }];
      if (linha.na_base) return [linha.provider_id, { tipo: "na_base" }];
      return [linha.provider_id, { tipo: "nova" }];
    }),
  );
}

/**
 * Busca pessoas no LinkedIn para a prévia (§4.11). Nada é gravado sobre as
 * pessoas aqui: só o evento `busca_linkedin`, que conta para o teto do perfil.
 * Puxa páginas até juntar `quantidade` pessoas, a busca acabar ou o teto
 * chegar. O teto é conferido antes de cada página, então pode passar em até
 * uma página.
 *
 * Roda com a conexão do sistema porque a situação cruza perfis. Quem chama
 * autoriza o operador na campanha antes.
 */
export async function buscarLeads(
  deps: { db: Db; unipile: ClienteUnipile },
  p: { campanhaId: string; busca: Busca; cursor?: string | null; quantidade: number; operadorId: string; agora: Date },
): Promise<PaginaDaBusca> {
  const { db, unipile } = deps;
  const conta = await contaDaCampanha(db, p.campanhaId);
  const { max_perfis_por_dia: maximo } = await lerConfiguracao(db, "busca");
  if (maximo === 0) throw new ErroDaBusca("A busca de leads está desligada nas configurações.");
  let usados = await perfisTrazidos(db, conta.perfilId, p.agora);
  if (usados >= maximo) {
    throw new ErroDaBusca(
      `O perfil ${conta.perfil} já trouxe ${usados} pessoas pela busca nas últimas 24 horas, e o teto é ${maximo}. Tente de novo mais tarde.`,
    );
  }

  const origem = "url" in p.busca ? { url: p.busca.url } : { filtros: descreverFiltros(p.busca.filtros) };
  const encontrados = new Map<string, ResultadoDeBusca>();
  let cursor: string | null = p.cursor ?? null;
  let aviso: string | null = null;
  do {
    let pagina: Awaited<ReturnType<ClienteUnipile["buscarPessoas"]>>;
    try {
      pagina = await unipile.buscarPessoas(conta.accountId, p.busca, cursor ?? undefined);
    } catch (erro) {
      // Erro na primeira página é da busca; depois, devolve o que já veio.
      if (encontrados.size === 0) throw new ErroDaBusca(mensagemDoErro(erro, conta.perfil));
      aviso = mensagemDoErro(erro, conta.perfil);
      break;
    }
    usados += pagina.itens.length;
    await registrarEvento(db, {
      tipo: "busca_linkedin",
      entidade: "campanha",
      entidadeId: p.campanhaId,
      perfilId: conta.perfilId,
      payload: { quantidade: pagina.itens.length, ...origem },
      ator: p.operadorId,
      em: p.agora,
    });
    for (const item of pagina.itens) encontrados.set(item.providerId, item);
    // Página vazia com cursor não anda: trata como fim.
    cursor = pagina.itens.length > 0 ? pagina.cursor : null;
  } while (cursor && encontrados.size < p.quantidade && usados < maximo);

  if (!aviso && cursor && usados >= maximo) {
    aviso = `O perfil ${conta.perfil} chegou ao teto de ${maximo} pessoas buscadas em 24 horas. A busca continua mais tarde.`;
  }

  const situacoes = await situacoesNaBase(db, {
    campanhaId: p.campanhaId,
    perfilId: conta.perfilId,
    providerIds: [...encontrados.keys()],
  });
  return {
    pessoas: [...encontrados.values()].map((item) => ({
      ...item,
      situacao: situacoes.get(item.providerId) ?? { tipo: "nova" },
    })),
    cursor,
    teto: { usados, maximo },
    aviso,
  };
}

/** Sugestões de local ou setor para o filtro. Falha vira lista vazia: é só autocompletar. */
export async function sugerirParametros(
  deps: { db: Db; unipile: ClienteUnipile },
  p: { campanhaId: string; tipo: TipoDeParametro; texto: string },
) {
  const conta = await contaDaCampanha(deps.db, p.campanhaId);
  try {
    return await deps.unipile.buscarParametros(conta.accountId, p.tipo, p.texto);
  } catch {
    return [];
  }
}

export function pessoaDaBusca(item: ResultadoDeBusca): PessoaImportada {
  const nome = item.nome ?? [item.primeiroNome, item.sobrenome].filter(Boolean).join(" ");
  return {
    providerId: item.providerId,
    publicIdentifier: item.publicIdentifier,
    urlPublica:
      item.urlPublica?.split("?")[0] ?? `https://www.linkedin.com/in/${item.publicIdentifier ?? item.providerId}`,
    nome: nome || "Sem nome",
    primeiroNome: primeiroNome(nome, item.primeiroNome),
    cargo: item.cargoAtual ?? item.titulo,
    empresa: item.empresaAtual,
    empresaDominio: null,
    empresaChave: chaveDaEmpresa(item.empresaAtual),
    localizacao: item.localizacao,
    coletadoEm: null,
  };
}

/**
 * Leva para a triagem só quem o operador selecionou na prévia, pelas mesmas
 * regras da importação (opt-out, um dono, régua anterior, cooldown).
 */
export async function importarSelecionados(
  deps: { db: Db; unipile?: ClienteUnipile },
  p: { campanhaId: string; selecionados: ResultadoDeBusca[]; descricao: string; operadorId: string; agora: Date },
) {
  return importarPessoas(deps, {
    campanhaId: p.campanhaId,
    fonte: "unipile_busca",
    pessoas: p.selecionados.map(pessoaDaBusca),
    arquivoNome: p.descricao,
    operadorId: p.operadorId,
    agora: p.agora,
  });
}
