import { buscaDoPublico, buscaInicial, cargoDaBusca, mesmosFiltros, saldoDeBusca, type BuscaDoPublico } from "@/domain/busca";
import { aberturaDoProximoDiaUtil, limitesDoDia, type Janela } from "@/domain/calendario";
import { STATUS_SAUDAVEIS } from "@/domain/conta";
import type { Praca } from "@/domain/validador";
import { enfileirarAlerta } from "@/server/alertas/alertas";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { feriadosDaPraca } from "@/server/despachante/perfis";
import { registrarEvento } from "@/server/eventos";
import { pessoaDaBusca } from "@/server/importacao/busca";
import { importarPessoas, type ResumoDaImportacao } from "@/server/importacao/importar";
import type { ClienteUnipile, ParametroDeBusca, ResultadoDeBusca } from "@/server/unipile/cliente";
import { classificarErro } from "@/server/unipile/erros";
import { obterPublico, type Resultado } from "./publicos";

type ContaDaBusca = {
  campanha_id: string;
  publico_id: string | null;
  busca: unknown;
  perfil_id: string;
  perfil: string;
  praca: Praca;
  fuso: string;
  janela: Janela;
  account_id: string | null;
  unipile_status: string | null;
  busca_suspensa_ate: Date | null;
};

async function contaDaCampanha(db: Db, campanhaId: string): Promise<ContaDaBusca | null> {
  const [conta] = await db.query<ContaDaBusca>(
    `select c.id as campanha_id, c.publico_id, c.busca, pf.id as perfil_id, pf.nome as perfil, pf.praca, pf.fuso, pf.janela,
            pf.unipile_account_id as account_id, pf.unipile_status, pf.busca_suspensa_ate
       from public.campanhas c join public.perfis pf on pf.id = c.perfil_id
      where c.id = $1::uuid`,
    [campanhaId],
  );
  return conta ?? null;
}

/** Quantos resultados de busca a conta já trouxe hoje, no fuso dela (a prévia da conta da casa conta junto). */
export async function buscadosHoje(db: Db, conta: Pick<ContaDaBusca, "perfil_id" | "fuso">, agora: Date): Promise<number> {
  const { inicio, fim } = limitesDoDia(agora, conta.fuso);
  const [soma] = await db.query<{ n: number }>(
    `select coalesce(sum((payload ->> 'resultados')::int), 0)::int as n from public.eventos
      where perfil_id = $1::uuid and tipo = 'busca_feita' and em >= $2 and em < $3`,
    [conta.perfil_id, inicio, fim],
  );
  return soma!.n;
}

export type SituacaoDaBusca = {
  busca: BuscaDoPublico;
  salva: boolean;
  saldoHoje: number;
  tetoDoDia: number;
  suspensaAte: Date | null;
};

/**
 * A busca da campanha como a aba Leads mostra: a salva, ou a inicial do
 * público (os cargos dele) quando ninguém salvou ainda. Só campanha de público
 * tem busca. Roda como o operador.
 */
export async function situacaoDaBusca(db: Db, campanhaId: string, agora: Date): Promise<SituacaoDaBusca | null> {
  const conta = await contaDaCampanha(db, campanhaId);
  if (!conta?.publico_id) return null;
  const salva = buscaDoPublico.safeParse(conta.busca);
  const publico = salva.success ? null : await obterPublico(db, conta.publico_id);
  if (!salva.success && !publico) return null;
  const { max_resultados_dia: teto } = await lerConfiguracao(db, "busca");
  return {
    busca: salva.success ? salva.data : buscaInicial(publico!),
    salva: salva.success,
    saldoHoje: saldoDeBusca(await buscadosHoje(db, conta, agora), teto),
    tetoDoDia: teto,
    suspensaAte: conta.busca_suspensa_ate && conta.busca_suspensa_ate > agora ? conta.busca_suspensa_ate : null,
  };
}

/**
 * Grava a busca editada pelo humano. Se mudou algum filtro, a próxima busca
 * recomeça do início; se não, continua de onde parou. Roda como o operador.
 */
