import { STATUS_SAUDAVEIS } from "@/domain/conta";
import {
  classificarProcura,
  empresasUnicas,
  EMPRESAS_POR_INSERT,
  MAX_NOME_DA_LISTA,
  PROCURAS_POR_LEVA,
  type EmpresaDaBusca,
  type EmpresaLida,
  type OpcaoDeEmpresa,
  type SituacaoDaEmpresa,
} from "@/domain/lista-de-empresas";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import type { Resultado } from "@/server/publicos/publicos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { chaveRecusada, classificarErro, PECA_A_CHAVE } from "@/server/unipile/erros";

export type ResumoDaLista = {
  id: string;
  nome: string;
  total: number;
  achadas: number;
  semPagina: number;
  escolher: number;
  aProcurar: number;
  atualizadaEm: Date;
};

export type EmpresaDaLista = {
  id: string;
  nome: string;
  situacao: SituacaoDaEmpresa;
  linkedinId: string | null;
  linkedinNome: string | null;
  opcoes: OpcaoDeEmpresa[];
};

export type ListaDeEmpresas = {
  id: string;
  nome: string;
  /** Quantas empresas há em cada situação. */
  contagem: Record<SituacaoDaEmpresa, number>;
  /** As empresas, até `EMPRESAS_NA_TELA` de cada situação: lista grande não trava a tela. */
  empresas: EmpresaDaLista[];
  /** Campanhas que o operador enxerga com esta lista no filtro da busca. */
  campanhas: { id: string; nome: string }[];
};

/** Empresas de cada situação que a tela da lista mostra. */
export const EMPRESAS_NA_TELA = 300;

/** As listas da organização com quantas empresas há em cada situação. Roda como o operador (RLS). */
export async function listarListas(db: Db, organizacaoId: string): Promise<ResumoDaLista[]> {
  return db.query<ResumoDaLista>(
    `select l.id, l.nome, l.atualizado_em as "atualizadaEm",
            count(e.id)::int as total,
            (count(e.id) filter (where e.situacao = 'achada'))::int as achadas,
            (count(e.id) filter (where e.situacao = 'sem_pagina'))::int as "semPagina",
            (count(e.id) filter (where e.situacao = 'escolher'))::int as escolher,
            (count(e.id) filter (where e.situacao = 'a_procurar'))::int as "aProcurar"
       from public.listas_de_empresas l left join public.empresas_da_lista e on e.lista_id = l.id
      where l.organizacao_id = $1::uuid
      group by l.id
      order by l.nome, l.criado_em`,
    [organizacaoId],
  );
}

/** A lista com as empresas, em ordem alfabética. Roda como o operador (RLS): de outra organização, null. */
export async function obterLista(db: Db, id: string): Promise<ListaDeEmpresas | null> {
  const [lista] = await db.query<{ id: string; nome: string }>("select id, nome from public.listas_de_empresas where id = $1::uuid", [id]);
  if (!lista) return null;
  const contagem: Record<SituacaoDaEmpresa, number> = { a_procurar: 0, achada: 0, escolher: 0, sem_pagina: 0 };
  const porSituacao = await db.query<{ situacao: SituacaoDaEmpresa; n: number }>(
    "select situacao, count(*)::int as n from public.empresas_da_lista where lista_id = $1::uuid group by situacao",
    [id],
  );
  for (const linha of porSituacao) contagem[linha.situacao] = linha.n;
  const empresas = await db.query<EmpresaDaLista>(
    `select id, nome, situacao, "linkedinId", "linkedinNome", opcoes from (
       select id, nome, situacao, chave, linkedin_id as "linkedinId", linkedin_nome as "linkedinNome", opcoes,
              row_number() over (partition by situacao order by chave) as ordem
         from public.empresas_da_lista where lista_id = $1::uuid
     ) e where ordem <= $2 order by chave`,
    [id, EMPRESAS_NA_TELA],
  );
  const campanhas = await db.query<{ id: string; nome: string }>(
    "select id, nome from public.campanhas where busca -> 'lista' ->> 'id' = $1 order by nome",
    [id],
  );
  return { ...lista, contagem, empresas, campanhas };
}

/**
 * As empresas da lista como a busca usa (§4.11), só se a lista é da
 * organização. Lista apagada ou de outra organização: null.
 */
export async function empresasParaBusca(db: Db, p: { listaId: string; organizacaoId: string }): Promise<EmpresaDaBusca[] | null> {
  const [lista] = await db.query<{ id: string }>(
    "select id from public.listas_de_empresas where id = $1::uuid and organizacao_id = $2::uuid",
    [p.listaId, p.organizacaoId],
  );
  if (!lista) return null;
  return db.query<EmpresaDaBusca>(
    `select nome, chave, situacao, linkedin_id as "linkedinId" from public.empresas_da_lista where lista_id = $1::uuid`,
    [p.listaId],
  );
}

