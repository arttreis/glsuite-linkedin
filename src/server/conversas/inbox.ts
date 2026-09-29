import type { Janela } from "@/domain/calendario";
import type { EstadoDoLead } from "@/domain/estados";
import { estadoDoSla, type EstadoDoSla } from "@/domain/sla";
import type { Praca } from "@/domain/validador";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { carregarFeriados } from "@/server/despachante/perfis";

export const ESTADOS_ABERTOS: readonly EstadoDoLead[] = ["em_conversa", "escalado_humano", "qualificado", "reuniao_marcada"];

export type ConversaDaInbox = {
  leadId: string;
  pessoa: string;
  cargo: string | null;
  empresa: string | null;
  perfil: string;
  perfilId: string;
  estado: EstadoDoLead;
  ultimoTexto: string | null;
  ultimaDirecao: "entrada" | "saida" | null;
  ultimaEm: Date | null;
  ultimaEntrada: Date | null;
  sla: EstadoDoSla | null;
  aguardandoAprovacao: number;
};

type Linha = Omit<ConversaDaInbox, "sla"> & { fuso: string; janela: Janela; praca: Praca; ultima_saida: Date | null };

const PESO_DO_SLA = { estourado: 0, no_prazo: 1, respondida: 2 } as const;

/**
 * Conversas da inbox (§9 SDR-09), com o SLA de cada uma. Ordem: SLA estourado,
 * depois o que vence antes, depois as respondidas.
 */
export async function listarConversas(
  db: Db,
  p: { agora: Date; perfilId?: string | null; estado?: EstadoDoLead | "abertas" | "todas" },
): Promise<ConversaDaInbox[]> {
  const estado = p.estado ?? "abertas";
  const linhas = await db.query<Linha>(
    `select l.id as "leadId", pe.nome as pessoa, pe.cargo, pe.empresa, pf.nome as perfil, pf.id as "perfilId",
            l.estado, pf.fuso, pf.janela, pf.praca,
            ultima.texto as "ultimoTexto", ultima.direcao as "ultimaDirecao", ultima.em as "ultimaEm",
            (select max(em) from public.mensagens m where m.lead_id = l.id and m.direcao = 'entrada') as "ultimaEntrada",
            (select max(em) from public.mensagens m where m.lead_id = l.id and m.direcao = 'saida') as ultima_saida,
            (select count(*)::int from public.acoes a where a.lead_id = l.id and a.status = 'aguardando_aprovacao') as "aguardandoAprovacao"
       from public.leads l
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = l.perfil_id
       left join lateral (
         select texto, direcao, em from public.mensagens m where m.lead_id = l.id order by em desc limit 1
       ) ultima on true
      where ($1::uuid is null or l.perfil_id = $1::uuid)
        and case
              when $2 = 'abertas' then l.estado = any($3::text[])
              when $2 = 'todas' then exists (select 1 from public.mensagens m where m.lead_id = l.id)
              else l.estado = $2
            end
      limit 500`,
    [p.perfilId ?? null, estado, ESTADOS_ABERTOS],
  );
  if (linhas.length === 0) return [];

  const feriados = await carregarFeriados(db);
  const horas = await lerConfiguracao(db, "sla_horas_uteis");
  const conversas = linhas.map(({ fuso, janela, praca, ultima_saida, ...conversa }) => ({
    ...conversa,
    sla: ESTADOS_ABERTOS.includes(conversa.estado)
      ? estadoDoSla({
          ultimaEntrada: conversa.ultimaEntrada ? new Date(conversa.ultimaEntrada) : null,
          ultimaSaida: ultima_saida ? new Date(ultima_saida) : null,
          agora: p.agora,
          horas,
          fuso,
          janela,
          feriados: feriados.get(praca) ?? new Set(),
        })
      : null,
  }));

  const chave = (c: ConversaDaInbox) => {
    if (!c.sla) return [3, -(c.ultimaEm ? new Date(c.ultimaEm).getTime() : 0)];
    if (c.sla.tipo === "no_prazo") return [PESO_DO_SLA.no_prazo, c.sla.venceEm.getTime()];
    if (c.sla.tipo === "estourado") return [PESO_DO_SLA.estourado, c.sla.venceuEm.getTime()];
    return [PESO_DO_SLA.respondida, -(c.ultimaEm ? new Date(c.ultimaEm).getTime() : 0)];
  };
  return conversas.sort((a, b) => {
    const [pa, va] = chave(a);
    const [pb, vb] = chave(b);
    return pa! - pb! || va! - vb!;
  });
}
