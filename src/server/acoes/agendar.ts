import type { Db } from "@/server/db/tipos";

export type NovaAcao = {
  leadId: string;
  perfilId: string;
  tipo: "convite" | "dm" | "retirar_convite" | "tarefa_manual";
  toque: "T1" | "T2" | "T3" | "T4" | null;
  origem: "template" | "ia" | "humano";
  agendadaPara: Date;
  /** Chave de idempotência: a mesma ação nunca é criada duas vezes. */
  chave: string;
  status?: "pendente" | "aguardando_aprovacao";
  textoGerado?: string | null;
  motivoRevisao?: string | null;
};

export const chaveDoToque = (leadId: string, toque: string) => `lead:${leadId}:${toque}`;

/** Cria a ação na fila do despachante. Repetir a mesma chave não faz nada. */
export async function agendarAcao(db: Db, acao: NovaAcao): Promise<string | null> {
  const [criada] = await db.query<{ id: string }>(
    `insert into public.acoes (
       lead_id, perfil_id, tipo, toque, origem, agendada_para, idempotency_key, status,
       texto_gerado, motivo_revisao
     ) values ($1::uuid, $2::uuid, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10)
     on conflict (idempotency_key) do nothing
     returning id`,
    [
      acao.leadId,
      acao.perfilId,
      acao.tipo,
      acao.toque,
      acao.origem,
      acao.agendadaPara,
      acao.chave,
      acao.status ?? "pendente",
      acao.textoGerado ?? null,
      acao.motivoRevisao ?? null,
    ],
  );
  return criada?.id ?? null;
}
