import { cargoDaBusca } from "@/domain/busca";
import { STATUS_SAUDAVEIS } from "@/domain/conta";
import { notasValidas } from "@/domain/nota";
import { MOTIVO_SEM_NOMES, ordenarEMarcar, pessoaDaPrevia, saldoDaPrevia, type PessoaDaPrevia } from "@/domain/previa";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { pessoaDaBusca } from "@/server/importacao/busca";
import type { AvaliadorDeAderencia } from "@/server/nota/avaliador";
import { entradaDaNota, promptDaNota } from "@/server/nota/prompts";
import { buscadosHoje } from "@/server/publicos/busca";
import { obterPublico, type PublicoSalvo } from "@/server/publicos/publicos";
import type { ClienteUnipile, ParametroDeBusca, ResultadoDeBusca } from "@/server/unipile/cliente";
import { classificarErro } from "@/server/unipile/erros";

export type Previa = {
  publicoId: string | null;
  status: "buscando" | "pronta" | "sem_nomes";
  pessoas: PessoaDaPrevia[];
  motivo: string | null;
  regiao: ParametroDeBusca | null;
  /** Quantas pessoas o LinkedIn diz que cabem na busca, quando diz. */
  totalNoLinkedin: number | null;
  confirmada: boolean;
};

type LinhaDaPrevia = {
  id: string;
  publico_id: string | null;
  status: Previa["status"];
  pessoas: unknown[];
  motivo: string | null;
  regiao: ParametroDeBusca | null;
  confirmada_em: Date | null;
  buscadas: number;
  total_no_linkedin: number | null;
};

/** Busca parada há mais que isso (deploy, timeout) pode recomeçar. */
const BUSCA_PARADA_MS = 3 * 60 * 1000;
/** Pessoas por chamada da nota. */
const LOTE_DA_NOTA = 20;
/** Páginas de busca por prévia, no máximo. */
const MAX_PAGINAS = 3;

const lerPessoas = (pessoas: unknown[]) =>
  pessoas.flatMap((pessoa) => {
    const lida = pessoaDaPrevia.safeParse(pessoa);
    return lida.success ? [lida.data] : [];
  });

const daLinha = (linha: LinhaDaPrevia): Previa => ({
  publicoId: linha.publico_id,
  status: linha.status,
  pessoas: lerPessoas(linha.pessoas),
  motivo: linha.motivo,
  regiao: linha.regiao,
  totalNoLinkedin: linha.total_no_linkedin,
  confirmada: linha.confirmada_em !== null,
});

