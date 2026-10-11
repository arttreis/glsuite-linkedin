import type { EstadoDoLead } from "@/domain/estados";
import type { Db } from "@/server/db/tipos";
import { transicionarLead } from "@/server/leads/transicoes";

/** Quem conduz a conversa agora (§4.7, §4.8). */
export type Situacao = "sdr" | "voce" | "precisa" | "fora";

/** Os filtros da lista, com o slug da URL em inglês. */
export const FILTROS_DO_CHAT = [
  { id: "all", rotulo: "Todas" },
  { id: "sdr", rotulo: "SDR conversando" },
  { id: "you", rotulo: "Com você" },
  { id: "needs-you", rotulo: "Precisa de você" },
] as const;
export type FiltroDoChat = (typeof FILTROS_DO_CHAT)[number]["id"];

export function lerFiltro(valor: unknown): FiltroDoChat {
  return FILTROS_DO_CHAT.some((filtro) => filtro.id === valor) ? (valor as FiltroDoChat) : "all";
}

export type ItemDoChat = {
  id: string;
  href: string;
  nome: string;
  empresa: string | null;
  conta: string;
  ultimoTexto: string | null;
  /** Quem escreveu a última mensagem. */
  ultimoAutor: QuemEscreveu | null;
  ultimaEm: Date | null;
  situacao: Situacao;
  estado: EstadoDoLead | null;
};

/** A marca de cada mensagem no fio: a pessoa, o SDR (IA ou régua) ou você. */
export type QuemEscreveu = "lead" | "sdr" | "voce";

export function quemEscreveu(direcao: "entrada" | "saida", autor: string): QuemEscreveu {
  if (direcao === "entrada") return "lead";
  return autor === "humano" ? "voce" : "sdr";
}

/**
 * A conversa está com você quando o SDR chamou ou você assumiu; precisa de
 * você quando, além disso, a última palavra é da pessoa, ou quando há
 * resposta do SDR esperando aprovação.
 */
export function situacaoDoLead(p: {
  estado: EstadoDoLead;
  ultimaDirecao: "entrada" | "saida" | null;
  aprovacoes: number;
}): Exclude<Situacao, "fora"> {
  const comVoce = p.estado === "escalado_humano";
  if ((comVoce && p.ultimaDirecao === "entrada") || p.aprovacoes > 0) return "precisa";
  return comVoce ? "voce" : "sdr";
}

const NO_FILTRO: Record<FiltroDoChat, (s: Situacao) => boolean> = {
  all: () => true,
  sdr: (s) => s === "sdr",
  you: (s) => s === "voce" || s === "precisa",
  "needs-you": (s) => s === "precisa",
};

const LIMITE = 300;

type LinhaDeLead = {
  id: string;
  estado: EstadoDoLead;
  nome: string;
  empresa: string | null;
  conta: string;
  texto: string;
  direcao: "entrada" | "saida";
  autor: string;
  em: Date;
  aprovacoes: number;
};

type LinhaExterna = {
  id: string;
  nome: string | null;
  conta: string;
  texto: string | null;
  direcao: "entrada" | "saida" | null;
  autor: string | null;
  em: Date | null;
};

/**
 * Todas as conversas das contas que a pessoa opera (§4.8), as de campanha e as
 * de fora, na ordem da última mensagem. Roda dentro de `comOperador`. A conta
 * da casa não conversa e fica de fora.
 */
