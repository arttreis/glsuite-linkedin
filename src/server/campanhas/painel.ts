import type { ProblemaDoBloco } from "@/domain/fluxo";
import { validarCopyDoFluxo } from "@/domain/fluxo";
import { fluxoComTextosNovos } from "@/domain/linha-do-tempo";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import type { StatusDaCampanha } from "@/server/campanhas/campanhas";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { fluxoDaCampanha, salvarFluxo } from "@/server/fluxo/fluxos";

export type CampanhaNaLista = {
  id: string;
  nome: string;
  publico: string | null;
  conta: string;
  status: StatusDaCampanha;
  triagem: number;
  naFila: number;
  convites: number;
  conversas: number;
  reunioes: number;
};

/**
 * As campanhas das contas que a pessoa opera (§4.11), com o público, a conta,
 * o status e os números. Roda dentro de `comOperador`; a conta da casa não
 * tem campanha.
 */
export async function listarCampanhas(db: Db): Promise<CampanhaNaLista[]> {
  return db.query<CampanhaNaLista>(
    `select c.id, c.nome, pu.nome as publico, pf.nome as conta, c.status,
            count(l.id) filter (where l.estado = 'triagem')::int as triagem,
            count(l.id) filter (where l.estado = 'na_fila')::int as "naFila",
            (select count(*)::int from public.acoes a
              where a.tipo = 'convite' and a.status = 'enviada' and a.lead_id in (select id from public.leads where campanha_id = c.id)) as convites,
            count(l.id) filter (where l.estado in ('em_conversa', 'escalado_humano', 'qualificado'))::int as conversas,
            count(l.id) filter (where l.estado = 'reuniao_marcada')::int as reunioes
       from public.campanhas c
       join public.perfis pf on pf.id = c.perfil_id
       left join public.publicos pu on pu.id = c.publico_id
       left join public.leads l on l.campanha_id = c.id
      where not pf.casa
      group by c.id, pu.nome, pf.nome
      order by c.status = 'encerrada', c.status = 'pausada', c.criado_em desc`,
  );
}

export type CampanhaDoPainel = {
  id: string;
  nome: string;
  status: StatusDaCampanha;
  perfilId: string;
  conta: string;
  contaAtiva: boolean;
  contaConectada: boolean;
  publicoId: string | null;
  publico: string | null;
  instrucoesSdr: string | null;
  angulo: string;
  nicho: string | null;
  modoCopy: "template" | "personalizada";
  maxLeads: number | null;
  permitidaEm: Date | null;
  permitidaPor: string | null;
  leads: { triagem: number; naFila: number; andamento: number };
};

export async function obterCampanha(db: Db, id: string): Promise<CampanhaDoPainel | null> {
  const [linha] = await db.query<CampanhaDoPainel>(
    `select c.id, c.nome, c.status, c.perfil_id as "perfilId", pf.nome as conta,
            pf.status = 'ativo' as "contaAtiva", pf.unipile_account_id is not null as "contaConectada",
            c.publico_id as "publicoId", pu.nome as publico, c.instrucoes_sdr as "instrucoesSdr",
            c.angulo, c.nicho, c.modo_copy as "modoCopy", c.max_leads as "maxLeads",
            c.permitida_em as "permitidaEm", o.nome as "permitidaPor",
            json_build_object(
              'triagem', (select count(*)::int from public.leads l where l.campanha_id = c.id and l.estado = 'triagem'),
              'naFila', (select count(*)::int from public.leads l where l.campanha_id = c.id and l.estado = 'na_fila'),
              'andamento', (select count(*)::int from public.leads l where l.campanha_id = c.id
                              and l.estado not in ('triagem', 'rejeitado', 'importado', 'na_fila'))
            ) as leads
       from public.campanhas c
       join public.perfis pf on pf.id = c.perfil_id
       left join public.publicos pu on pu.id = c.publico_id
       left join public.operadores o on o.id = c.permitida_por
      where c.id = $1::uuid and not pf.casa`,
    [id],
  );
  return linha ?? null;
}

export type ResultadoDosTextos = { ok: true } | { ok: false; erro: string; problemas: ProblemaDoBloco[] };

/**
 * Grava os textos da linha do tempo (§4.11). Cada texto passa pelo validador
 * antes; com lead andando no fluxo, nasce uma versão nova para quem entrar
 * depois e ninguém muda no meio do caminho.
 */
export async function salvarTextosDaCampanha(
  db: Db,
  p: { campanhaId: string; textos: Record<string, string>; operadorId: string; agora: Date },
): Promise<ResultadoDosTextos> {
  const [campanha] = await db.query<{ perfil_id: string; status: StatusDaCampanha }>(
    "select perfil_id, status from public.campanhas where id = $1::uuid",
    [p.campanhaId],
  );
  if (!campanha) return { ok: false, erro: "Campanha não encontrada.", problemas: [] };
  if (campanha.status === "encerrada") return { ok: false, erro: "Campanha encerrada não muda de texto.", problemas: [] };
  const atual = await fluxoDaCampanha(db, p.campanhaId);
  if (!atual) return { ok: false, erro: "A campanha não tem fluxo.", problemas: [] };

  const fluxo = fluxoComTextosNovos(atual, p.textos);
  // Texto em branco pode ficar no rascunho: a ativação barra (problemasParaAtivar).
  const comProblema = validarCopyDoFluxo(fluxo, await contextoDoPerfil(db, campanha.perfil_id), await lerConfiguracao(db, "template_exemplo"))
    .map((problema) => ({ ...problema, violacoes: problema.violacoes.filter((violacao) => violacao.regra !== "vazio") }))
    .filter((problema) => problema.violacoes.length > 0);
  if (comProblema.length > 0) return { ok: false, erro: "Corrija os textos marcados antes de salvar.", problemas: comProblema };

  await db.transacao(async (tx) => {
    await salvarFluxo(tx, { campanhaId: p.campanhaId, fluxo, operadorId: p.operadorId });
    await registrarEvento(tx, {
      tipo: "campanha_editada",
      entidade: "campanha",
      entidadeId: p.campanhaId,
      perfilId: campanha.perfil_id,
      payload: { textos: Object.keys(p.textos) },
      ator: p.operadorId,
      em: p.agora,
    });
  });
  return { ok: true };
}

export const LIMITE_DAS_INSTRUCOES = 1000;

/** Instruções do SDR que valem só nesta campanha (§4.11), por cima do SDR da organização. */
export async function salvarInstrucoesDoSdr(
  db: Db,
  p: { campanhaId: string; texto: string; operadorId: string; agora: Date },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const texto = p.texto.trim();
  if (texto.length > LIMITE_DAS_INSTRUCOES) return { ok: false, erro: `No máximo ${LIMITE_DAS_INSTRUCOES} caracteres.` };
  const [campanha] = await db.query<{ perfil_id: string }>(
    "update public.campanhas set instrucoes_sdr = $2 where id = $1::uuid returning perfil_id",
    [p.campanhaId, texto || null],
  );
  if (!campanha) return { ok: false, erro: "Campanha não encontrada." };
  await registrarEvento(db, {
    tipo: "instrucoes_do_sdr",
    entidade: "campanha",
    entidadeId: p.campanhaId,
    perfilId: campanha.perfil_id,
    payload: { tamanho: texto.length },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}
