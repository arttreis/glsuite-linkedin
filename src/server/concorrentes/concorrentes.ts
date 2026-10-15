import {
  analiseDaResposta,
  analiseDoConcorrente,
  concorrentesDaAnalise,
  dominioDoConcorrente,
  listaDeConcorrentes,
  MAX_ANALISADOS,
  MAX_PAGINAS_DO_CONCORRENTE,
  vagaParaAnalisar,
  validarConcorrentes,
  type AnaliseDoConcorrente,
  type Concorrente,
  type ConcorrenteComAnalise,
  type LeituraDoConcorrente,
} from "@/domain/concorrentes";
import { dossie as esquemaDoDossie, normalizarUrlDoSite, resumoDaOferta } from "@/domain/dossie";
import { ErroDoModelo } from "@/server/agente/modelo";
import { lerConfiguracao } from "@/server/configuracoes";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import type { AnalistaDeConcorrente } from "./analista";
import {
  entradaDaAnaliseDoConcorrente,
  promptDaAnaliseDoConcorrente,
  promptDaLeituraDoConcorrente,
  VERSAO_DOS_PROMPTS_DO_CONCORRENTE,
} from "./prompts";

/** Os concorrentes como a tela mostra (§4.2): a lista e as análises já feitas, pelo domínio. */
export type SituacaoDosConcorrentes = {
  lista: Concorrente[];
  /** A lista ainda é a das alternativas da análise: ninguém confirmou. */
  daAnalise: boolean;
  confirmados: { em: Date; por: string | null } | null;
  /** Análises prontas, pelo domínio do site do concorrente. */
  analises: Record<string, AnaliseDoConcorrente>;
  /** Quantos concorrentes ainda podem ser analisados (teto por organização). */
  restantes: number;
  /** Kill switch da leitura de site (`dossie.ativo`), que vale também para concorrente. */
  leituraLigada: boolean;
};

type LinhaDosConcorrentes = {
  dossie_confirmado: unknown;
  concorrentes: unknown;
  concorrentes_confirmados_em: Date | null;
  confirmados_por: string | null;
  concorrentes_leituras: Record<string, LeituraDoConcorrente>;
};

const analisesProntas = (leituras: Record<string, LeituraDoConcorrente>): Record<string, AnaliseDoConcorrente> => {
  const prontas: Record<string, AnaliseDoConcorrente> = {};
  for (const [dominio, leitura] of Object.entries(leituras)) {
    if (leitura.status !== "pronta") continue;
    const lida = analiseDoConcorrente.safeParse(leitura.analise);
    if (lida.success) prontas[dominio] = lida.data;
  }
  return prontas;
};

const comAnalise = (
  lista: readonly Concorrente[],
  analises: Record<string, AnaliseDoConcorrente>,
): ConcorrenteComAnalise[] =>
  lista.map((c) => {
    const dominio = dominioDoConcorrente(c.site);
    return { ...c, analise: dominio ? (analises[dominio] ?? null) : null };
  });

