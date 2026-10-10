import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";

export type IdDoPasso = "dossie" | "publico" | "conta" | "leads" | "ativar";

export type Passo = { id: IdDoPasso; titulo: string; explicacao: string; href: string; acao: string; feito: boolean };

export type PrimeirosPassos = { concluido: boolean; passos: Passo[] };

/** Os passos da jornada (§4.10), nesta ordem. `href` dos passos 3 a 5 depende do público escolhido. */
const PASSOS: Omit<Passo, "feito" | "href">[] = [
  {
    id: "dossie",
    titulo: "Confirmar a oferta",
    explicacao: "Cole o site da empresa. A IA lê e monta o dossiê da oferta; você corrige e confirma. É dele que saem os públicos e as mensagens.",
    acao: "Ir para a Oferta",
  },
  {
    id: "publico",
    titulo: "Escolher um público",
    explicacao: "Peça sugestões à IA ou crie à mão: quem compra e por quê. Escolha pelo menos um.",
    acao: "Ir para Públicos",
  },
  {
    id: "conta",
    titulo: "Escolher a conta do LinkedIn",
    explicacao: "No público, comece a abordar com uma conta da praça dele. Se a conta ainda não está conectada e ativa, conecte e ative em Configurações.",
    acao: "Abrir o público",
  },
  {
    id: "leads",
    titulo: "Buscar pessoas e aprovar",
    explicacao: "Busque no LinkedIn pelo público, veja a nota de cada pessoa e aprove pelo menos uma na triagem.",
    acao: "Ir para os leads",
  },
  {
    id: "ativar",
    titulo: "Aprovar as mensagens e ativar",
    explicacao: "Revise o convite e as mensagens que a IA escreveu para o público e ative a campanha. Os convites saem no horário da conta.",
    acao: "Revisar e ativar",
  },
];

/** Estados de quem já passou da triagem. */
const APROVADO = "l.estado not in ('importado', 'triagem', 'rejeitado')";

type Estado = Record<IdDoPasso | "pronta", boolean> & { publico_id: string | null; campanha_id: string | null };

function hrefDoPasso(id: IdDoPasso, estado: Estado | undefined): string {
  const publico = estado?.publico_id ? `/publicos/${estado.publico_id}` : "/publicos";
  if (id === "dossie") return "/oferta";
  if (id === "publico") return "/publicos";
  if (id === "conta" || id === "leads") return estado?.publico_id ? `${publico}?aba=leads` : publico;
  return estado?.campanha_id ? `/campanhas/${estado.campanha_id}` : estado?.publico_id ? `${publico}?aba=abordagem` : publico;
}

/**
 * Onde o operador está na jornada (§4.10). Tudo é lido como o operador (RLS +
 * `pode_ver_perfil`): conta só a organização dele e os perfis que ele opera; o
 * admin vale para todos. "Campanha pronta" continua sendo campanha ativa, num
 * perfil ativo, com um lead aprovado. Quando ela aparece, grava o momento em
 * `operadores.primeira_campanha_em` e não pergunta de novo: quem já tinha
 * campanha pronta não volta para a jornada.
 */
export async function avaliarPrimeirosPassos(db: Db, operadorId: string, agora: Date): Promise<PrimeirosPassos> {
  const [operador] = await db.query<{ primeira_campanha_em: Date | null }>(
    "select primeira_campanha_em from public.operadores where id = $1::uuid",
    [operadorId],
  );
  if (operador?.primeira_campanha_em) return { concluido: true, passos: [] };

  const [estado] = await comOperador(db, operadorId, (tx) =>
    tx.query<Estado>(`
      select
        exists (select 1 from public.ofertas o where o.dossie_confirmado is not null) as dossie,
        exists (select 1 from public.publicos pu where pu.status = 'ativo') as publico,
        exists (select 1 from public.campanhas c join public.perfis p on p.id = c.perfil_id
                 where c.publico_id is not null and public.pode_ver_perfil(c.perfil_id) and c.status <> 'encerrada'
                   and p.status = 'ativo' and p.unipile_account_id is not null) as conta,
        exists (select 1 from public.leads l join public.campanhas c on c.id = l.campanha_id
                 where c.publico_id is not null and public.pode_ver_perfil(l.perfil_id) and ${APROVADO}) as leads,
        exists (select 1 from public.campanhas c
                 where c.publico_id is not null and public.pode_ver_perfil(c.perfil_id) and c.status = 'ativa') as ativar,
        exists (select 1 from public.campanhas c join public.perfis p on p.id = c.perfil_id
                 where public.pode_ver_perfil(c.perfil_id) and c.status = 'ativa' and p.status = 'ativo'
                   and exists (select 1 from public.leads l where l.campanha_id = c.id and ${APROVADO})) as pronta,
        (select pu.id from public.publicos pu where pu.status = 'ativo' order by pu.criado_em limit 1) as publico_id,
        (select c.id from public.campanhas c
          where c.publico_id is not null and public.pode_ver_perfil(c.perfil_id) and c.status <> 'encerrada'
          order by c.criado_em limit 1) as campanha_id`),
  );

  if (estado?.pronta) {
    await db.query(
      "update public.operadores set primeira_campanha_em = $2 where id = $1::uuid and primeira_campanha_em is null",
      [operadorId, agora],
    );
    return { concluido: true, passos: [] };
  }
  return {
    concluido: false,
    passos: PASSOS.map((passo) => ({ ...passo, href: hrefDoPasso(passo.id, estado), feito: Boolean(estado?.[passo.id]) })),
  };
}