async function linhaDaPrevia(db: Db, organizacaoId: string): Promise<LinhaDaPrevia | null> {
  const [linha] = await db.query<LinhaDaPrevia>(
    `select id, publico_id, status, pessoas, motivo, regiao, confirmada_em, buscadas, total_no_linkedin
       from public.previas where organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  return linha ?? null;
}

/** A prévia da organização, ou null se ainda não buscou. Roda como o operador ou como sistema. */
export async function obterPrevia(db: Db, organizacaoId: string): Promise<Previa | null> {
  const linha = await linhaDaPrevia(db, organizacaoId);
  return linha ? daLinha(linha) : null;
}

type ContaDaCasa = {
  id: string;
  account_id: string;
  unipile_status: string | null;
  fuso: string;
  busca_suspensa_ate: Date | null;
};

/** A conta da casa (§4.4, D1): só busca, para qualquer organização. */
async function contaDaCasa(db: Db): Promise<ContaDaCasa | null> {
  const [conta] = await db.query<ContaDaCasa>(
    `select id, unipile_account_id as account_id, unipile_status, fuso, busca_suspensa_ate
       from public.perfis where casa and unipile_account_id is not null
      order by criado_em limit 1`,
  );
  return conta ?? null;
}

/** A região do público no LinkedIn, pelo texto que o público tem; sem achar, o Brasil. */
async function resolverRegiao(unipile: ClienteUnipile, accountId: string, texto: string): Promise<ParametroDeBusca | null> {
  for (const tentativa of [texto.trim(), "Brasil"]) {
    if (tentativa.length < 2) continue;
    const [primeira] = await unipile.listarParametrosDeBusca(accountId, "LOCATION", tentativa);
    if (primeira) return primeira;
  }
  return null;
}

async function darNotas(avaliador: AvaliadorDeAderencia | null, publico: PublicoSalvo, pessoas: PessoaDaPrevia[]): Promise<PessoaDaPrevia[]> {
  if (!avaliador) return pessoas;
  const comNota = [...pessoas];
  for (let inicio = 0; inicio < pessoas.length; inicio += LOTE_DA_NOTA) {
    const lote = pessoas.slice(inicio, inicio + LOTE_DA_NOTA);
    try {
      const resposta = await avaliador.avaliar({ sistema: promptDaNota(publico), entrada: entradaDaNota(lote) });
      for (const nota of notasValidas(resposta.saida, lote.length)) {
        comNota[inicio + nota.indice] = { ...comNota[inicio + nota.indice]!, nota: nota.nota, motivo: nota.motivo };
      }
    } catch (erro) {
      // Sem nota, a pessoa fica sem marcação: o humano decide.
      console.error("Nota da prévia falhou", erro);
    }
  }
  return comNota;
}

async function gravar(
  db: Db,
  id: string,
  p: {
    status: Previa["status"];
    pessoas?: PessoaDaPrevia[];
    motivo?: string | null;
    regiao?: ParametroDeBusca | null;
    somarBuscadas?: number;
    total?: number | null;
  },
  agora: Date,
) {
  await db.query(
    `update public.previas
        set status = $2, pessoas = coalesce($3::jsonb, pessoas), motivo = $4, regiao = coalesce($5::jsonb, regiao),
            buscadas = buscadas + $6, atualizado_em = $7, total_no_linkedin = coalesce($8, total_no_linkedin)
      where id = $1::uuid`,
    [
      id,
      p.status,
      p.pessoas ? JSON.stringify(p.pessoas) : null,
      p.motivo ?? null,
      p.regiao ? JSON.stringify(p.regiao) : null,
      p.somarBuscadas ?? 0,
      agora,
      p.total ?? null,
    ],
  );
}

/**
 * A prévia do primeiro acesso (§4.4): quem no LinkedIn pode comprar, pela
 * conta da casa, antes de a organização vincular o LinkedIn dela.
 *
 * - Só busca: nada é enviado, ninguém vira lead aqui (só no SDR-46).
 * - Dois tetos: `previa.max_pessoas` por organização, somando todas as buscas,
 *   e o teto de busca do dia da conta da casa, que a prévia gasta junto com as
 *   buscas da própria conta (evento `busca_feita` no perfil da casa). A prévia
 *   roda a qualquer hora: quem chega à noite também vê os nomes.
 * - Opt-out nunca aparece. Quem passa da nota de corte vem marcado.
 * - Sem conta da casa, sem saldo ou com o LinkedIn fora: a prévia fica sem
 *   nomes, com o motivo, e o primeiro acesso segue.
 *
 * Roda com a conexão do sistema: a conta da casa é de outra organização. Quem
 * chama garante que o público é da organização.
 */
export async function rodarPrevia(
  deps: { db: Db; unipile: ClienteUnipile | null; avaliador: AvaliadorDeAderencia | null; agora: Date },
  p: { organizacaoId: string; publicoId: string },
): Promise<Previa> {
  const { db, agora } = deps;
  const [reservada] = await db.query<{ id: string; buscadas: number }>(
    `insert into public.previas (organizacao_id, publico_id, status, pessoas, motivo, iniciada_em, atualizado_em)
     values ($1::uuid, $2::uuid, 'buscando', '[]', null, $3, $3)
     on conflict (organizacao_id) do update
       set publico_id = excluded.publico_id, status = 'buscando', pessoas = '[]', motivo = null, regiao = null,
           total_no_linkedin = null, confirmada_em = null, iniciada_em = excluded.iniciada_em,
           atualizado_em = excluded.atualizado_em
     where public.previas.status <> 'buscando' or public.previas.iniciada_em < $3::timestamptz - $4::interval
     returning id, buscadas`,
    [p.organizacaoId, p.publicoId, agora, `${BUSCA_PARADA_MS / 1000} seconds`],
  );
  // Outra busca da mesma organização já está rodando: a tela acompanha.
  if (!reservada) return (await obterPrevia(db, p.organizacaoId))!;

  const semNomes = async (motivo: keyof typeof MOTIVO_SEM_NOMES, regiao?: ParametroDeBusca | null) => {
    await gravar(db, reservada.id, { status: "sem_nomes", motivo: MOTIVO_SEM_NOMES[motivo], regiao }, agora);
    return (await obterPrevia(db, p.organizacaoId))!;
  };

  const publico = await obterPublico(db, p.publicoId);
  const [dono] = await db.query<{ organizacao_id: string }>("select organizacao_id from public.publicos where id = $1::uuid", [
    p.publicoId,
  ]);
  if (!publico || dono?.organizacao_id !== p.organizacaoId) throw new Error("O público não é da organização.");

  const { max_pessoas: maximo } = await lerConfiguracao(db, "previa");
  const saldoDaOrganizacao = saldoDaPrevia(reservada.buscadas, maximo);
  if (saldoDaOrganizacao === 0) return semNomes("limite_da_previa");

  const casa = await contaDaCasa(db);
  if (!casa || !deps.unipile) return semNomes("sem_conta");
  if ((casa.unipile_status && !STATUS_SAUDAVEIS.has(casa.unipile_status)) || (casa.busca_suspensa_ate && casa.busca_suspensa_ate > agora)) {
    return semNomes("conta_fora");
  }
  const { max_resultados_dia: tetoDoDia, nota_de_corte: corte } = await lerConfiguracao(db, "busca");
  const alvo = Math.min(saldoDaOrganizacao, Math.max(0, tetoDoDia - (await buscadosHoje(db, { perfil_id: casa.id, fuso: casa.fuso }, agora))));
  if (alvo === 0) return semNomes("limite_da_conta");

  let regiao: ParametroDeBusca | null = null;
  let total: number | null = null;
  const encontrados: ResultadoDeBusca[] = [];
  try {
    regiao = await resolverRegiao(deps.unipile, casa.account_id, publico.empresa.regiao);
    if (!regiao) return semNomes("sem_regiao");
    const filtros = { cargo: cargoDaBusca(publico.quem.cargos), palavras: "", regioes: [regiao.id], setores: [] };
    let cursor: string | undefined;
    for (let pagina = 0; pagina < MAX_PAGINAS && encontrados.length < alvo; pagina++) {
      const resultado = await deps.unipile.buscarPessoas(casa.account_id, { filtros }, cursor);
      // O tamanho do público vem na primeira página, de graça: é a mesma busca.
      if (pagina === 0) total = resultado.total;
      encontrados.push(...resultado.itens);
      if (!resultado.cursor || resultado.itens.length === 0) break;
      cursor = resultado.cursor;
    }
  } catch (erro) {
    if (classificarErro(erro) === "limite") {
      await db.query("update public.perfis set busca_suspensa_ate = $2 where id = $1::uuid", [casa.id, new Date(agora.getTime() + 86_400_000)]);
    }
    console.error("Busca da prévia falhou", erro);
    return semNomes("falhou");
  }

  const trazidos = encontrados.slice(0, alvo);
  await registrarEvento(db, {
    tipo: "busca_feita",
    entidade: "previa",
    entidadeId: reservada.id,
    perfilId: casa.id,
    payload: { resultados: trazidos.length, organizacao_id: p.organizacaoId, conta_da_casa: true },
    em: agora,
  });

  // Opt-out nunca aparece (§4.13); a mesma pessoa duas vezes, uma só.
  const ids = [...new Set(trazidos.map((item) => item.providerId))];
  const optouts = await db.query<{ provider_id: string }>(
    `select provider_id from public.optouts where provider_id = any($1::text[])
      union select provider_id from public.pessoas where provider_id = any($1::text[]) and optout_em is not null`,
    [ids],
  );
  const bloqueados = new Set(optouts.map((linha) => linha.provider_id));
  const vistos = new Set<string>();
  const pessoas: PessoaDaPrevia[] = trazidos.flatMap((item) => {
    if (bloqueados.has(item.providerId) || vistos.has(item.providerId)) return [];
    vistos.add(item.providerId);
    const pessoa = pessoaDaBusca(item);
    return [
      {
        providerId: item.providerId,
        publicIdentifier: pessoa.publicIdentifier,
        urlPublica: pessoa.urlPublica,
        nome: pessoa.nome,
        primeiroNome: pessoa.primeiroNome,
        cargo: pessoa.cargo,
        empresa: pessoa.empresa,
        localizacao: pessoa.localizacao,
        nota: null,
        motivo: null,
        marcada: false,
      },
    ];
  });
  if (pessoas.length === 0) {
    await gravar(db, reservada.id, { status: "sem_nomes", motivo: MOTIVO_SEM_NOMES.ninguem, regiao, somarBuscadas: trazidos.length, total }, agora);
    return (await obterPrevia(db, p.organizacaoId))!;
  }

  const marcadas = ordenarEMarcar(await darNotas(deps.avaliador, publico, pessoas), corte);
  await gravar(db, reservada.id, { status: "pronta", pessoas: marcadas, regiao, somarBuscadas: trazidos.length, total }, agora);
  return (await obterPrevia(db, p.organizacaoId))!;
}

/** Marca ou desmarca uma pessoa da prévia. Roda como o operador. */
export async function marcarNaPrevia(
  db: Db,
  p: { organizacaoId: string; providerId: string; marcada: boolean; agora: Date },
): Promise<{ ok: boolean }> {
  const linha = await linhaDaPrevia(db, p.organizacaoId);
  if (!linha || linha.status !== "pronta") return { ok: false };
  const pessoas = lerPessoas(linha.pessoas);
  if (!pessoas.some((pessoa) => pessoa.providerId === p.providerId)) return { ok: false };
  const novas = pessoas.map((pessoa) => (pessoa.providerId === p.providerId ? { ...pessoa, marcada: p.marcada } : pessoa));
  await db.query("update public.previas set pessoas = $2::jsonb, atualizado_em = $3 where id = $1::uuid", [
    linha.id,
    JSON.stringify(novas),
    p.agora,
  ]);
  return { ok: true };
}

/**
 * A prévia fecha junto com a permissão da abordagem (SDR-56). Com nomes,
 * precisa de pelo menos uma marcada; sem nomes, segue e a lista vem pela
 * conta da organização quando ela vincular o LinkedIn. Roda como o operador.
 */
export async function confirmarPrevia(
  db: Db,
  p: { organizacaoId: string; operadorId: string; agora: Date },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const linha = await linhaDaPrevia(db, p.organizacaoId);
  if (!linha || linha.status === "buscando") return { ok: false, erro: "Espere a busca terminar." };
  const marcadas = lerPessoas(linha.pessoas).filter((pessoa) => pessoa.marcada).length;
  if (linha.status === "pronta" && marcadas === 0) return { ok: false, erro: "Marque pelo menos uma pessoa para seguir." };
  await db.query("update public.previas set confirmada_em = $2, atualizado_em = $2 where id = $1::uuid", [linha.id, p.agora]);
  await registrarEvento(db, {
    tipo: "previa_confirmada",
    entidade: "previa",
    entidadeId: linha.id,
    payload: { marcadas, sem_nomes: linha.status === "sem_nomes" },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}

/**
 * "Trocar o perfil do lead": o público volta a ser sugestão e a prévia volta
 * ao começo. O teto da prévia continua somando o que já foi buscado. Roda
 * como o operador.
 */
export async function trocarPublicoDaPrevia(
  db: Db,
  p: { organizacaoId: string; publicoId: string; operadorId: string; agora: Date },
): Promise<{ ok: boolean }> {
  const voltou = await db.query(
    `update public.publicos set status = 'sugerido', escolhido_por = null, escolhido_em = null, atualizado_em = $2
      where id = $1::uuid and status = 'ativo' returning id`,
    [p.publicoId, p.agora],
  );
  if (voltou.length === 0) return { ok: false };
  await db.query(
    `update public.previas set publico_id = null, status = 'pronta', pessoas = '[]', motivo = null, regiao = null,
            total_no_linkedin = null, confirmada_em = null, atualizado_em = $2
      where organizacao_id = $1::uuid`,
    [p.organizacaoId, p.agora],
  );
  await registrarEvento(db, { tipo: "publico_trocado", entidade: "publico", entidadeId: p.publicoId, payload: {}, ator: p.operadorId, em: p.agora });
  return { ok: true };
}
