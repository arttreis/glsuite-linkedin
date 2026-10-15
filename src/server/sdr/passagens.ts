import type { Db } from "@/server/db/tipos";

/** Uma conversa que o SDR passou para a pessoa, com o motivo e onde ela está agora. */
export type Passagem = {
  leadId: string;
  nome: string;
  empresa: string | null;
  conta: string;
  motivo: string | null;
  em: Date;
  /** A conversa ainda está com a pessoa (não voltou ao SDR nem acabou). */
  comVoce: boolean;
};

export type PassagensRecentes = {
  dias: number;
  passagens: Passagem[];
  /** Mensagens de lead em que o SDR passou a conversa, no período. */
  passadas: number;
  /** Mensagens de lead que o SDR tratou no período: respondeu, deixou para aprovar ou passou. */
  tratadas: number;
};

const LISTADAS = 10;

/**
 * As últimas vezes que o SDR chamou a pessoa (§4.7), para ela ver se ele chama
 * na hora certa. Roda dentro de `comOperador`: o RLS limita às contas que ela
 * opera. Vem dos rascunhos: cada mensagem de lead que o agente leu vira um.
 */
export async function passagensRecentes(db: Db, p: { agora: Date; dias?: number }): Promise<PassagensRecentes> {
  const dias = p.dias ?? 30;
  const desde = new Date(p.agora.getTime() - dias * 24 * 60 * 60_000);

  const [contagem] = await db.query<{ passadas: number; tratadas: number }>(
    `select count(*) filter (where r.resultado = 'escalado')::int as passadas,
            count(*) filter (where r.resultado in ('escalado', 'agendado', 'na_fila', 'sugestao'))::int as tratadas
       from public.rascunhos r
       join public.perfis pf on pf.id = r.perfil_id
      where not pf.casa and r.criado_em >= $1`,
    [desde],
  );

  const linhas = await db.query<{
    lead_id: string;
    nome: string;
    empresa: string | null;
    conta: string;
    motivo: string | null;
    em: Date;
    estado: string;
  }>(
    `select r.lead_id, pe.nome, pe.empresa, pf.nome as conta, r.excecao as motivo, r.criado_em as em, l.estado
       from public.rascunhos r
       join public.perfis pf on pf.id = r.perfil_id
       join public.leads l on l.id = r.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
      where not pf.casa and r.resultado = 'escalado' and r.criado_em >= $1
      order by r.criado_em desc
      limit ${LISTADAS}`,
    [desde],
  );

  return {
    dias,
    passadas: contagem?.passadas ?? 0,
    tratadas: contagem?.tratadas ?? 0,
    passagens: linhas.map((l) => ({
      leadId: l.lead_id,
      nome: l.nome,
      empresa: l.empresa,
      conta: l.conta,
      motivo: l.motivo,
      em: l.em,
      comVoce: l.estado === "escalado_humano",
    })),
  };
}
