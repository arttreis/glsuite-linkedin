import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";

export type IdDoPasso = "conectar" | "ativar_perfil" | "criar_campanha" | "importar" | "triar" | "ativar_campanha";

export type Passo = { id: IdDoPasso; titulo: string; explicacao: string; href: string; acao: string; feito: boolean };

export type PrimeirosPassos = { concluido: boolean; passos: Passo[] };

/** Os passos da §4.10, nesta ordem. */
const PASSOS: Omit<Passo, "feito">[] = [
  {
    id: "conectar",
    titulo: "Conectar o LinkedIn",
    explicacao: "Ligue a conta do LinkedIn de um perfil que você opera. A conexão é feita pela Unipile, numa janela própria.",
    href: "/perfis",
    acao: "Ir para Perfis",
  },
  {
    id: "ativar_perfil",
    titulo: "Ativar o perfil",
    explicacao: "Confira o checklist do perfil logo abaixo e ative. A partir daí o sistema pode enviar dentro dos limites do perfil.",
    href: "#perfis",
    acao: "Ver os perfis",
  },
  {
    id: "criar_campanha",
    titulo: "Criar uma campanha",
    explicacao: "A campanha define o ângulo, o convite e as mensagens que cada pessoa aprovada vai receber.",
    href: "/campanhas/nova",
    acao: "Nova campanha",
  },
  {
    id: "importar",
    titulo: "Importar uma lista",
    explicacao: "Traga as pessoas para a campanha: planilha, Apify ou busca no LinkedIn.",
    href: "/importar",
    acao: "Importar lista",
  },
  {
    id: "triar",
    titulo: "Aprovar pessoas na triagem",
    explicacao: "Escolha quem vale receber o convite. Pelo menos uma pessoa precisa ser aprovada.",
    href: "/triagem",
    acao: "Abrir a triagem",
  },
  {
    id: "ativar_campanha",
    titulo: "Ativar a campanha",
    explicacao: "Com a campanha ativa, os convites começam a sair no horário permitido do perfil.",
    href: "/campanhas",
    acao: "Ver campanhas",
  },
];

/** Estados de quem já passou da triagem. */
const APROVADO = "l.estado not in ('importado', 'triagem', 'rejeitado')";

/**
 * Onde o operador está nos primeiros passos (§4.10). Tudo é lido como o
 * operador (RLS + `pode_ver_perfil`): conta só perfil que ele opera, e o admin
 * vale para todos. Quando a primeira campanha fica pronta, grava o momento em
 * `operadores.primeira_campanha_em` e não pergunta de novo.
 */
export async function avaliarPrimeirosPassos(db: Db, operadorId: string, agora: Date): Promise<PrimeirosPassos> {
  const [operador] = await db.query<{ primeira_campanha_em: Date | null }>(
    "select primeira_campanha_em from public.operadores where id = $1::uuid",
    [operadorId],
  );
  if (operador?.primeira_campanha_em) return { concluido: true, passos: [] };

  const [estado] = await comOperador(db, operadorId, (tx) =>
    tx.query<Record<IdDoPasso | "pronta", boolean>>(`
      select
        exists (select 1 from public.perfis p
                 where public.pode_ver_perfil(p.id) and p.unipile_account_id is not null) as conectar,
        exists (select 1 from public.perfis p
                 where public.pode_ver_perfil(p.id) and p.status = 'ativo') as ativar_perfil,
        exists (select 1 from public.campanhas c
                 where public.pode_ver_perfil(c.perfil_id) and c.status <> 'encerrada') as criar_campanha,
        exists (select 1 from public.leads l where public.pode_ver_perfil(l.perfil_id)) as importar,
        exists (select 1 from public.leads l where public.pode_ver_perfil(l.perfil_id) and ${APROVADO}) as triar,
        exists (select 1 from public.campanhas c
                 where public.pode_ver_perfil(c.perfil_id) and c.status = 'ativa') as ativar_campanha,
        exists (select 1 from public.campanhas c join public.perfis p on p.id = c.perfil_id
                 where public.pode_ver_perfil(c.perfil_id) and c.status = 'ativa' and p.status = 'ativo'
                   and exists (select 1 from public.leads l where l.campanha_id = c.id and ${APROVADO})) as pronta`),
  );

  if (estado?.pronta) {
    await db.query(
      "update public.operadores set primeira_campanha_em = $2 where id = $1::uuid and primeira_campanha_em is null",
      [operadorId, agora],
    );
    return { concluido: true, passos: [] };
  }
  return { concluido: false, passos: PASSOS.map((passo) => ({ ...passo, feito: Boolean(estado?.[passo.id]) })) };
}