export async function salvarBusca(
  db: Db,
  p: { campanhaId: string; busca: unknown; operadorId: string; agora: Date },
): Promise<Resultado> {
  const validada = buscaDoPublico.safeParse({ ...(p.busca as object), cursor: null, esgotada: false });
  if (!validada.success) return { ok: false, erro: "A busca precisa de pelo menos um cargo, e de no máximo 10 regiões e 10 setores." };
  const conta = await contaDaCampanha(db, p.campanhaId);
  if (!conta?.publico_id) return { ok: false, erro: "Só campanha de público tem busca." };
  const anterior = buscaDoPublico.safeParse(conta.busca);
  const mesma = anterior.success && mesmosFiltros(anterior.data, validada.data);
  const busca = { ...validada.data, cursor: mesma ? anterior.data.cursor : null, esgotada: mesma ? anterior.data.esgotada : false };
  await db.query("update public.campanhas set busca = $2::jsonb, atualizado_em = $3 where id = $1::uuid", [
    p.campanhaId,
    JSON.stringify(busca),
    p.agora,
  ]);
  await registrarEvento(db, {
    tipo: "busca_salva",
    entidade: "campanha",
    entidadeId: p.campanhaId,
    perfilId: conta.perfil_id,
    payload: { recomeca: busca.cursor === null },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}

/** Ids do LinkedIn para região ou setor, pela conta da campanha. Não conta no teto: é consulta de lista, não de pessoas. */
export async function procurarParametros(
  deps: { db: Db; unipile: ClienteUnipile },
  p: { campanhaId: string; tipo: "LOCATION" | "INDUSTRY"; texto: string },
): Promise<Resultado<{ itens: ParametroDeBusca[] }>> {
  const conta = await contaDaCampanha(deps.db, p.campanhaId);
  if (!conta?.account_id) return { ok: false, erro: "A conta da campanha não tem LinkedIn conectado." };
  if (p.texto.trim().length < 2) return { ok: true, itens: [] };
  try {
    return { ok: true, itens: await deps.unipile.listarParametrosDeBusca(conta.account_id, p.tipo, p.texto.trim()) };
  } catch (erro) {
    return { ok: false, erro: `O LinkedIn não respondeu à consulta: ${(erro as Error).message}` };
  }
}

export type ResultadoDaBusca = Resultado<{ resultados: number; resumo: ResumoDaImportacao }>;

/**
 * Roda a busca do público pela conta da campanha (§4.13) e manda o que vier
 * para a triagem, pelas regras de importação de sempre: opt-out nunca entra,
 * um alvo um dono, cooldown de empresa (§4.7). A busca roda a qualquer hora,
 * até o teto do dia da conta (§4.13): só os envios esperam a janela. Erro de limite do
 * LinkedIn suspende só a busca do perfil até o dia útil seguinte e avisa o
 * dono; os envios seguem.
 *
 * Roda com a conexão do sistema, como a importação; quem chama autoriza o
 * operador na campanha antes.
 */
export async function rodarBusca(
  deps: { db: Db; unipile: ClienteUnipile },
  p: { campanhaId: string; quantidade: number; operadorId: string; agora: Date },
): Promise<ResultadoDaBusca> {
  const { db, unipile } = deps;
  const conta = await contaDaCampanha(db, p.campanhaId);
  if (!conta?.publico_id) return { ok: false, erro: "Só campanha de público tem busca." };
  const salva = buscaDoPublico.safeParse(conta.busca);
  if (!salva.success) return { ok: false, erro: "Salve a busca antes de rodar." };
  const busca = salva.data;
  if (busca.regioes.length === 0) return { ok: false, erro: "Escolha pelo menos uma região: sem região, a busca pega o mundo todo." };
  if (busca.esgotada) return { ok: false, erro: "Esta busca já trouxe todo mundo que o LinkedIn mostra com esses filtros. Mude os filtros para achar mais gente." };
  if (!conta.account_id) return { ok: false, erro: "A conta da campanha não tem LinkedIn conectado." };
  if (conta.unipile_status && !STATUS_SAUDAVEIS.has(conta.unipile_status)) {
    return { ok: false, erro: `A conta do LinkedIn está com status ${conta.unipile_status}.` };
  }
  if (conta.busca_suspensa_ate && conta.busca_suspensa_ate > p.agora) {
    return { ok: false, erro: "A busca desta conta está suspensa até o próximo dia útil: o LinkedIn limitou as buscas." };
  }
  const { max_resultados_dia: teto } = await lerConfiguracao(db, "busca");
  const saldo = saldoDeBusca(await buscadosHoje(db, conta, p.agora), teto);
  if (saldo === 0) return { ok: false, erro: `A conta já buscou ${teto} pessoas hoje, o teto do dia.` };
  const alvo = Math.min(Math.max(1, Math.floor(p.quantidade)), saldo);

  const filtros = {
    cargo: cargoDaBusca(busca.cargos),
    palavras: busca.palavras,
    regioes: busca.regioes.map((r) => r.id),
    setores: busca.setores.map((s) => s.id),
  };
  const encontrados: ResultadoDeBusca[] = [];
  // `cursor` aponta para a próxima página; `daUltima`, para a última trazida.
  let cursor: string | null = busca.cursor;
  let daUltima: string | null = busca.cursor;
  let fim = false;
  let falha: string | null = null;
  try {
    while (encontrados.length < alvo) {
      const pagina = await unipile.buscarPessoas(conta.account_id, { filtros }, cursor ?? undefined);
      encontrados.push(...pagina.itens);
      daUltima = cursor;
      cursor = pagina.cursor;
      if (!pagina.cursor || pagina.itens.length === 0) {
        fim = true;
        break;
      }
    }
  } catch (erro) {
    if (classificarErro(erro) === "limite") {
      const ate = aberturaDoProximoDiaUtil(p.agora, conta.fuso, conta.janela, await feriadosDaPraca(db, conta.praca));
      await db.query("update public.perfis set busca_suspensa_ate = $2 where id = $1::uuid", [conta.perfil_id, ate]);
      await registrarEvento(db, {
        tipo: "busca_suspensa",
        entidade: "perfil",
        entidadeId: conta.perfil_id,
        perfilId: conta.perfil_id,
        payload: { ate: ate.toISOString(), erro: (erro as Error).message },
        em: p.agora,
      });
      await enfileirarAlerta(db, {
        chave: `busca_suspensa:${conta.perfil_id}:${ate.toISOString()}`,
        tipo: "busca_suspensa",
        perfilId: conta.perfil_id,
        assunto: `Busca do LinkedIn suspensa no perfil ${conta.perfil}`,
        texto: `O LinkedIn limitou as buscas da conta de ${conta.perfil}. A busca do Kakou volta no próximo dia útil. Convites e mensagens seguem normalmente.`,
      });
      falha = "O LinkedIn limitou as buscas desta conta. A busca volta no próximo dia útil; os envios seguem.";
    } else {
      falha = `A busca falhou: ${(erro as Error).message}`;
    }
  }

  const trazidos = encontrados.slice(0, alvo);
  const { resumo } = await importarPessoas(
    { db },
    {
      campanhaId: p.campanhaId,
      fonte: "unipile_busca",
      pessoas: trazidos.map(pessoaDaBusca),
      arquivoNome: "busca do público",
      operadorId: p.operadorId,
      agora: p.agora,
    },
  );
  // A próxima busca continua de onde esta parou. Página trazida pela metade
  // recomeça nela: quem já entrou aparece como duplicado, ninguém fica de fora.
  const pelaMetade = trazidos.length < encontrados.length;
  const proxima = pelaMetade ? { cursor: daUltima, esgotada: false } : { cursor, esgotada: fim };
  await db.query("update public.campanhas set busca = $2::jsonb where id = $1::uuid", [
    p.campanhaId,
    JSON.stringify({ ...busca, ...proxima }),
  ]);
  await registrarEvento(db, {
    tipo: "busca_feita",
    entidade: "campanha",
    entidadeId: p.campanhaId,
    perfilId: conta.perfil_id,
    payload: { resultados: trazidos.length, novos: resumo.novos, bloqueados: resumo.bloqueados, optouts: resumo.optouts, fim },
    ator: p.operadorId,
    em: p.agora,
  });
  if (falha) return { ok: false, erro: trazidos.length > 0 ? `${falha} Antes disso, ${trazidos.length} pessoas foram para a triagem.` : falha };
  return { ok: true, resultados: trazidos.length, resumo };
}
