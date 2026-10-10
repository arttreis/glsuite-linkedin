import { randomUUID } from "node:crypto";
import { dossie as esquemaDoDossie, resumoDaOferta, type Dossie } from "@/domain/dossie";
import { sdr as esquemaDoSdr, type Sdr } from "@/domain/sdr";
import {
  nomeDoLeadDeTeste,
  notaDoDesfecho,
  SEGMENTO_PADRAO,
  type AjusteDoSdr,
  type ItemDoTeste,
} from "@/domain/teste-do-sdr";
import { abrirConversa, decidirResposta, type Consumo, type EntradaDoAgente } from "@/server/agente/decidir";
import { ErroDoModelo, type ModeloDeLinguagem, type Resposta } from "@/server/agente/modelo";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { entradaDoAjuste, promptDoAjuste, VERSAO_DO_PROMPT_DO_AJUSTE } from "./prompts";
import { gravarVersaoDoSdr, obterSdr, type SdrDaOrganizacao } from "./sdr";

/** Ajusta o SDR a partir de um pedido. Em produção é o Claude (`claude.ts`); nos testes, um falso. */
export interface AjustadorDeSdr {
  ajustar(p: { sistema: string; entrada: string }): Promise<Resposta<AjusteDoSdr>>;
}

export type TesteDoSdr = {
  segmento: string;
  /** Os segmentos do Mercado da análise, para a pessoa escolher quem faz. */
  segmentos: string[];
  /** O nome do lead que a pessoa faz. */
  lead: string;
  mensagens: ItemDoTeste[];
  sdrVersao: number;
  /** Há uma versão anterior para onde o "desfazer" volta. */
  podeDesfazer: boolean;
};

export type ResultadoDoTeste = { ok: true; teste: TesteDoSdr } | { ok: false; erro: string };

export type DependenciasDoTeste = { db: Db; modelo: ModeloDeLinguagem; agora: Date };

type Contexto = { sdr: SdrDaOrganizacao; analise: Dossie; nome: string };

const LIMITE_DO_TEXTO = 1000;
const ERRO_DO_MODELO = "O SDR não respondeu agora. Tente de novo.";

async function carregarContexto(db: Db, organizacaoId: string, nome: string): Promise<Contexto | null> {
  const sdr = await obterSdr(db, organizacaoId);
  const [oferta] = await db.query<{ dossie_confirmado: unknown }>(
    "select dossie_confirmado from public.ofertas where organizacao_id = $1::uuid",
    [organizacaoId],
  );
  const analise = esquemaDoDossie.safeParse(oferta?.dossie_confirmado);
  return sdr && analise.success ? { sdr, analise: analise.data, nome } : null;
}

const segmentosDa = (analise: Dossie) =>
  analise.mercado.segmentos.length > 0 ? analise.mercado.segmentos.map((s) => s.nome) : [SEGMENTO_PADRAO];

/**
 * A entrada do agente para o teste: o mesmo formato da produção (§7), com o
 * SDR e a análise da organização e um lead fictício do segmento escolhido.
 * Sem palavras proibidas de perfil: a conta ainda não existe.
 */
function entradaDoTeste(ctx: Contexto, segmento: string, itens: readonly ItemDoTeste[]): EntradaDoAgente {
  return {
    perfil: {
      nome: ctx.nome,
      praca: "domestico",
      idioma: ctx.analise.idioma,
      voz: null,
      regras: null,
      palavrasProibidas: [],
      rodape: null,
      limiteNotaConvite: 300,
    },
    linkDeAgenda: ctx.sdr.sdr.link_agenda,
    responsavelDiscovery: ctx.nome,
    oferta: resumoDaOferta(ctx.analise),
    sdr: { versao: ctx.sdr.versao, sdr: ctx.sdr.sdr },
    instrucoesDaCampanha: null,
    lead: {
      nome: nomeDoLeadDeTeste(ctx.analise.idioma),
      cargo: null,
      empresa: null,
      localizacao: null,
      campanha: "Teste do SDR",
      angulo: null,
      nicho: segmento,
      pesquisa: null,
    },
    mensagens: itens.flatMap((item) =>
      item.tipo === "nota"
        ? []
        : [
            item.tipo === "lead"
              ? { direcao: "entrada" as const, autor: "prospect", texto: item.texto, em: new Date(item.em) }
              : { direcao: "saida" as const, autor: "ia", texto: item.texto, em: new Date(item.em) },
          ],
    ),
  };
}

const nota = (tipo: Extract<ItemDoTeste, { tipo: "nota" }>["nota"], texto: string, em: Date, versao?: number): ItemDoTeste => ({
  id: randomUUID(),
  tipo: "nota",
  nota: tipo,
  texto,
  em: em.toISOString(),
  ...(versao === undefined ? {} : { versao }),
});