const nomeDaLista = (nome: unknown) => (typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "");

const tocar = (db: Db, listaId: string, agora: Date) =>
  db.query("update public.listas_de_empresas set atualizado_em = $2 where id = $1::uuid", [listaId, agora]);

const SEM_NOMES = "Nenhum nome de empresa encontrado. Cole um nome por linha ou suba um CSV com a coluna das empresas.";

/**
 * Insere as empresas em blocos (nem uma consulta por empresa, nem um insert
 * gigante). A chave única da lista descarta as que já estão nela. Devolve
 * quantas entraram de fato.
 */
async function inserirEmpresas(db: Db, p: { listaId: string; empresas: readonly EmpresaLida[]; agora: Date }): Promise<number> {
  let inseridas = 0;
  for (let inicio = 0; inicio < p.empresas.length; inicio += EMPRESAS_POR_INSERT) {
    const bloco = p.empresas.slice(inicio, inicio + EMPRESAS_POR_INSERT);
    const linhas = await db.query(
      `insert into public.empresas_da_lista (lista_id, nome, chave, criado_em)
       select $1::uuid, e.nome, e.chave, $3 from jsonb_to_recordset($2::jsonb) as e(nome text, chave text)
       on conflict (lista_id, chave) do nothing
       returning id`,
      [p.listaId, JSON.stringify(bloco), p.agora],
    );
    inseridas += linhas.length;
  }
  if (inseridas > 0) await tocar(db, p.listaId, p.agora);
  return inseridas;
}

/** Cria a lista com os nomes colados ou do arquivo. Repetidas entram uma vez; não há teto de empresas. Roda como o operador. */
export async function criarLista(
  db: Db,
  p: { organizacaoId: string; nome: unknown; nomes: readonly string[]; operadorId: string; agora: Date },
): Promise<Resultado<{ id: string; adicionadas: number; repetidas: number }>> {
  const nome = nomeDaLista(p.nome);
  if (!nome || nome.length > MAX_NOME_DA_LISTA) return { ok: false, erro: `Dê um nome à lista, de até ${MAX_NOME_DA_LISTA} caracteres.` };
  const { empresas, repetidas } = empresasUnicas(p.nomes);
  if (empresas.length === 0) return { ok: false, erro: SEM_NOMES };
  return db.transacao(async (tx) => {
    const [lista] = await tx.query<{ id: string }>(
      `insert into public.listas_de_empresas (organizacao_id, nome, criado_por, criado_em, atualizado_em)
       values ($1::uuid, $2, $3::uuid, $4, $4) returning id`,
      [p.organizacaoId, nome, p.operadorId, p.agora],
    );
    const adicionadas = await inserirEmpresas(tx, { listaId: lista!.id, empresas, agora: p.agora });
    return { ok: true as const, id: lista!.id, adicionadas, repetidas };
  });
}

/** Põe mais empresas na lista; as que já estão aparecem como repetidas. Roda como o operador. */
export async function adicionarEmpresas(
  db: Db,
  p: { listaId: string; nomes: readonly string[]; agora: Date },
): Promise<Resultado<{ adicionadas: number; repetidas: number }>> {
  const [lista] = await db.query<{ id: string }>("select id from public.listas_de_empresas where id = $1::uuid", [p.listaId]);
  if (!lista) return { ok: false, erro: "Lista não encontrada." };
  const { empresas, repetidas } = empresasUnicas(p.nomes);
  if (empresas.length === 0) return { ok: false, erro: SEM_NOMES };
  const adicionadas = await inserirEmpresas(db, { listaId: p.listaId, empresas, agora: p.agora });
  return { ok: true, adicionadas, repetidas: repetidas + (empresas.length - adicionadas) };
}

export async function renomearLista(db: Db, p: { listaId: string; nome: unknown; agora: Date }): Promise<Resultado> {
  const nome = nomeDaLista(p.nome);
  if (!nome || nome.length > MAX_NOME_DA_LISTA) return { ok: false, erro: `Dê um nome à lista, de até ${MAX_NOME_DA_LISTA} caracteres.` };
  const linhas = await db.query("update public.listas_de_empresas set nome = $2, atualizado_em = $3 where id = $1::uuid returning id", [
    p.listaId,
    nome,
    p.agora,
  ]);
  return linhas.length > 0 ? { ok: true } : { ok: false, erro: "Lista não encontrada." };
}

/** Apaga a lista e as empresas dela. A busca que a usava passa a pedir outra lista. Roda como o operador. */
export async function apagarLista(db: Db, p: { listaId: string }): Promise<Resultado> {
  const linhas = await db.query("delete from public.listas_de_empresas where id = $1::uuid returning id", [p.listaId]);
  return linhas.length > 0 ? { ok: true } : { ok: false, erro: "Lista não encontrada." };
}

