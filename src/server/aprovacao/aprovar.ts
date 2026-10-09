import { contextoDeValidacao } from "@/domain/campanha";
import { validarMensagem, type Toque, type Violacao } from "@/domain/validador";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import { marcarDesfecho } from "@/server/conversas/desfecho";
import { enviarDmDeConversa } from "@/server/conversas/enviar";
import { passoDoLead } from "@/server/fluxo/fluxos";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { ClienteUnipile } from "@/server/unipile/cliente";

export type ResultadoDaAprovacao =
  | { ok: true; enviada: boolean }
  | { ok: false; motivo: string; violacoes?: Violacao[] };

type AcaoNaFila = {
  lead_id: string;
  perfil_id: string;
  tipo: "convite" | "dm";
  toque: Toque | null;
  origem: "template" | "ia" | "humano";
  status: string;
  texto_gerado: string | null;
  texto_final: string | null;
  chat_id: string | null;
  convite_id: string | null;
  provider_id: string;
  optout_em: Date | null;
  status_perfil: string;
  acao_sugerida: string | null;
};

/**
 * Aprova um item da fila (§9 SDR-11), como está ou editado. A edição guarda o
 * texto original (`texto_gerado`) e o que saiu (`texto_final`): é o dado para
 * melhorar o prompt. O texto aprovado passa de novo pelo validador.
 *
 * - Resposta de conversa sai na hora (o SLA corre).
 * - Toque da régua volta para a fila do despachante com o texto aprovado: ele
 *   continua respeitando janela, teto e um toque por dia.
 */
export async function aprovarAcao(
  deps: { db: Db; unipile: ClienteUnipile; agora: Date },
  p: { acaoId: string; operadorId: string; textoEditado?: string | null },
): Promise<ResultadoDaAprovacao> {
  const { db, agora } = deps;
  const preparo = await db.transacao(async (tx) => {
    const [acao] = await tx.query<AcaoNaFila>(
      `select a.lead_id, a.perfil_id, a.tipo, a.toque, a.origem, a.status, a.texto_gerado, a.texto_final,
              l.chat_id, l.convite_id, pe.provider_id, pe.optout_em, pf.status as status_perfil,
              (select r.acao_sugerida from public.rascunhos r where r.acao_id = a.id limit 1) as acao_sugerida
         from public.acoes a
         join public.leads l on l.id = a.lead_id
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.perfis pf on pf.id = a.perfil_id
        where a.id = $1::uuid
        for update of a`,
      [p.acaoId],
    );
    if (!acao) return { erro: "Ação não encontrada." };
    if (acao.status !== "aguardando_aprovacao") return { erro: "Essa ação já foi decidida." };
    if (acao.optout_em) return { erro: "A pessoa pediu para não ser contatada." };

    const original = (acao.texto_final ?? acao.texto_gerado)?.trim() ?? null;
    const editado = p.textoEditado?.trim() || null;
    const final = editado ?? original;
    if (!final) return { erro: "Não há texto para aprovar: edite a mensagem." };
    const houveEdicao = editado !== null && editado !== original;

    const passo = await passoDoLead(tx, acao.lead_id, acao.toque);
    const contexto = {
      ...contextoDeValidacao(await contextoDoPerfil(tx, acao.perfil_id), passo, houveEdicao ? "humano" : acao.origem),
      tipo: acao.tipo,
    };
    const validacao = validarMensagem(final, contexto);
    if (!validacao.ok) return { erro: "O texto não passou no validador.", violacoes: validacao.violacoes };

    const respostaDeConversa = acao.tipo === "dm" && acao.toque === null;
    if (respostaDeConversa && acao.status_perfil !== "ativo") {
      return { erro: "O perfil está pausado. Despause antes de aprovar respostas." };
    }
    await tx.query(
      `update public.acoes
          set status = $2, texto_final = $3, aprovada_por = $4::uuid, aprovada_em = $5,
              decisao_humana = $6, decidida_por = $4::uuid, decidida_em = $5, motivo_revisao = null,
              validacao = $7::jsonb, agendada_para = greatest(agendada_para, $5), tentativas = $8
        where id = $1::uuid`,
      [
        p.acaoId,
        respostaDeConversa ? "enviando" : "pendente",
        final,
        p.operadorId,
        agora,
        houveEdicao ? "editada" : "aprovada",
        JSON.stringify(validacao),
        respostaDeConversa ? 1 : 0,
      ],
    );
    await registrarEvento(tx, {
      tipo: houveEdicao ? "acao_editada" : "acao_aprovada",
      entidade: "acao",
      entidadeId: p.acaoId,
      perfilId: acao.perfil_id,
      payload: { lead_id: acao.lead_id, toque: acao.toque, origem: acao.origem },
      ator: p.operadorId,
      em: agora,
    });
    return { acao, final, houveEdicao, respostaDeConversa };
  });
  if ("erro" in preparo) return { ok: false, motivo: preparo.erro ?? "Erro", violacoes: preparo.violacoes };
  if (!preparo.respostaDeConversa) return { ok: true, enviada: false };

  const { acao, final, houveEdicao } = preparo;
  const envio = await enviarDmDeConversa(deps, {
    acaoId: p.acaoId,
    leadId: acao.lead_id,
    perfilId: acao.perfil_id,
    texto: final,
    chatId: acao.chat_id,
    providerId: acao.provider_id,
    conviteId: acao.convite_id,
    autor: houveEdicao ? "humano" : acao.origem === "ia" ? "ia" : "humano",
    operadorId: p.operadorId,
  });
  if (!envio.ok) return envio;

  // "Disse não": a mensagem de encerramento saiu, a conversa fecha (§4.6).
  if (acao.acao_sugerida === "encerrar") {
    await marcarDesfecho(db, { leadId: acao.lead_id, para: "encerrado_nao", operadorId: p.operadorId, agora });
  }
  return { ok: true, enviada: true };
}

/** Rejeita um item da fila. Nada sai; toque rejeitado deixa o lead marcado para revisão. */
export async function rejeitarAcao(
  db: Db,
  p: { acaoId: string; operadorId: string; agora: Date; motivo?: string | null },
): Promise<boolean> {
  return db.transacao(async (tx) => {
    const [acao] = await tx.query<{ lead_id: string; perfil_id: string; toque: string | null }>(
      `update public.acoes
          set status = 'cancelada', erro = $3, decisao_humana = 'rejeitada', decidida_por = $2::uuid, decidida_em = $4
        where id = $1::uuid and status = 'aguardando_aprovacao'
        returning lead_id, perfil_id, toque`,
      [p.acaoId, p.operadorId, `rejeitada na fila${p.motivo ? `: ${p.motivo}` : ""}`, p.agora],
    );
    if (!acao) return false;
    if (acao.toque) {
      await tx.query("update public.leads set revisao_motivo = $2 where id = $1::uuid", [
        acao.lead_id,
        "Rejeitada na aprovação",
      ]);
    }
    await registrarEvento(tx, {
      tipo: "acao_rejeitada",
      entidade: "acao",
      entidadeId: p.acaoId,
      perfilId: acao.perfil_id,
      payload: { lead_id: acao.lead_id, motivo: p.motivo ?? null },
      ator: p.operadorId,
      em: p.agora,
    });
    return true;
  });
}