export async function listarChats(db: Db, p: { filtro: FiltroDoChat }): Promise<ItemDoChat[]> {
  const leads = await db.query<LinhaDeLead>(
    `select l.id, l.estado, pe.nome, pe.empresa, pf.nome as conta,
            u.texto, u.direcao, u.autor, u.em,
            (select count(*)::int from public.acoes a where a.lead_id = l.id and a.status = 'aguardando_aprovacao') as aprovacoes
       from public.leads l
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = l.perfil_id
       join lateral (
         select m.texto, m.direcao, m.autor, m.em from public.mensagens m where m.lead_id = l.id order by m.em desc limit 1
       ) u on true
      where not pf.casa
      order by u.em desc
      limit ${LIMITE}`,
  );
  const itens: ItemDoChat[] = leads.map((l) => ({
    id: l.id,
    href: `/chats/${l.id}`,
    nome: l.nome,
    empresa: l.empresa,
    conta: l.conta,
    ultimoTexto: l.texto,
    ultimoAutor: quemEscreveu(l.direcao, l.autor),
    ultimaEm: l.em,
    situacao: situacaoDoLead({ estado: l.estado, ultimaDirecao: l.direcao, aprovacoes: l.aprovacoes }),
    estado: l.estado,
  }));

  if (p.filtro === "all") {
    const externas = await db.query<LinhaExterna>(
      `select c.id, c.contraparte_nome as nome, pf.nome as conta,
              u.texto, u.direcao, u.autor, coalesce(u.em, c.ultima_em) as em
         from public.conversas c
         join public.perfis pf on pf.id = c.perfil_id
         left join lateral (
           select m.texto, m.direcao, m.autor, m.em from public.mensagens m where m.conversa_id = c.id order by m.em desc limit 1
         ) u on true
        where c.lead_id is null and not pf.casa
        order by coalesce(u.em, c.ultima_em) desc nulls last
        limit ${LIMITE}`,
    );
    for (const c of externas) {
      itens.push({
        id: c.id,
        href: `/chats/thread/${c.id}`,
        nome: c.nome ?? "Conversa do LinkedIn",
        empresa: null,
        conta: c.conta,
        ultimoTexto: c.texto,
        ultimoAutor: c.direcao ? quemEscreveu(c.direcao, c.autor ?? "humano") : null,
        ultimaEm: c.em,
        situacao: "fora",
        estado: null,
      });
    }
  }

  const tempo = (item: ItemDoChat) => (item.ultimaEm ? new Date(item.ultimaEm).getTime() : 0);
  return itens
    .filter((item) => NO_FILTRO[p.filtro](item.situacao))
    .sort((a, b) => tempo(b) - tempo(a))
    .slice(0, LIMITE);
}

export type ItemDoFio =
  | { tipo: "mensagem"; id: string; quem: QuemEscreveu; texto: string; em: Date }
  | { tipo: "marco"; id: string; texto: string; em: Date; destaque: boolean };

export type RespostaPendente = { id: string; texto: string; motivo: string | null; toque: string | null };

export type ChatDoLead = {
  lead: {
    id: string;
    estado: EstadoDoLead;
    nome: string;
    cargo: string | null;
    empresa: string | null;
    localizacao: string | null;
    url: string;
    nota: number | null;
    campanha: string;
    conta: string;
    contaId: string;
    contaAtiva: boolean;
    modoResposta: string;
    chatId: string | null;
    optout: boolean;
  };
  fio: ItemDoFio[];
  pendentes: RespostaPendente[];
  situacao: Exclude<Situacao, "fora">;
};

type Transicao = { id: string; em: Date; ator: string; de: string; para: string; motivo: string | null; operador: string | null };

/** O texto do marco de uma transição; as que a própria mensagem já mostra ficam de fora. */
function marcoDaTransicao(t: Transicao): { texto: string; destaque: boolean } | null {
  if (t.para === "escalado_humano") {
    if (t.ator === "agente") return { texto: `O SDR chamou você${t.motivo ? `: ${t.motivo}` : ""}`, destaque: true };
    if (t.ator === "unipile") return { texto: "A conta respondeu direto no LinkedIn: o SDR saiu da conversa", destaque: false };
    if (t.operador) return { texto: `${t.operador} assumiu a conversa`, destaque: false };
    return { texto: `A conversa passou para você${t.motivo ? `: ${t.motivo}` : ""}`, destaque: false };
  }
  if (t.de === "escalado_humano" && t.para === "em_conversa") {
    return { texto: t.operador ? `${t.operador} devolveu a conversa ao SDR` : "A conversa voltou para o SDR", destaque: false };
  }
  const fixos: Record<string, string> = {
    qualificado: "Marcado como qualificado",
    reuniao_marcada: "Reunião marcada",
    encerrado_nao: "Disse não: conversa encerrada",
    optout: "Pediu para não ser mais contatado",
    sem_resposta: "A sequência terminou sem resposta",
    convite_retirado: "Convite retirado depois de 21 dias",
  };
  return fixos[t.para] ? { texto: fixos[t.para]!, destaque: false } : null;
}

