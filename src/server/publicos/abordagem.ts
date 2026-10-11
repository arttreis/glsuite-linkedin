import { fluxoPadrao } from "@/domain/fluxo";
import { posT4DaPraca } from "@/domain/sequencia";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { salvarFluxo } from "@/server/fluxo/fluxos";
import { publicoParaCampanha, type Resultado } from "./publicos";

export type CampanhaDoPublico = {
  id: string;
  nome: string;
  status: "rascunho" | "ativa" | "pausada" | "encerrada";
  /** Leads por estado, para as abas Leads e Abordagem. */
  emTriagem: number;
  naRegua: number;
  emConversa: number;
  aguardandoAprovacao: number;
};

/** Uma conta do LinkedIn que pode trabalhar o público, com a campanha dela, se já existir. */
export type ContaDoPublico = {
  perfilId: string;
  nome: string;
  status: "ativo" | "pausado";
  conectado: boolean;
  campanha: CampanhaDoPublico | null;
};

/**
 * As contas que trabalham o público: as da praça dele que o operador opera
 * (§4.13). Roda como o operador.
 */
export async function contasDoPublico(db: Db, publicoId: string): Promise<ContaDoPublico[]> {
  const linhas = await db.query<{
    perfil_id: string;
    nome: string;
    status: "ativo" | "pausado";
    conectado: boolean;
    campanha_id: string | null;
    campanha_nome: string | null;
    campanha_status: CampanhaDoPublico["status"] | null;
    em_triagem: number;
    na_regua: number;
    em_conversa: number;
    aguardando: number;
  }>(
    `select pf.id as perfil_id, pf.nome, pf.status, pf.unipile_account_id is not null as conectado,
            c.id as campanha_id, c.nome as campanha_nome, c.status as campanha_status,
            (select count(*) from public.leads l where l.campanha_id = c.id and l.estado = 'triagem')::int as em_triagem,
            (select count(*) from public.leads l where l.campanha_id = c.id
               and l.estado in ('na_fila', 'convite_enviado', 'aceito', 'em_sequencia'))::int as na_regua,
            (select count(*) from public.leads l where l.campanha_id = c.id and l.estado = 'em_conversa')::int as em_conversa,
            (select count(*) from public.acoes a join public.leads l on l.id = a.lead_id
              where l.campanha_id = c.id and a.status = 'aguardando_aprovacao')::int as aguardando
       from public.publicos pu
       join public.perfis pf on pf.organizacao_id = pu.organizacao_id
       left join public.campanhas c on c.publico_id = pu.id and c.perfil_id = pf.id
      where pu.id = $1::uuid and public.pode_ver_perfil(pf.id) and not pf.casa
      order by array_position(array['arthur', 'juliano', 'luiz', 'jp'], pf.slug), pf.nome`,
    [publicoId],
  );
  return linhas.map((l) => ({
    perfilId: l.perfil_id,
    nome: l.nome,
    status: l.status,
    conectado: l.conectado,
    campanha:
      l.campanha_id && l.campanha_nome && l.campanha_status
        ? {
            id: l.campanha_id,
            nome: l.campanha_nome,
            status: l.campanha_status,
            emTriagem: l.em_triagem,
            naRegua: l.na_regua,
            emConversa: l.em_conversa,
            aguardandoAprovacao: l.aguardando,
          }
        : null,
  }));
}

/** Nome livre para a campanha no perfil: o do público, com um número se já houver outra igual. */
async function nomeLivre(db: Db, perfilId: string, nome: string): Promise<string> {
  const usados = new Set(
    (await db.query<{ nome: string }>("select nome from public.campanhas where perfil_id = $1::uuid", [perfilId])).map((c) => c.nome),
  );
  if (!usados.has(nome)) return nome;
  for (let n = 2; ; n++) if (!usados.has(`${nome} (${n})`)) return `${nome} (${n})`;
}

/**
 * "Começar a abordar" (§4.13): campanha = público × conta. Só público
 * escolhido e só conta da praça dele. A campanha herda nome, nicho e ângulo do
 * público e nasce em rascunho com o fluxo padrão de 4 toques; o fluxo gerado
 * para o público vem no SDR-29. Se o par já tem campanha, devolve ela. Roda
 * como o operador.
 */
export async function comecarAAbordar(
  db: Db,
  p: { publicoId: string; perfilId: string; operadorId: string; agora: Date },
): Promise<Resultado<{ campanhaId: string; criada: boolean }>> {
  const publico = await publicoParaCampanha(db, p.publicoId);
  if (!publico) return { ok: false, erro: "Escolha o público antes de começar a abordar." };

  const conta = (await contasDoPublico(db, p.publicoId)).find((c) => c.perfilId === p.perfilId);
  if (!conta) return { ok: false, erro: "Você não opera esta conta." };
  if (conta.campanha) return { ok: true, campanhaId: conta.campanha.id, criada: false };

  const [criada] = await db.query<{ id: string }>(
    `insert into public.campanhas (nome, angulo, nicho, modo_copy, max_leads, perfil_id, pos_t4, criado_por, sequencia, publico_id)
     values ($1, $2, $3, 'template', null, $4::uuid, $5, $6::uuid, '[]'::jsonb, $7::uuid)
     returning id`,
    [
      await nomeLivre(db, p.perfilId, publico.nome),
      publico.angulo,
      publico.nome,
      p.perfilId,
      posT4DaPraca("domestico"),
      p.operadorId,
      publico.id,
    ],
  );
  await salvarFluxo(db, { campanhaId: criada!.id, fluxo: fluxoPadrao("domestico"), operadorId: p.operadorId });
  await registrarEvento(db, {
    tipo: "campanha_criada",
    entidade: "campanha",
    entidadeId: criada!.id,
    perfilId: p.perfilId,
    payload: { nome: publico.nome, angulo: publico.angulo, publico_id: publico.id },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true, campanhaId: criada!.id, criada: true };
}
