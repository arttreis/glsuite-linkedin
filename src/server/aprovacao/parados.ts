import type { EstadoDoLead } from "@/domain/estados";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { cancelarPendentes } from "@/server/acoes/cancelar";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { transicionarLead } from "@/server/leads/transicoes";

/** Estados de régua em que um toque rejeitado ou que falhou deixa o lead parado. */
const ESTADOS_DA_REGUA: readonly EstadoDoLead[] = ["na_fila", "convite_enviado", "aceito", "em_sequencia"];

export type LeadParado = {
  leadId: string;
  pessoa: string;
  empresa: string | null;
  perfil: string;
  estado: string;
  motivo: string;
  toque: string | null;
  texto: string | null;
};

/**
 * Leads cuja régua parou porque um toque foi rejeitado na aprovação ou falhou
 * de vez no envio (`leads.revisao_motivo`). Sem ação pendente, ninguém mais
 * mexe neles: alguém precisa decidir entre tentar de novo e assumir à mão.
 */
export async function listarParados(db: Db): Promise<LeadParado[]> {
  return db.query<LeadParado>(
    `select l.id as "leadId", pe.nome as pessoa, pe.empresa, pf.nome as perfil, l.estado,
            l.revisao_motivo as motivo, ultima.toque, ultima.texto
       from public.leads l
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = l.perfil_id
       left join lateral (
         select a.toque, coalesce(a.texto_final, a.texto_gerado) as texto from public.acoes a
          where a.lead_id = l.id and a.toque is not null and a.status in ('cancelada', 'falhou')
          order by a.atualizada_em desc limit 1
       ) ultima on true
      where l.revisao_motivo is not null
        and l.estado = any($1::text[])
        and not exists (
          select 1 from public.acoes a
           where a.lead_id = l.id and a.status in ('pendente', 'aguardando_aprovacao', 'enviando')
        )
      order by l.atualizado_em
      limit 200`,
    [ESTADOS_DA_REGUA],
  );
}

/**
 * Recoloca o último toque parado na fila de aprovação, com o texto que ele
 * tinha, para o operador corrigir e aprovar. O despachante só o envia depois.
 */
export async function tentarDeNovo(db: Db, p: { leadId: string; operadorId: string; agora: Date }): Promise<boolean> {
  return db.transacao(async (tx) => {
    const [lead] = await tx.query<{ perfil_id: string; revisao_motivo: string | null }>(
      "select perfil_id, revisao_motivo from public.leads where id = $1::uuid and estado = any($2::text[]) for update",
      [p.leadId, ESTADOS_DA_REGUA],
    );
    if (!lead?.revisao_motivo) return false;
    const [ultima] = await tx.query<{
      tipo: "convite" | "dm" | "tarefa_manual";
      toque: "T1" | "T2" | "T3" | "T4";
      origem: "template" | "ia" | "humano";
      texto: string | null;
    }>(
      `select tipo, toque, origem, coalesce(texto_final, texto_gerado) as texto from public.acoes
        where lead_id = $1::uuid and toque is not null and status in ('cancelada', 'falhou')
        order by atualizada_em desc limit 1`,
      [p.leadId],
    );
    if (!ultima) return false;

    const criada = await agendarAcao(tx, {
      leadId: p.leadId,
      perfilId: lead.perfil_id,
      tipo: ultima.tipo,
      toque: ultima.toque,
      origem: ultima.origem,
      agendadaPara: p.agora,
      chave: `${chaveDoToque(p.leadId, ultima.toque)}:de-novo:${p.agora.getTime()}`,
      status: "aguardando_aprovacao",
      textoGerado: ultima.texto,
      motivoRevisao: `Tentando de novo. Antes: ${lead.revisao_motivo}`,
    });
    if (!criada) return false;
    await tx.query("update public.leads set revisao_motivo = null where id = $1::uuid", [p.leadId]);
    await registrarEvento(tx, {
      tipo: "lead_retomado",
      entidade: "lead",
      entidadeId: p.leadId,
      perfilId: lead.perfil_id,
      payload: { toque: ultima.toque, motivo_anterior: lead.revisao_motivo },
      ator: p.operadorId,
      em: p.agora,
    });
    return true;
  });
}

/** O operador assume o lead à mão: a régua para e ele vai para "Com humano". */
export async function assumirParado(db: Db, p: { leadId: string; operadorId: string; agora: Date }): Promise<boolean> {
  return db.transacao(async (tx) => {
    const mudou = await transicionarLead(tx, {
      leadId: p.leadId,
      para: "escalado_humano",
      ator: p.operadorId,
      agora: p.agora,
      motivo: "assumido depois de toque parado",
      somenteDe: ESTADOS_DA_REGUA,
    });
    if (!mudou) return false;
    await cancelarPendentes(tx, p.leadId, "assumido por humano");
    await tx.query(
      "update public.leads set revisao_motivo = null, dono_conversa_id = coalesce(dono_conversa_id, $2::uuid) where id = $1::uuid",
      [p.leadId, p.operadorId],
    );
    return true;
  });
}