export async function removerEmpresa(db: Db, p: { empresaId: string; agora: Date }): Promise<Resultado> {
  const [removida] = await db.query<{ lista_id: string }>("delete from public.empresas_da_lista where id = $1::uuid returning lista_id", [
    p.empresaId,
  ]);
  if (!removida) return { ok: false, erro: "Empresa não encontrada." };
  await tocar(db, removida.lista_id, p.agora);
  return { ok: true };
}

/**
 * O humano escolhe qual página do LinkedIn é a empresa, entre as opções da
 * procura, ou "nenhuma destas" (`opcaoId` null): aí a busca vai pelo nome.
 * Roda como o operador.
 */
export async function escolherEmpresa(db: Db, p: { empresaId: string; opcaoId: string | null; agora: Date }): Promise<Resultado> {
  const [empresa] = await db.query<{ lista_id: string; opcoes: OpcaoDeEmpresa[] }>(
    "select lista_id, opcoes from public.empresas_da_lista where id = $1::uuid",
    [p.empresaId],
  );
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  const opcao = p.opcaoId === null ? null : empresa.opcoes.find((o) => o.id === p.opcaoId);
  if (opcao === undefined) return { ok: false, erro: "Essa página não está entre as opções desta empresa." };
  await db.query(
    `update public.empresas_da_lista set situacao = $2, linkedin_id = $3, linkedin_nome = $4 where id = $1::uuid`,
    [p.empresaId, opcao ? "achada" : "sem_pagina", opcao?.id ?? null, opcao?.nome ?? null],
  );
  await tocar(db, empresa.lista_id, p.agora);
  return { ok: true };
}

type ContaDaProcura = { account_id: string; perfil: string; casa: boolean };

const SEM_CONTA =
  "Nenhuma conta do LinkedIn conectada e funcionando nesta organização. Vincule uma conta em Configurações, na aba LinkedIn, para procurar as empresas.";

const emLista = (nomes: string[]) => new Intl.ListFormat("pt-BR", { type: "conjunction" }).format(nomes);

/**
 * Contas que a Unipile recusou. Uma, com outra respondendo, é a conta; todas
 * de uma vez quase sempre é a chave da API. A da casa não aparece em
 * Configurações, então vai pelo papel, não pelo nome.
 */
function contasRecusadas(recusadas: ContaDaProcura[], erro: unknown, seguiuPor: ContaDaProcura | undefined): string {
  const motivo = (erro as Error).message;
  if (!seguiuPor && recusadas.length > 1) {
    return `A Unipile recusou as ${recusadas.length} contas do LinkedIn desta organização de uma vez (${motivo}). Quando todas caem juntas, o problema costuma ser a chave da API da Unipile, não as contas: peça ao admin para conferir.`;
  }
  const [conta] = recusadas;
  if (conta!.casa) return `A Unipile recusou a conta da casa (${motivo}). Peça ao admin para reconectá-la ou conferir a chave da API da Unipile.`;
  const quem =
    recusadas.length > 1
      ? `as contas do LinkedIn de ${emLista(recusadas.map((c) => c.perfil))} (${motivo}): elas parecem desconectadas`
      : `a conta do LinkedIn de ${conta!.perfil} (${motivo}): ela parece desconectada`;
  const texto = `A Unipile recusou ${quem}. Reconecte em Configurações, na aba LinkedIn.`;
  return seguiuPor
    ? `${texto} A procura seguiu pela conta ${seguiuPor.casa ? "da casa" : `de ${seguiuPor.perfil}`}.`
    : `${texto} Se a recusa continuar, peça ao admin para conferir a chave da API da Unipile.`;
}

const esperarDeVerdade = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/**
 * Procura no LinkedIn as empresas da lista que ainda não foram procuradas
 * (§4.11), até 20 por chamada, com uma pausa aleatória de 1 a 3 s entre uma
 * consulta e outra. Usa a conta conectada e saudável da organização; a conta
 * da casa só se não houver outra. Conta que a Unipile recusa (desconectada,
 * checkpoint, restrita), mesmo com status OK, sai da leva e a próxima saudável
 * assume; o `aviso` diz qual precisa reconectar. Chave da API recusada para a
 * leva na hora, sem tentar as outras. Não conta no teto de busca: é
 * consulta de lista, como região e setor. Erro de limite do LinkedIn para a leva.
 *
 * Lê e grava como o operador, cada resultado na hora; as consultas ficam fora
 * da transação.
 */