/** A primeira mensagem do SDR, como depois de um convite aceito. */
async function abrir(deps: DependenciasDoTeste, ctx: Contexto, segmento: string): Promise<ItemDoTeste> {
  const consumo: Consumo = { modelos: {}, uso: {} };
  const aberta = await abrirConversa({ entrada: entradaDoTeste(ctx, segmento, []), modelo: deps.modelo, consumo });
  if (!aberta.texto) return nota("desfecho", "O SDR não conseguiu escrever a abertura. Recomece a conversa.", deps.agora);
  return { id: randomUUID(), tipo: "sdr", texto: aberta.texto, em: deps.agora.toISOString(), acao: "responder", aviso: aberta.excecao };
}

/** A resposta do SDR à última mensagem do lead: a mesma decisão da produção (`decidirResposta`). */
async function responder(deps: DependenciasDoTeste, ctx: Contexto, segmento: string, itens: readonly ItemDoTeste[]): Promise<ItemDoTeste[]> {
  const consumo: Consumo = { modelos: {}, uso: {} };
  const desfecho = await decidirResposta({
    entrada: entradaDoTeste(ctx, segmento, itens),
    modelo: deps.modelo,
    configuracao: await lerConfiguracao(deps.db, "agente"),
    consumo,
  });
  if (desfecho.tipo !== "rascunho") {
    const texto = notaDoDesfecho(desfecho.tipo === "escalar" ? { tipo: "escalar", motivo: desfecho.motivo } : desfecho, ctx.nome);
    return [nota("desfecho", texto ?? "O SDR não responderia.", deps.agora)];
  }
  const resposta: ItemDoTeste[] = [];
  if (desfecho.texto) {
    resposta.push({
      id: randomUUID(),
      tipo: "sdr",
      texto: desfecho.texto,
      em: deps.agora.toISOString(),
      acao: desfecho.decisao.acao,
      aviso: desfecho.excecao,
    });
  }
  const texto = notaDoDesfecho({ tipo: "rascunho", acao: desfecho.decisao.acao }, ctx.nome);
  if (texto) resposta.push(nota("desfecho", texto, deps.agora));
  return resposta;
}

/**
 * Tira a última resposta do SDR (e as notas do que aconteceria) para
 * escrevê-la de novo depois de um ajuste. Ajustes e recusas ficam no fio.
 */
function semUltimaResposta(itens: readonly ItemDoTeste[]): { itens: ItemDoTeste[]; temLead: boolean } {
  const ultimoLead = itens.findLastIndex((item) => item.tipo === "lead");
  const resposta = (item: ItemDoTeste) => item.tipo === "sdr" || (item.tipo === "nota" && item.nota === "desfecho");
  return {
    itens: itens.filter((item, indice) => indice <= ultimoLead || !resposta(item)),
    temLead: ultimoLead >= 0,
  };
}

async function gravar(db: Db, organizacaoId: string, t: { segmento: string; mensagens: ItemDoTeste[]; sdrVersao: number }, agora: Date) {
  await db.query(
    `insert into public.sdr_testes (organizacao_id, segmento, mensagens, sdr_versao, criado_em, atualizado_em)
     values ($1::uuid, $2, $3::jsonb, $4, $5, $5)
     on conflict (organizacao_id) do update
       set segmento = excluded.segmento, mensagens = excluded.mensagens, sdr_versao = excluded.sdr_versao,
           atualizado_em = excluded.atualizado_em`,
    [organizacaoId, t.segmento, JSON.stringify(t.mensagens), t.sdrVersao, agora],
  );
}

async function montar(db: Db, ctx: Contexto, t: { segmento: string; mensagens: ItemDoTeste[] }): Promise<TesteDoSdr> {
  const [versoes] = await db.query<{ n: number }>("select count(*)::int as n from public.sdr_versoes where sdr_id = $1::uuid", [
    ctx.sdr.id,
  ]);
  return {
    segmento: t.segmento,
    segmentos: segmentosDa(ctx.analise),
    lead: nomeDoLeadDeTeste(ctx.analise.idioma),
    mensagens: t.mensagens,
    sdrVersao: ctx.sdr.versao,
    podeDesfazer: (versoes?.n ?? 0) > 1,
  };
}

const SEM_SDR = "Confirme a análise e espere o SDR ficar pronto antes de testar.";

/** O teste salvo da organização, ou null se ainda não começou. Roda como o operador. */
export async function obterTeste(db: Db, p: { organizacaoId: string; nome: string }): Promise<TesteDoSdr | null> {
  const ctx = await carregarContexto(db, p.organizacaoId, p.nome);
  if (!ctx) return null;
  const [linha] = await db.query<{ segmento: string; mensagens: ItemDoTeste[] }>(
    "select segmento, mensagens from public.sdr_testes where organizacao_id = $1::uuid",
    [p.organizacaoId],
  );
  return linha ? montar(db, ctx, linha) : null;
}

