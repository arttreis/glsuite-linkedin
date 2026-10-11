import { dataLocal, instanteLocal, somarDias, somarDiasUteis, type Feriados, type Janela } from "@/domain/calendario";
import { condicaoDoConvite, inicioDoFluxo, nodePorId, proximoNode, type Fluxo, type NodeDoFluxo } from "@/domain/fluxo";
import { renderizarTemplate } from "@/domain/template";
import type { Praca } from "@/domain/validador";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { feriadosDaPraca } from "@/server/despachante/perfis";
import { transicionarLead } from "@/server/leads/transicoes";
import { fluxoDoLead } from "./fluxos";

/**
 * Motor do fluxo da campanha (§4.1, SDR-21). Anda pelos blocos a partir de um
 * evento (aprovação na triagem, envio, tarefa feita, aceite, convite
 * retirado) até o próximo bloco que precisa esperar alguém: uma ação na fila
 * do despachante, uma tarefa manual, um aceite ou o fim.
 *
 * "Esperar" não vira ação: só empurra o relógio para a abertura da janela do
 * perfil N dias úteis depois. O id do bloco vai em `acoes.toque` e compõe a
 * chave de idempotência, então cada bloco roda no máximo uma vez por lead.
 */

export type PerfilDoFluxo = { id: string; fuso: string; janela: Janela; praca: Praca };

type Contexto = {
  db: Db;
  perfil: PerfilDoFluxo;
  leadId: string;
  fluxo: Fluxo;
  feriados: Feriados;
  ator: string;
};

async function contexto(db: Db, p: { perfil: PerfilDoFluxo; leadId: string; ator: string; feriados?: Feriados }): Promise<Contexto | null> {
  const fluxo = await fluxoDoLead(db, p.leadId);
  if (!fluxo) return null;
  return { db, perfil: p.perfil, leadId: p.leadId, fluxo, ator: p.ator, feriados: p.feriados ?? (await feriadosDaPraca(db, p.perfil.praca)) };
}

async function estadoDoLead(db: Db, leadId: string): Promise<string | null> {
  const [lead] = await db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [leadId]);
  return lead?.estado ?? null;
}

/** Agenda a mensagem ou a tarefa do bloco. */
async function agendarTexto(ctx: Contexto, node: Extract<NodeDoFluxo, { tipo: "mensagem" | "tarefa" }>, quando: Date) {
  const manual = node.tipo === "tarefa";
  let roteiro: string | null = null;
  if (manual) {
    const modelo = node.roteiro;
    const [pessoa] = await ctx.db.query<{ primeiro_nome: string | null; empresa: string | null }>(
      "select pe.primeiro_nome, pe.empresa from public.leads l join public.pessoas pe on pe.id = l.pessoa_id where l.id = $1::uuid",
      [ctx.leadId],
    );
    const renderizado = renderizarTemplate(modelo, { first_name: pessoa?.primeiro_nome, company: pessoa?.empresa });
    roteiro = renderizado.ok ? renderizado.texto : modelo;
  }
  await agendarAcao(ctx.db, {
    leadId: ctx.leadId,
    perfilId: ctx.perfil.id,
    tipo: manual ? "tarefa_manual" : "dm",
    toque: node.id,
    origem: "template",
    agendadaPara: quando,
    chave: chaveDoToque(ctx.leadId, node.id),
    textoGerado: roteiro,
  });
}

/** Fim do fluxo: sem resposta e, se o bloco pede, pausa antes de voltar com outro ângulo (§4.5). */
async function finalizar(ctx: Contexto, node: Extract<NodeDoFluxo, { tipo: "fim" }>, agora: Date) {
  const estado = await estadoDoLead(ctx.db, ctx.leadId);
  // Convite retirado já é um fim: o lead fica como está, como sempre ficou.
  if (estado !== "aceito" && estado !== "em_sequencia") return;
  await transicionarLead(ctx.db, { leadId: ctx.leadId, para: "sem_resposta", ator: ctx.ator, agora });
  if (node.resultado === "pausa_60") {
    const dias = await lerConfiguracao(ctx.db, "pausa_pos_t4_dias");
    await ctx.db.query("update public.leads set retorno_apos = $2::date where id = $1::uuid", [
      ctx.leadId,
      somarDias(dataLocal(agora, ctx.perfil.fuso), dias),
    ]);
  }
}