async function linhaDosConcorrentes(db: Db, organizacaoId: string): Promise<LinhaDosConcorrentes | null> {
  const [linha] = await db.query<LinhaDosConcorrentes>(
    `select o.dossie_confirmado, o.concorrentes, o.concorrentes_confirmados_em, op.nome as confirmados_por, o.concorrentes_leituras
       from public.ofertas o left join public.operadores op on op.id = o.concorrentes_confirmados_por
      where o.organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  return linha ?? null;
}

/**
 * A lista de concorrentes da organização para a tela. Sem lista confirmada,
 * parte das alternativas do Mercado da análise confirmada. Roda como o
 * operador (RLS) ou como sistema.
 */
export async function situacaoDosConcorrentes(db: Db, organizacaoId: string): Promise<SituacaoDosConcorrentes> {
  const linha = await linhaDosConcorrentes(db, organizacaoId);
  const config = await lerConfiguracao(db, "dossie");
  const leituras = linha?.concorrentes_leituras ?? {};
  const analises = analisesProntas(leituras);
  const restantes = Math.max(0, MAX_ANALISADOS - Object.keys(leituras).length);
  const confirmada = listaDeConcorrentes.safeParse(linha?.concorrentes);
  if (linha?.concorrentes !== null && linha?.concorrentes !== undefined && confirmada.success) {
    return {
      lista: confirmada.data,
      daAnalise: false,
      confirmados: linha.concorrentes_confirmados_em
        ? { em: linha.concorrentes_confirmados_em, por: linha.confirmados_por }
        : null,
      analises,
      restantes,
      leituraLigada: config.ativo,
    };
  }
  const analise = esquemaDoDossie.safeParse(linha?.dossie_confirmado);
  return {
    lista: analise.success ? concorrentesDaAnalise(analise.data.mercado) : [],
    daAnalise: true,
    confirmados: null,
    analises,
    restantes,
    leituraLigada: config.ativo,
  };
}

/**
 * A lista que a pessoa confirmou, com as análises, para os prompts do SDR, dos
 * públicos e da abordagem. Null enquanto ninguém confirmou: aí os prompts
 * seguem só com as alternativas do Mercado, como antes.
 */
export async function concorrentesConfirmados(db: Db, organizacaoId: string): Promise<ConcorrenteComAnalise[] | null> {
  const linha = await linhaDosConcorrentes(db, organizacaoId);
  const lida = listaDeConcorrentes.safeParse(linha?.concorrentes);
  if (!linha?.concorrentes_confirmados_em || !lida.success) return null;
  return comAnalise(lida.data, analisesProntas(linha.concorrentes_leituras));
}

export type ResultadoDosConcorrentes = { ok: true } | { ok: false; erro: string };

/**
 * Grava a lista confirmada (§4.2): edição humana vale como fato. Lista vazia é
 * "não tenho concorrente direto". Não mexe no SDR: ele usa a lista na próxima
 * vez que for gerado. Roda como o operador: o RLS garante a organização.
 */
export async function confirmarConcorrentes(
  db: Db,
  p: { organizacaoId: string; concorrentes: unknown; operadorId: string; agora: Date },
): Promise<ResultadoDosConcorrentes> {
  const validada = validarConcorrentes(p.concorrentes);
  if (!validada.ok) return validada;
  const [oferta] = await db.query<{ id: string }>(
    `update public.ofertas
        set concorrentes = $2::jsonb, concorrentes_confirmados_em = $3, concorrentes_confirmados_por = $4::uuid, atualizado_em = $3
      where organizacao_id = $1::uuid and dossie_confirmado is not null
      returning id`,
    [p.organizacaoId, JSON.stringify(validada.lista), p.agora, p.operadorId],
  );
  if (!oferta) return { ok: false, erro: "Confirme a análise do site antes dos concorrentes." };
  await registrarEvento(db, {
    tipo: "concorrentes_confirmados",
    entidade: "oferta",
    entidadeId: oferta.id,
    payload: { quantidade: validada.lista.length, acrescentados: validada.lista.filter((c) => c.origem === "voce").length },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}

export type ResultadoDaAnalise = { ok: true; dominio: string; analise: AnaliseDoConcorrente } | { ok: false; erro: string };

/**
 * Lê o site de um concorrente e compara com a oferta (§4.2). O endereço é
 * recusado antes da IA se não for site público. Cada domínio novo ocupa uma
 * vaga do teto da organização; domínio já lido devolve a análise que tem, sem
 * chamar a IA. A vaga é reservada antes da leitura (duas abas não passam do
 * teto) e devolvida se a leitura falhar. Lê e grava como o operador; a IA roda
 * fora da transação.
 */
export async function analisarConcorrente(
  deps: { db: Db; analista: AnalistaDeConcorrente; agora: () => Date },
  p: { organizacaoId: string; operadorId: string; nome: string; site: string },
): Promise<ResultadoDaAnalise> {
  const endereco = normalizarUrlDoSite(p.site);
  if (!endereco.ok) return endereco;
  const { dominio, url } = endereco;
  const nome = p.nome.trim() || dominio;

  const reserva = await comOperador(deps.db, p.operadorId, async (tx) => {
    const config = await lerConfiguracao(tx, "dossie");
    if (!config.ativo) return { erro: "A leitura de site está desligada pelo admin." };
    const [oferta] = await tx.query<{ id: string; dossie_confirmado: unknown; concorrentes_leituras: Record<string, LeituraDoConcorrente> }>(
      "select id, dossie_confirmado, concorrentes_leituras from public.ofertas where organizacao_id = $1::uuid for update",
      [p.organizacaoId],
    );
    const analise = esquemaDoDossie.safeParse(oferta?.dossie_confirmado);
    if (!oferta || !analise.success) return { erro: "Confirme a análise do site antes de analisar concorrentes." };
    const vaga = vagaParaAnalisar(oferta.concorrentes_leituras, dominio, deps.agora());
    if (!vaga.ok) return { erro: vaga.erro };
    if (vaga.jaLido) return { pronta: vaga.jaLido };
    await tx.query(
      `update public.ofertas
          set concorrentes_leituras = concorrentes_leituras || jsonb_build_object($2::text, jsonb_build_object('status', 'lendo', 'em', $3::text))
        where id = $1::uuid`,
      [oferta.id, dominio, deps.agora().toISOString()],
    );
    return { ofertaId: oferta.id, oferta: resumoDaOferta(analise.data) };
  });
  if ("erro" in reserva) return { ok: false, erro: reserva.erro! };
  if ("pronta" in reserva) return { ok: true, dominio, analise: reserva.pronta! };
  const { ofertaId, oferta } = reserva;

  const devolverVaga = () =>
    comOperador(deps.db, p.operadorId, (tx) =>
      tx.query("update public.ofertas set concorrentes_leituras = concorrentes_leituras - $2::text where id = $1::uuid", [
        ofertaId,
        dominio,
      ]),
    );

  const inicio = Date.now();
  try {
    const leitura = await deps.analista.ler({
      sistema: promptDaLeituraDoConcorrente({ maxPaginas: MAX_PAGINAS_DO_CONCORRENTE }),
      url,
      dominio,
      maxPaginas: MAX_PAGINAS_DO_CONCORRENTE,
    });
    const paginas = leitura.fontes.map((fonte) => fonte.url);
    const resposta = await deps.analista.analisar({
      sistema: promptDaAnaliseDoConcorrente(),
      entrada: entradaDaAnaliseDoConcorrente({ oferta, nome, url, notas: leitura.notas, paginas }),
    });
    const aproveitada = analiseDaResposta(resposta.saida);
    if (!aproveitada) throw new ErroDoModelo("A IA não trouxe nada aproveitável do site.");

    const agora = deps.agora();
    const custo = (custoDaChamada(leitura.modelo, leitura.uso) ?? 0) + (custoDaChamada(resposta.modelo, resposta.uso) ?? 0);
    const pronta: LeituraDoConcorrente = { status: "pronta", em: agora.toISOString(), analise: aproveitada.analise, paginas };
    await comOperador(deps.db, p.operadorId, async (tx) => {
      await tx.query(
        `update public.ofertas
            set concorrentes_leituras = concorrentes_leituras || jsonb_build_object($2::text, $3::jsonb)
          where id = $1::uuid`,
        [ofertaId, dominio, JSON.stringify(pronta)],
      );
      await registrarEvento(tx, {
        tipo: "concorrente_analisado",
        entidade: "oferta",
        entidadeId: ofertaId,
        payload: {
          dominio,
          paginas: paginas.length,
          descartados: aproveitada.descartados,
          modelo: resposta.modelo,
          custo_usd: Number(custo.toFixed(4)),
          duracao_ms: Date.now() - inicio,
          versao_prompt: VERSAO_DOS_PROMPTS_DO_CONCORRENTE,
        },
        ator: p.operadorId,
        em: agora,
      });
    });
    return { ok: true, dominio, analise: aproveitada.analise };
  } catch (erro) {
    await devolverVaga();
    if (!(erro instanceof ErroDoModelo)) console.error("Análise de concorrente falhou", erro);
    const motivo = erro instanceof ErroDoModelo ? erro.message.replace(/\.$/, "") : "a IA não respondeu";
    return { ok: false, erro: `Não consegui analisar ${nome}: ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}.` };
  }
}