/**
 * Começa (ou recomeça) o teste: limpa a conversa, sem mexer no SDR, e o SDR
 * abre como faria depois de um convite aceito.
 */
export async function comecarTeste(
  deps: DependenciasDoTeste,
  p: { organizacaoId: string; nome: string; segmento?: string | null },
): Promise<ResultadoDoTeste> {
  const ctx = await carregarContexto(deps.db, p.organizacaoId, p.nome);
  if (!ctx) return { ok: false, erro: SEM_SDR };
  const segmentos = segmentosDa(ctx.analise);
  const segmento = p.segmento && segmentos.includes(p.segmento) ? p.segmento : segmentos[0]!;
  try {
    const mensagens = [await abrir(deps, ctx, segmento)];
    await gravar(deps.db, p.organizacaoId, { segmento, mensagens, sdrVersao: ctx.sdr.versao }, deps.agora);
    return { ok: true, teste: await montar(deps.db, ctx, { segmento, mensagens }) };
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) throw erro;
    return { ok: false, erro: ERRO_DO_MODELO };
  }
}

/** A pessoa, no papel de lead, responde; o SDR decide como na produção. */
export async function responderComoLead(
  deps: DependenciasDoTeste,
  p: { organizacaoId: string; nome: string; texto: string },
): Promise<ResultadoDoTeste> {
  const texto = p.texto.trim();
  if (texto.length === 0) return { ok: false, erro: "Escreva a mensagem do lead." };
  if (texto.length > LIMITE_DO_TEXTO) return { ok: false, erro: `No máximo ${LIMITE_DO_TEXTO} caracteres.` };
  const ctx = await carregarContexto(deps.db, p.organizacaoId, p.nome);
  if (!ctx) return { ok: false, erro: SEM_SDR };
  const atual = await obterTeste(deps.db, p);
  if (!atual) return { ok: false, erro: "Comece a conversa antes de responder." };

  const comLead: ItemDoTeste[] = [...atual.mensagens, { id: randomUUID(), tipo: "lead", texto, em: deps.agora.toISOString() }];
  try {
    const mensagens = [...comLead, ...(await responder(deps, ctx, atual.segmento, comLead))];
    await gravar(deps.db, p.organizacaoId, { segmento: atual.segmento, mensagens, sdrVersao: ctx.sdr.versao }, deps.agora);
    return { ok: true, teste: await montar(deps.db, ctx, { segmento: atual.segmento, mensagens }) };
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) throw erro;
    return { ok: false, erro: ERRO_DO_MODELO };
  }
}

/** Escreve de novo a última resposta (ou a abertura) com o SDR atual e grava. */
async function refazerUltimaResposta(
  deps: DependenciasDoTeste,
  p: { organizacaoId: string; nome: string },
  t: { segmento: string; mensagens: ItemDoTeste[] },
  aviso: ItemDoTeste,
): Promise<ResultadoDoTeste> {
  const ctx = await carregarContexto(deps.db, p.organizacaoId, p.nome);
  if (!ctx) return { ok: false, erro: SEM_SDR };
  const { itens, temLead } = semUltimaResposta(t.mensagens);
  const comAviso = [...itens, aviso];
  let mensagens: ItemDoTeste[];
  try {
    mensagens = temLead
      ? [...comAviso, ...(await responder(deps, ctx, t.segmento, comAviso))]
      : [...comAviso, await abrir(deps, ctx, t.segmento)];
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) throw erro;
    // O ajuste já valeu; só a resposta nova não saiu. Fica o aviso, e a pessoa responde de novo.
    mensagens = comAviso;
  }
  await gravar(deps.db, p.organizacaoId, { segmento: t.segmento, mensagens, sdrVersao: ctx.sdr.versao }, deps.agora);
  return { ok: true, teste: await montar(deps.db, ctx, { segmento: t.segmento, mensagens }) };
}

/** A conversa do teste em texto, para o ajuste entender o contexto do pedido. */
function conversaEmTexto(itens: readonly ItemDoTeste[], nome: string, lead: string): string {
  return itens
    .flatMap((item) => (item.tipo === "nota" ? [] : [`${item.tipo === "sdr" ? `${nome} (SDR)` : lead}: ${item.texto}`]))
    .slice(-12)
    .join("\n");
}

/**
 * "Ajustar o SDR" (§4.3): a IA reescreve o SDR com o pedido, grava uma versão
 * nova com o pedido e o resumo, e a última resposta é escrita de novo. Pedido
 * que contraria uma regra da casa é recusado com o motivo, sem mudar nada. O
 * ajuste nunca toca nas regras da casa: elas não moram no SDR.
 */