/** Executa a partir de `node`, com o relógio em `quando`, até o próximo bloco que espera alguém. */
async function executar(ctx: Contexto, node: NodeDoFluxo | undefined, quando: Date, agora: Date): Promise<void> {
  if (!node) return;
  switch (node.tipo) {
    case "inicio":
      return executar(ctx, proximoNode(ctx.fluxo, node.id), quando, agora);
    case "esperar": {
      const data = somarDiasUteis(dataLocal(quando, ctx.perfil.fuso), node.dias_uteis, ctx.feriados);
      return executar(ctx, proximoNode(ctx.fluxo, node.id), instanteLocal(data, ctx.perfil.janela.inicio, ctx.perfil.fuso), agora);
    }
    case "convite": {
      const [lead] = await ctx.db.query<{ variante_copy: string | null }>("select variante_copy from public.leads where id = $1::uuid", [
        ctx.leadId,
      ]);
      // No braço personalizado do A/B, o texto vem da pesquisa e só sai depois de aprovado (SDR-15).
      await agendarAcao(ctx.db, {
        leadId: ctx.leadId,
        perfilId: ctx.perfil.id,
        tipo: "convite",
        toque: node.id,
        origem: lead?.variante_copy === "personalizada" ? "ia" : "template",
        agendadaPara: quando,
        chave: chaveDoToque(ctx.leadId, node.id),
      });
      return;
    }
    case "mensagem":
    case "tarefa":
      return agendarTexto(ctx, node, quando);
    case "condicao": {
      // "Já é conexão?" só existe logo depois do início e é decidida na entrada.
      if (node.condicao !== "aceitou") return;
      const estado = await estadoDoLead(ctx.db, ctx.leadId);
      if (estado === "aceito" || estado === "em_sequencia") {
        return executar(ctx, proximoNode(ctx.fluxo, node.id, "sim"), quando, agora);
      }
      return; // espera o aceite ou a retirada do convite
    }
    case "fim":
      return finalizar(ctx, node, agora);
  }
}

/**
 * Lead aprovado na triagem entra no fluxo: guarda a versão em que entrou e
 * anda a partir do início. `jaConectado` decide "Já é conexão?" (quem chama
 * consulta a Unipile; sem resposta, conta como não).
 */
export async function entrarNoFluxo(
  db: Db,
  p: { perfil: PerfilDoFluxo; leadId: string; agora: Date; ator: string; jaConectado?: boolean },
): Promise<void> {
  await db.query(
    "update public.leads l set fluxo_id = c.fluxo_id from public.campanhas c where c.id = l.campanha_id and l.id = $1::uuid",
    [p.leadId],
  );
  const ctx = await contexto(db, p);
  if (!ctx) return;
  const inicio = inicioDoFluxo(ctx.fluxo);
  if (!inicio) return;
  const primeiro = proximoNode(ctx.fluxo, inicio.id);
  if (primeiro?.tipo === "condicao" && primeiro.condicao === "conectado") {
    if (p.jaConectado) {
      await transicionarLead(db, { leadId: p.leadId, para: "aceito", ator: p.ator, agora: p.agora, motivo: "já era conexão" });
      await db.query("update public.leads set aceito_em = coalesce(aceito_em, $2) where id = $1::uuid", [p.leadId, p.agora]);
    }
    return executar(ctx, proximoNode(ctx.fluxo, primeiro.id, p.jaConectado ? "sim" : "nao"), p.agora, p.agora);
  }
  return executar(ctx, primeiro, p.agora, p.agora);
}

