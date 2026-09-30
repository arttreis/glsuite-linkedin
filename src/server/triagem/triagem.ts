import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { transicionarLead } from "@/server/leads/transicoes";
import { sortearVariante } from "@/server/pesquisa/variante";
import { enfileirarEventoRd } from "@/server/rd/sincronizar";
import { motivoDeBloqueio, temOptout } from "./regras";

export type ResultadoDaTriagem = { aprovados: string[]; recusados: { leadId: string; motivo: string }[] };

type LeadEmTriagem = {
  id: string;
  estado: string;
  bloqueio_motivo: string | null;
  perfil_id: string;
  campanha_id: string;
  angulo: string;
  modo_copy: "template" | "personalizada";
  max_leads: number | null;
  pessoa_id: string;
  provider_id: string;
  dono_perfil_id: string;
};

/**
 * Aprova leads da triagem: revalida os bloqueios (a situação pode ter mudado
 * desde a importação), respeita o máximo de leads da campanha, passa a posse da
 * pessoa quando o dono anterior só a rejeitou e manda o lead para a fila.
 * Na campanha personalizada, o lead é sorteado para o braço do A/B do T1
 * (SDR-15): template da campanha ou nota escrita pela IA sobre a pesquisa.
 */
export async function aprovarLeads(
  db: Db,
  p: { leadIds: string[]; operadorId: string; agora: Date },
): Promise<ResultadoDaTriagem> {
  const resultado: ResultadoDaTriagem = { aprovados: [], recusados: [] };
  const hoje = p.agora.toISOString().slice(0, 10);
  const { proporcao_personalizada } = await lerConfiguracao(db, "pesquisa");

  for (const leadId of p.leadIds) {
    const motivo = await db.transacao(async (tx): Promise<string | null> => {
      const [lead] = await tx.query<LeadEmTriagem>(
        `select l.id, l.estado, l.bloqueio_motivo, l.perfil_id, l.campanha_id, c.angulo, c.modo_copy, c.max_leads,
                pe.id as pessoa_id, pe.provider_id, pe.dono_perfil_id
           from public.leads l
           join public.campanhas c on c.id = l.campanha_id
           join public.pessoas pe on pe.id = l.pessoa_id
          where l.id = $1::uuid
          for update of l, pe`,
        [leadId],
      );
      if (!lead) return "Lead não encontrado";
      if (lead.estado !== "triagem") return `Lead não está em triagem (${lead.estado})`;
      if (await temOptout(tx, lead.provider_id)) return "Pediu para não ser contatado";

      const bloqueio = await motivoDeBloqueio(tx, {
        pessoaId: lead.pessoa_id,
        donoPerfilId: lead.dono_perfil_id,
        campanha: { id: lead.campanha_id, perfilId: lead.perfil_id, angulo: lead.angulo },
        hoje,
        ignorarLeadId: lead.id,
      });
      if (bloqueio) {
        await tx.query("update public.leads set bloqueio_motivo = $2 where id = $1::uuid", [lead.id, bloqueio]);
        return bloqueio;
      }

      if (lead.max_leads !== null) {
        const [ocupados] = await tx.query<{ n: number }>(
          `select count(*)::int as n from public.leads
            where campanha_id = $1::uuid and estado not in ('triagem', 'rejeitado')`,
          [lead.campanha_id],
        );
        if (ocupados!.n >= lead.max_leads) return `Campanha já tem o máximo de ${lead.max_leads} leads`;
      }

      if (lead.dono_perfil_id !== lead.perfil_id) {
        await tx.query("update public.pessoas set dono_perfil_id = $2::uuid where id = $1::uuid", [
          lead.pessoa_id,
          lead.perfil_id,
        ]);
      }
      const variante = lead.modo_copy === "personalizada" ? sortearVariante(lead.id, proporcao_personalizada) : "template";
      await tx.query(
        "update public.leads set bloqueio_motivo = null, angulo = coalesce(angulo, $2), variante_copy = $3 where id = $1::uuid",
        [lead.id, lead.angulo, variante],
      );
      const mudou = await transicionarLead(tx, { leadId: lead.id, para: "na_fila", ator: p.operadorId, agora: p.agora });
      if (!mudou) return "Transição recusada";
      // T1 no dia 0 (§4.1). O despachante é quem respeita janela, teto e cooldown.
      // No braço personalizado o texto vem da pesquisa, e só sai depois de aprovado.
      await agendarAcao(tx, {
        leadId: lead.id,
        perfilId: lead.perfil_id,
        tipo: "convite",
        toque: "T1",
        origem: variante === "personalizada" ? "ia" : "template",
        agendadaPara: p.agora,
        chave: chaveDoToque(lead.id, "T1"),
      });
      await enfileirarEventoRd(tx, { leadId: lead.id, etapa: "01" });
      return null;
    });

    if (motivo) resultado.recusados.push({ leadId, motivo });
    else resultado.aprovados.push(leadId);
  }
  return resultado;
}

export async function rejeitarLeads(
  db: Db,
  p: { leadIds: string[]; operadorId: string; agora: Date; motivo?: string },
): Promise<number> {
  let rejeitados = 0;
  for (const leadId of p.leadIds) {
    const mudou = await transicionarLead(db, {
      leadId,
      para: "rejeitado",
      ator: p.operadorId,
      agora: p.agora,
      motivo: p.motivo ?? "rejeitado na triagem",
      somenteDe: ["triagem"],
    });
    if (mudou) rejeitados += 1;
  }
  return rejeitados;
}
