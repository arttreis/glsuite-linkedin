import type { Db } from "@/server/db/tipos";

export type ProximoPasso = { id: string; quantidade: number; texto: string; href: string; acao: string };

/**
 * O que está esperando alguém agora, para o Início. Roda dentro de
 * `comOperador`: o RLS limita tudo aos perfis que o operador opera.
 */
export async function proximosPassos(db: Db, agora: Date): Promise<ProximoPasso[]> {
  const [n] = await db.query<{ conversas: number; aprovacao: number; parados: number; tarefas: number; triagem: number }>(
    `select
       (select count(*)::int from public.leads l
         where l.estado in ('em_conversa', 'escalado_humano', 'qualificado')
           and (select m.direcao from public.mensagens m where m.lead_id = l.id order by m.em desc limit 1) = 'entrada'
       ) as conversas,
       (select count(*)::int from public.acoes where status = 'aguardando_aprovacao') as aprovacao,
       (select count(*)::int from public.leads l
         where l.revisao_motivo is not null
           and l.estado in ('na_fila', 'convite_enviado', 'aceito', 'em_sequencia')
           and not exists (select 1 from public.acoes a
                            where a.lead_id = l.id and a.status in ('pendente', 'aguardando_aprovacao', 'enviando'))
       ) as parados,
       (select count(*)::int from public.acoes
         where tipo = 'tarefa_manual' and status = 'pendente' and agendada_para <= $1::timestamptz) as tarefas,
       (select count(*)::int from public.leads where estado = 'triagem' and bloqueio_motivo is null) as triagem`,
    [agora],
  );
  if (!n) return [];
  const passos: ProximoPasso[] = [
    {
      id: "conversas",
      quantidade: n.conversas,
      texto: n.conversas === 1 ? "conversa esperando a sua resposta" : "conversas esperando a sua resposta",
      href: "/inbox",
      acao: "Abrir a Inbox",
    },
    {
      id: "aprovacao",
      quantidade: n.aprovacao,
      texto: n.aprovacao === 1 ? "mensagem esperando aprovação" : "mensagens esperando aprovação",
      href: "/aprovacao",
      acao: "Revisar",
    },
    {
      id: "parados",
      quantidade: n.parados,
      texto: n.parados === 1 ? "lead parado precisando de decisão" : "leads parados precisando de decisão",
      href: "/aprovacao",
      acao: "Decidir",
    },
    {
      id: "tarefas",
      quantidade: n.tarefas,
      texto: n.tarefas === 1 ? "mensagem para escrever à mão hoje" : "mensagens para escrever à mão hoje",
      href: "/tarefas",
      acao: "Ver tarefas",
    },
    {
      id: "triagem",
      quantidade: n.triagem,
      texto: n.triagem === 1 ? "pessoa esperando triagem" : "pessoas esperando triagem",
      href: "/triagem",
      acao: "Triar",
    },
  ];
  return passos.filter((passo) => passo.quantidade > 0);
}