/** O fluxo tem "Já é conexão?" logo depois do início? A triagem só consulta a Unipile nesse caso. */
export function perguntaSeEConexao(f: Fluxo): boolean {
  const inicio = inicioDoFluxo(f);
  const primeiro = inicio ? proximoNode(f, inicio.id) : undefined;
  return primeiro?.tipo === "condicao" && primeiro.condicao === "conectado";
}

/**
 * Depois de uma mensagem enviada ou de uma tarefa feita: o lead passa a
 * `em_sequencia` e o fluxo segue do bloco `toque`.
 */
export async function aposAcao(
  db: Db,
  p: { perfil: PerfilDoFluxo; leadId: string; toque: string; agora: Date; ator: string; feriados?: Feriados },
): Promise<void> {
  if ((await estadoDoLead(db, p.leadId)) === "aceito") {
    await transicionarLead(db, { leadId: p.leadId, para: "em_sequencia", ator: p.ator, agora: p.agora });
  }
  const ctx = await contexto(db, p);
  if (!ctx) return;
  return executar(ctx, proximoNode(ctx.fluxo, p.toque), p.agora, p.agora);
}

/** A condição "Aceitou o convite?" do convite que o lead recebeu. */
async function condicaoDoLead(ctx: Contexto) {
  const [convite] = await ctx.db.query<{ toque: string | null }>(
    `select toque from public.acoes
      where lead_id = $1::uuid and tipo = 'convite' and status = 'enviada'
      order by enviada_em desc limit 1`,
    [ctx.leadId],
  );
  const conviteId =
    (convite?.toque && nodePorId(ctx.fluxo, convite.toque)?.id) ?? ctx.fluxo.nodes.find((node) => node.tipo === "convite")?.id;
  return conviteId ? condicaoDoConvite(ctx.fluxo, conviteId) : undefined;
}

/** Convite aceito: segue pela saída "sim", contando a partir do aceite. */
export async function aoAceitar(db: Db, p: { perfil: PerfilDoFluxo; leadId: string; agora: Date; ator: string }): Promise<void> {
  const ctx = await contexto(db, p);
  if (!ctx) return;
  const condicao = await condicaoDoLead(ctx);
  if (condicao) await executar(ctx, proximoNode(ctx.fluxo, condicao.id, "sim"), p.agora, p.agora);
}

/** Convite retirado no fim do prazo: segue pela saída "não". */
export async function aoRetirarConvite(db: Db, p: { perfil: PerfilDoFluxo; leadId: string; agora: Date; ator: string }): Promise<void> {
  const ctx = await contexto(db, p);
  if (!ctx) return;
  const condicao = await condicaoDoLead(ctx);
  if (condicao) await executar(ctx, proximoNode(ctx.fluxo, condicao.id, "nao"), p.agora, p.agora);
}

/**
 * Quando retirar o convite do bloco `toque` se não for aceito: o prazo da
 * condição em dias úteis ou, sem prazo, o padrão da casa em dias corridos.
 */
export async function prazoDoConvite(
  db: Db,
  p: { perfil: PerfilDoFluxo; leadId: string; toque: string | null; agora: Date; feriados: Feriados },
): Promise<Date> {
  const fluxo = await fluxoDoLead(db, p.leadId);
  const condicao = fluxo && p.toque ? condicaoDoConvite(fluxo, p.toque) : undefined;
  if (condicao?.prazo_dias_uteis) {
    const data = somarDiasUteis(dataLocal(p.agora, p.perfil.fuso), condicao.prazo_dias_uteis, p.feriados);
    return instanteLocal(data, p.perfil.janela.inicio, p.perfil.fuso);
  }
  const expira = await lerConfiguracao(db, "convite_expira_dias");
  return new Date(p.agora.getTime() + expira * 86_400_000);
}