export async function procurarEmpresas(
  deps: { db: Db; unipile: ClienteUnipile; esperar?: (ms: number) => Promise<void>; sortear?: () => number; agora: () => Date },
  p: { listaId: string; operadorId: string },
): Promise<Resultado<{ procuradas: number; faltam: number; aviso?: string }>> {
  const esperar = deps.esperar ?? esperarDeVerdade;
  const sortear = deps.sortear ?? Math.random;
  const entrada = await comOperador(deps.db, p.operadorId, async (tx) => {
    const [lista] = await tx.query<{ organizacao_id: string }>("select organizacao_id from public.listas_de_empresas where id = $1::uuid", [
      p.listaId,
    ]);
    if (!lista) return null;
    const contas = await tx.query<ContaDaProcura & { unipile_status: string | null }>(
      `select unipile_account_id as account_id, nome as perfil, casa, unipile_status from public.perfis
        where organizacao_id = $1::uuid and unipile_account_id is not null
        order by casa, criado_em`,
      [lista.organizacao_id],
    );
    const empresas = await tx.query<{ id: string; nome: string }>(
      `select id, nome from public.empresas_da_lista where lista_id = $1::uuid and situacao = 'a_procurar'
        order by criado_em, chave limit $2`,
      [p.listaId, PROCURAS_POR_LEVA],
    );
    return { contas: contas.filter((c) => !c.unipile_status || STATUS_SAUDAVEIS.has(c.unipile_status)), empresas };
  });
  if (!entrada) return { ok: false, erro: "Lista não encontrada." };
  const faltam = async () => {
    const [linha] = await comOperador(deps.db, p.operadorId, (tx) =>
      tx.query<{ n: number }>("select count(*)::int as n from public.empresas_da_lista where lista_id = $1::uuid and situacao = 'a_procurar'", [
        p.listaId,
      ]),
    );
    return linha!.n;
  };
  if (entrada.empresas.length === 0) return { ok: true, procuradas: 0, faltam: await faltam() };
  if (entrada.contas.length === 0) return { ok: false, erro: SEM_CONTA };

  const contas = [...entrada.contas];
  const recusadas: ContaDaProcura[] = [];
  let ultimaRecusa: unknown = null;
  /** Consulta pela primeira conta que a Unipile aceita; a recusada sai da leva. */
  const consultar = async (nome: string): Promise<OpcaoDeEmpresa[]> => {
    for (;;) {
      const conta = contas[0]!;
      try {
        return await deps.unipile.listarParametrosDeBusca(conta.account_id, "COMPANY", nome.slice(0, 80));
      } catch (erro) {
        if (chaveRecusada(erro) || classificarErro(erro) !== "conta") throw erro;
        recusadas.push(conta);
        ultimaRecusa = erro;
        contas.shift();
        if (contas.length === 0) throw erro;
      }
    }
  };

  let procuradas = 0;
  for (const [indice, empresa] of entrada.empresas.entries()) {
    if (indice > 0) await esperar(1000 + Math.floor(sortear() * 2000));
    let paginas: OpcaoDeEmpresa[];
    try {
      paginas = await consultar(empresa.nome);
    } catch (erro) {
      const falta = await faltam();
      const classe = classificarErro(erro);
      if (classe === "limite") {
        return { ok: false, erro: `O LinkedIn limitou as consultas desta conta. ${procuradas} empresas foram procuradas; faltam ${falta}. Tente de novo mais tarde.` };
      }
      if (chaveRecusada(erro)) {
        return { ok: false, erro: `A Unipile recusou a chave da API (${(erro as Error).message}). ${PECA_A_CHAVE} ${procuradas} empresas foram procuradas; faltam ${falta}.` };
      }
      if (classe === "conta") {
        return { ok: false, erro: `${contasRecusadas(recusadas, erro, undefined)} ${procuradas} empresas foram procuradas; faltam ${falta}.` };
      }
      return { ok: false, erro: `O LinkedIn não respondeu à consulta de "${empresa.nome}": ${(erro as Error).message}. Faltam ${falta}.` };
    }
    const resultado = classificarProcura(empresa.nome, paginas);
    const pagina = resultado.situacao === "achada" ? resultado.pagina : null;
    const agora = deps.agora();
    await comOperador(deps.db, p.operadorId, async (tx) => {
      await tx.query(
        `update public.empresas_da_lista
            set situacao = $2, linkedin_id = $3, linkedin_nome = $4, opcoes = $5::jsonb, procurada_em = $6
          where id = $1::uuid and situacao = 'a_procurar'`,
        [empresa.id, resultado.situacao, pagina?.id ?? null, pagina?.nome ?? null, JSON.stringify(resultado.opcoes), agora],
      );
      await tocar(tx, p.listaId, agora);
    });
    procuradas += 1;
  }
  const aviso = recusadas.length > 0 ? contasRecusadas(recusadas, ultimaRecusa, contas[0]) : null;
  return { ok: true, procuradas, faltam: await faltam(), ...(aviso ? { aviso } : {}) };
}
