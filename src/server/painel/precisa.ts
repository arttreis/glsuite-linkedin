import { STATUS_SAUDAVEIS } from "@/domain/conta";
import type { Db } from "@/server/db/tipos";

/** Uma coisa esperando alguém, com o lugar onde ela se resolve (§4.9). */
export type ItemDoPrecisa = {
  id: string;
  texto: string;
  detalhe: string | null;
  href: string;
  acao: string;
};

/** Conversas listadas uma a uma; o resto vira um item que leva aos Chats. */
const CONVERSAS_UMA_A_UMA = 5;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

type ConversaChamando = {
  lead_id: string;
  nome: string;
  empresa: string | null;
  motivo: string | null;
  pelo_agente: boolean;
};

type Conta = {
  id: string;
  nome: string;
  status: "ativo" | "pausado";
  motivo_pausa: string | null;
  unipile_account_id: string | null;
  unipile_status: string | null;
  ativado_em: Date | null;
};

/**
 * O que espera a pessoa agora, para o Dashboard. Roda dentro de
 * `comOperador`: o RLS limita tudo às contas que ela opera. A conta da casa
 * só busca e nunca aparece aqui.
 */
export async function precisaDeVoce(db: Db): Promise<ItemDoPrecisa[]> {
  // A conversa precisa de você quando está com humano (o SDR chamou ou você
  // assumiu) e a última mensagem é da pessoa.
  const chamando = await db.query<ConversaChamando & { total: number }>(
    `with abertas as (
       select l.id, l.estado, l.perfil_id,
              (select m.direcao from public.mensagens m where m.lead_id = l.id order by m.em desc limit 1) as ultima,
              (select max(m.em) from public.mensagens m where m.lead_id = l.id) as ultima_em
         from public.leads l
         join public.perfis p on p.id = l.perfil_id
        where not p.casa and l.estado = 'escalado_humano'
     )
     select a.id as lead_id, pe.nome, pe.empresa,
            e.payload ->> 'motivo' as motivo,
            coalesce(e.ator = 'agente', false) as pelo_agente,
            count(*) over ()::int as total
       from abertas a
       join public.leads l on l.id = a.id
       join public.pessoas pe on pe.id = l.pessoa_id
       left join lateral (
         select ev.payload, ev.ator from public.eventos ev
          where ev.entidade = 'lead' and ev.entidade_id = a.id::text and ev.tipo = 'lead_transicao'
            and ev.payload ->> 'para' = 'escalado_humano'
          order by ev.em desc limit 1
       ) e on a.estado = 'escalado_humano'
      where a.ultima = 'entrada'
      order by a.ultima_em desc
      limit ${CONVERSAS_UMA_A_UMA}`,
  );

  const itens: ItemDoPrecisa[] = chamando.map((c) => ({
    id: `conversa-${c.lead_id}`,
    texto: c.empresa ? `${c.nome}, ${c.empresa}` : c.nome,
    detalhe: c.pelo_agente
      ? `O SDR chamou você${c.motivo ? `: ${c.motivo}` : "."}`
      : "Esperando a sua resposta.",
    href: `/chats/${c.lead_id}`,
    acao: "Responder",
  }));
  const restantes = (chamando[0]?.total ?? 0) - chamando.length;
  if (restantes > 0) {
    itens.push({
      id: "conversas",
      texto: `Mais ${plural(restantes, "conversa esperando você", "conversas esperando você")}`,
      detalhe: null,
      href: "/chats?filter=needs-you",
      acao: "Abrir os Chats",
    });
  }

  // Resposta para aprovar e lead parado se resolvem na conversa do lead.
  const decidir = await db.query<{ lead_id: string; nome: string; empresa: string | null; motivo: string | null; tipo: "aprovacao" | "parado"; total: number }>(
    `with pendentes as (
       select l.id as lead_id, pe.nome, pe.empresa, 'aprovacao' as tipo,
              (select a.motivo_revisao from public.acoes a
                where a.lead_id = l.id and a.status = 'aguardando_aprovacao' order by a.criada_em desc limit 1) as motivo,
              (select max(a.criada_em) from public.acoes a where a.lead_id = l.id and a.status = 'aguardando_aprovacao') as em
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.perfis p on p.id = l.perfil_id
        where not p.casa and exists (select 1 from public.acoes a where a.lead_id = l.id and a.status = 'aguardando_aprovacao')
       union all
       select l.id, pe.nome, pe.empresa, 'parado', l.revisao_motivo, l.atualizado_em
         from public.leads l
         join public.pessoas pe on pe.id = l.pessoa_id
         join public.perfis p on p.id = l.perfil_id
        where not p.casa and l.revisao_motivo is not null
          and l.estado in ('na_fila', 'convite_enviado', 'aceito', 'em_sequencia')
          and not exists (select 1 from public.acoes a
                           where a.lead_id = l.id and a.status in ('pendente', 'aguardando_aprovacao', 'enviando'))
     )
     select lead_id, nome, empresa, motivo, tipo, count(*) over ()::int as total
       from pendentes
      order by em desc
      limit ${CONVERSAS_UMA_A_UMA}`,
  );
  for (const d of decidir) {
    itens.push({
      id: `${d.tipo}-${d.lead_id}`,
      texto: d.empresa ? `${d.nome}, ${d.empresa}` : d.nome,
      detalhe:
        d.tipo === "aprovacao"
          ? d.motivo ?? "O SDR escreveu e espera você aprovar."
          : `A sequência parou${d.motivo ? `: ${d.motivo}` : "."}`,
      href: `/chats/${d.lead_id}`,
      acao: d.tipo === "aprovacao" ? "Revisar" : "Decidir",
    });
  }
  const outras = (decidir[0]?.total ?? 0) - decidir.length;
  if (outras > 0) {
    itens.push({
      id: "decidir",
      texto: `Mais ${plural(outras, "resposta ou lead esperando você", "respostas ou leads esperando você")}`,
      detalhe: null,
      href: "/chats?filter=needs-you",
      acao: "Abrir os Chats",
    });
  }

  const contas = await db.query<Conta>(
    `select id, nome, status, motivo_pausa, unipile_account_id, unipile_status, ativado_em
       from public.perfis
      where not casa and public.pode_ver_perfil(id)
      order by nome`,
  );
  for (const conta of contas) {
    const desconectada =
      !conta.unipile_account_id || (conta.unipile_status !== null && !STATUS_SAUDAVEIS.has(conta.unipile_status));
    if (desconectada) {
      itens.push({
        id: `conta-${conta.id}`,
        texto: `O LinkedIn de ${conta.nome} precisa ser reconectado`,
        detalhe: conta.unipile_status ? `A Unipile informa ${conta.unipile_status}.` : "A conta não está vinculada.",
        href: `/settings/linkedin#conta-${conta.id}`,
        acao: "Reconectar",
      });
    } else if (conta.status === "pausado") {
      const nunca = conta.ativado_em === null;
      itens.push({
        id: `conta-${conta.id}`,
        texto: nunca ? `A conta de ${conta.nome} ainda não foi ativada` : `A conta de ${conta.nome} está pausada`,
        detalhe: nunca ? null : conta.motivo_pausa,
        href: `/#conta-${conta.id}`,
        acao: nunca ? "Ativar" : "Ver a conta",
      });
    }
  }

  // Quem a busca ou a importação trouxe espera você decidir, na campanha.
  const triar = await db.query<{ id: string; nome: string; n: number }>(
    `select c.id, c.nome, count(*)::int as n
       from public.leads l
       join public.campanhas c on c.id = l.campanha_id
       join public.perfis p on p.id = l.perfil_id
      where not p.casa and l.estado = 'triagem' and l.bloqueio_motivo is null
      group by c.id, c.nome
      order by n desc
      limit 3`,
  );
  for (const campanha of triar) {
    itens.push({
      id: `triagem-${campanha.id}`,
      texto: `${plural(campanha.n, "pessoa", "pessoas")} para decidir em ${campanha.nome}`,
      detalhe: null,
      href: `/campaigns/${campanha.id}?tab=leads`,
      acao: "Decidir",
    });
  }
  return itens;
}
