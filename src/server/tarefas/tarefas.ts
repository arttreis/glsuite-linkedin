import type { Janela } from "@/domain/calendario";
import type { Praca, Toque } from "@/domain/validador";
import type { Db } from "@/server/db/tipos";
import { feriadosDaPraca } from "@/server/despachante/perfis";
import { registrarEvento } from "@/server/eventos";
import { avancarRegua } from "@/server/sequencia/agendar-toque";

export type ComoFoiFeita = "painel" | "linkedin" | "botao";

/**
 * Conclui a tarefa manual de um toque (Espanha, §4.5): o JP escreveu e mandou.
 * Chega por três caminhos: pelo painel, pelo eco da mensagem que ele mandou
 * direto no LinkedIn ou pelo botão "já enviei". A régua segue: próxima tarefa
 * em dias úteis ou fim sem resposta.
 */
export async function concluirTarefaManual(
  db: Db,
  p: { acaoId?: string; leadId?: string; texto?: string | null; agora: Date; ator: string; como: ComoFoiFeita },
): Promise<boolean> {
  return db.transacao(async (tx) => {
    const [tarefa] = await tx.query<{
      id: string;
      lead_id: string;
      toque: Toque;
      perfil_id: string;
      fuso: string;
      janela: Janela;
      praca: Praca;
    }>(
      `select a.id, a.lead_id, a.toque, a.perfil_id, pf.fuso, pf.janela, pf.praca
         from public.acoes a join public.perfis pf on pf.id = a.perfil_id
        where a.tipo = 'tarefa_manual' and a.status = 'pendente'
          and (($1::uuid is not null and a.id = $1::uuid) or ($1::uuid is null and a.lead_id = $2::uuid))
        order by a.agendada_para
        limit 1
        for update of a`,
      [p.acaoId ?? null, p.leadId ?? null],
    );
    if (!tarefa) return false;

    await tx.query(
      `update public.acoes
          set status = 'enviada', enviada_em = $2, texto_final = coalesce($3, texto_final),
              decidida_por = case when $4 ~ '^[0-9a-f-]{36}$' then $4::uuid else null end, decidida_em = $2
        where id = $1::uuid`,
      [tarefa.id, p.agora, p.texto?.trim() || null, p.ator],
    );
    await tx.query("update public.leads set ultimo_toque_em = $2, passo_atual = $3 where id = $1::uuid", [
      tarefa.lead_id,
      p.agora,
      tarefa.toque,
    ]);
    await avancarRegua(tx, {
      perfil: { id: tarefa.perfil_id, fuso: tarefa.fuso, janela: tarefa.janela, praca: tarefa.praca },
      leadId: tarefa.lead_id,
      toque: tarefa.toque,
      agora: p.agora,
      feriados: await feriadosDaPraca(tx, tarefa.praca),
      ator: p.ator,
    });
    await registrarEvento(tx, {
      tipo: "tarefa_concluida",
      entidade: "acao",
      entidadeId: tarefa.id,
      perfilId: tarefa.perfil_id,
      payload: { lead_id: tarefa.lead_id, toque: tarefa.toque, como: p.como },
      ator: p.ator,
      em: p.agora,
    });
    return true;
  });
}

export type TarefaManual = {
  acaoId: string;
  leadId: string;
  toque: string;
  roteiro: string | null;
  agendadaPara: Date;
  vencida: boolean;
  pessoa: string;
  cargo: string | null;
  empresa: string | null;
  urlPublica: string;
  perfil: string;
};

export async function listarTarefas(db: Db, agora: Date): Promise<TarefaManual[]> {
  return db.query<TarefaManual>(
    `select a.id as "acaoId", a.lead_id as "leadId", a.toque, a.texto_gerado as roteiro, a.agendada_para as "agendadaPara",
            a.agendada_para <= $1::timestamptz as vencida,
            pe.nome as pessoa, pe.cargo, pe.empresa, pe.url_publica as "urlPublica", pf.nome as perfil
       from public.acoes a
       join public.leads l on l.id = a.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = a.perfil_id
      where a.tipo = 'tarefa_manual' and a.status = 'pendente'
      order by a.agendada_para
      limit 200`,
    [agora],
  );
}