export async function ajustarNoTeste(
  deps: DependenciasDoTeste & { ajustador: AjustadorDeSdr },
  p: { organizacaoId: string; nome: string; pedido: string; referenciaId?: string | null; operadorId: string },
): Promise<ResultadoDoTeste> {
  const pedido = p.pedido.trim();
  if (pedido.length === 0) return { ok: false, erro: "Diga o que o SDR deveria fazer diferente." };
  if (pedido.length > LIMITE_DO_TEXTO) return { ok: false, erro: `No máximo ${LIMITE_DO_TEXTO} caracteres.` };
  const ctx = await carregarContexto(deps.db, p.organizacaoId, p.nome);
  const atual = await obterTeste(deps.db, p);
  if (!ctx || !atual) return { ok: false, erro: SEM_SDR };

  const referencia = atual.mensagens.find((item) => item.id === p.referenciaId && item.tipo === "sdr");
  const { link_agenda: linkAtual, ...semLink } = ctx.sdr.sdr;
  let ajuste: Resposta<AjusteDoSdr>;
  try {
    ajuste = await deps.ajustador.ajustar({
      sistema: promptDoAjuste(),
      entrada: entradaDoAjuste({
        sdr: semLink,
        pedido,
        referencia: referencia?.texto ?? null,
        conversa: conversaEmTexto(atual.mensagens, ctx.nome, atual.lead),
      }),
    });
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) throw erro;
    return { ok: false, erro: "Não consegui ajustar agora. Tente de novo." };
  }

  if (ajuste.saida.recusa) {
    const mensagens = [...atual.mensagens, nota("recusa", ajuste.saida.recusa, deps.agora)];
    await gravar(deps.db, p.organizacaoId, { segmento: atual.segmento, mensagens, sdrVersao: ctx.sdr.versao }, deps.agora);
    return { ok: true, teste: { ...atual, mensagens } };
  }

  const novo = esquemaDoSdr.safeParse({ ...ajuste.saida.sdr, link_agenda: linkAtual });
  if (!novo.success) return { ok: false, erro: "O ajuste saiu fora do formato. Tente dizer de outro jeito." };
  const gravado = await gravarVersaoDoSdr(deps.db, {
    organizacaoId: p.organizacaoId,
    sdr: novo.data,
    origem: "ajuste",
    pedido,
    resumo: ajuste.saida.resumo,
    por: p.operadorId,
    agora: deps.agora,
  });
  await registrarEvento(deps.db, {
    tipo: "sdr_ajustado",
    entidade: "sdr",
    entidadeId: gravado.id,
    payload: { versao: gravado.versao, modelo: ajuste.modelo, versao_prompt: VERSAO_DO_PROMPT_DO_AJUSTE },
    ator: p.operadorId,
    em: deps.agora,
  });
  return refazerUltimaResposta(deps, p, atual, nota("ajuste", ajuste.saida.resumo, deps.agora, gravado.versao));
}

/**
 * Desfaz a última mudança do SDR: grava como versão nova exatamente o SDR da
 * versão anterior, e a última resposta é escrita de novo.
 */
export async function desfazerAjuste(
  deps: DependenciasDoTeste,
  p: { organizacaoId: string; nome: string; operadorId: string },
): Promise<ResultadoDoTeste> {
  const ctx = await carregarContexto(deps.db, p.organizacaoId, p.nome);
  const atual = await obterTeste(deps.db, p);
  if (!ctx || !atual) return { ok: false, erro: SEM_SDR };
  const versoes = await deps.db.query<{ versao: number; sdr: Sdr; resumo: string | null }>(
    "select versao, sdr, resumo from public.sdr_versoes where sdr_id = $1::uuid order by versao desc limit 2",
    [ctx.sdr.id],
  );
  const [ultima, anterior] = versoes;
  if (!ultima || !anterior) return { ok: false, erro: "Não há mudança para desfazer." };

  const resumo = `Desfiz: ${ultima.resumo ?? "a última mudança"}`.slice(0, 200);
  const gravado = await gravarVersaoDoSdr(deps.db, {
    organizacaoId: p.organizacaoId,
    sdr: anterior.sdr,
    origem: "desfazer",
    resumo,
    por: p.operadorId,
    agora: deps.agora,
  });
  return refazerUltimaResposta(deps, p, atual, nota("desfeito", resumo, deps.agora, gravado.versao));
}

/** "Ficou bom": o SDR está aprovado e o passo 3 do primeiro acesso termina. Roda como o operador. */
export async function aprovarSdr(db: Db, p: { organizacaoId: string; operadorId: string; agora: Date }): Promise<{ ok: boolean }> {
  const aprovados = await db.query(
    "update public.sdrs set aprovado_em = $2, aprovado_por = $3::uuid where organizacao_id = $1::uuid returning id",
    [p.organizacaoId, p.agora, p.operadorId],
  );
  return { ok: aprovados.length > 0 };
}