/** A conversa de um lead como nas DMs, com os marcos no fio (§4.8). Roda dentro de `comOperador`. */
export async function abrirChat(db: Db, leadId: string): Promise<ChatDoLead | null> {
  const [lead] = await db.query<{
    id: string;
    estado: EstadoDoLead;
    nome: string;
    cargo: string | null;
    empresa: string | null;
    localizacao: string | null;
    url: string;
    nota: number | null;
    campanha: string;
    conta: string;
    conta_id: string;
    conta_status: string;
    modo_resposta: string;
    chat_id: string | null;
    optout: boolean;
    aceito_em: Date | null;
  }>(
    `select l.id, l.estado, pe.nome, pe.cargo, pe.empresa, pe.localizacao, pe.url_publica as url, l.nota,
            c.nome as campanha, pf.nome as conta, pf.id as conta_id, pf.status as conta_status, pf.modo_resposta,
            l.chat_id, (pe.optout_em is not null or l.estado = 'optout') as optout, l.aceito_em
       from public.leads l
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.campanhas c on c.id = l.campanha_id
       join public.perfis pf on pf.id = l.perfil_id
      where l.id = $1::uuid and not pf.casa`,
    [leadId],
  );
  if (!lead) return null;

  const mensagens = await db.query<{ id: string; direcao: "entrada" | "saida"; autor: string; texto: string; em: Date }>(
    "select id, direcao, autor, texto, em from public.mensagens where lead_id = $1::uuid order by em",
    [leadId],
  );
  const convites = await db.query<{ id: string; em: Date }>(
    "select id, enviada_em as em from public.acoes where lead_id = $1::uuid and tipo = 'convite' and status = 'enviada' and enviada_em is not null",
    [leadId],
  );
  const transicoes = await db.query<Transicao>(
    `select e.id, e.em, e.ator, e.payload ->> 'de' as de, e.payload ->> 'para' as para, e.payload ->> 'motivo' as motivo,
            o.nome as operador
       from public.eventos e
       left join public.operadores o on o.id::text = e.ator
      where e.entidade = 'lead' and e.entidade_id = $1 and e.tipo = 'lead_transicao'`,
    [leadId],
  );
  const pendentes = await db.query<RespostaPendente>(
    `select id, coalesce(texto_final, texto_gerado, '') as texto, motivo_revisao as motivo, toque
       from public.acoes
      where lead_id = $1::uuid and status = 'aguardando_aprovacao' and tipo = 'dm'
      order by agendada_para, criada_em`,
    [leadId],
  );

  const fio: ItemDoFio[] = [
    ...mensagens.map((m) => ({ tipo: "mensagem" as const, id: m.id, quem: quemEscreveu(m.direcao, m.autor), texto: m.texto, em: m.em })),
    ...convites.map((c) => ({ tipo: "marco" as const, id: `convite-${c.id}`, texto: "Convite enviado", em: c.em, destaque: false })),
    ...(lead.aceito_em
      ? [{ tipo: "marco" as const, id: "aceite", texto: "Aceitou o convite", em: lead.aceito_em, destaque: false }]
      : []),
    ...transicoes.flatMap((t) => {
      const marco = marcoDaTransicao(t);
      return marco ? [{ tipo: "marco" as const, id: t.id, em: t.em, ...marco }] : [];
    }),
  ].sort((a, b) => new Date(a.em).getTime() - new Date(b.em).getTime());

  const ultima = mensagens.at(-1);
  return {
    lead: {
      id: lead.id,
      estado: lead.estado,
      nome: lead.nome,
      cargo: lead.cargo,
      empresa: lead.empresa,
      localizacao: lead.localizacao,
      url: lead.url,
      nota: lead.nota,
      campanha: lead.campanha,
      conta: lead.conta,
      contaId: lead.conta_id,
      contaAtiva: lead.conta_status === "ativo",
      modoResposta: lead.modo_resposta,
      chatId: lead.chat_id,
      optout: lead.optout,
    },
    fio,
    pendentes,
    situacao: situacaoDoLead({
      estado: lead.estado,
      ultimaDirecao: ultima?.direcao ?? null,
      aprovacoes: pendentes.length,
    }),
  };
}

/**
 * Devolve a conversa ao SDR (§4.7): o lead volta para `em_conversa` e o SDR
 * responde a próxima mensagem da pessoa. Só sai de `escalado_humano`.
 */
export async function devolverAoSdr(db: Db, p: { leadId: string; operadorId: string; agora: Date }): Promise<boolean> {
  return transicionarLead(db, {
    leadId: p.leadId,
    para: "em_conversa",
    somenteDe: ["escalado_humano"],
    ator: p.operadorId,
    agora: p.agora,
    motivo: "devolvida ao SDR",
  });
}
