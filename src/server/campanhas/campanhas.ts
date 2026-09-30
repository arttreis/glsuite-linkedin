import { z } from "zod";
import { validarCopyDaSequencia, type ProblemaDoPasso } from "@/domain/campanha";
import { posT4DaPraca, sequencia } from "@/domain/sequencia";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { contextoDoPerfil } from "./perfil";

export const entradaDeCampanha = z.object({
  id: z.uuid().optional(),
  perfilId: z.uuid(),
  nome: z.string().trim().min(3).max(120),
  angulo: z.string().min(1),
  nicho: z.string().trim().max(120).nullable(),
  modoCopy: z.enum(["template", "personalizada"]),
  maxLeads: z.number().int().positive().nullable(),
  sequencia,
});

export type EntradaDeCampanha = z.input<typeof entradaDeCampanha>;

export type ResultadoDoSalvamento =
  | { ok: true; campanhaId: string }
  | { ok: false; erros: string[]; problemas: ProblemaDoPasso[] };

/**
 * Cria ou edita uma campanha. A copy de cada toque passa pelo validador antes
 * de salvar (§9 SDR-05): travessão, palavra proibida, URL e excesso de
 * caracteres bloqueiam o salvamento com a mensagem de cada regra.
 * O pós-T4 vem da praça do perfil (§4.5).
 */
export async function salvarCampanha(
  db: Db,
  entrada: EntradaDeCampanha,
  p: { operadorId: string; agora: Date },
): Promise<ResultadoDoSalvamento> {
  const dados = entradaDeCampanha.safeParse(entrada);
  if (!dados.success) {
    return { ok: false, erros: dados.error.issues.map((issue) => issue.message), problemas: [] };
  }
  const campanha = dados.data;

  const [angulo] = await db.query("select 1 from public.angulos where nome = $1 and ativo", [campanha.angulo]);
  if (!angulo) return { ok: false, erros: [`Ângulo fora da lista fechada: ${campanha.angulo}`], problemas: [] };

  const perfil = await contextoDoPerfil(db, campanha.perfilId);
  const exemplo = await lerConfiguracao(db, "template_exemplo");
  const problemas = validarCopyDaSequencia(campanha.sequencia, perfil, exemplo, {
    t1PelaIa: campanha.modoCopy === "personalizada",
  });
  if (problemas.some((problema) => problema.violacoes.length > 0)) {
    return { ok: false, erros: ["A copy tem problemas: corrija antes de salvar."], problemas };
  }

  const valores = [
    campanha.nome,
    campanha.angulo,
    campanha.nicho,
    campanha.modoCopy,
    JSON.stringify(campanha.sequencia),
    campanha.maxLeads,
  ];

  return db.transacao(async (tx) => {
    let campanhaId: string;
    if (campanha.id) {
      const [atualizada] = await tx.query<{ id: string }>(
        `update public.campanhas
            set nome = $2, angulo = $3, nicho = $4, modo_copy = $5, sequencia = $6::jsonb, max_leads = $7
          where id = $1::uuid and perfil_id = $8::uuid
          returning id`,
        [campanha.id, ...valores, campanha.perfilId],
      );
      if (!atualizada) return { ok: false as const, erros: ["Campanha não encontrada neste perfil."], problemas: [] };
      campanhaId = atualizada.id;
    } else {
      const [criada] = await tx.query<{ id: string }>(
        `insert into public.campanhas (nome, angulo, nicho, modo_copy, sequencia, max_leads, perfil_id, pos_t4, criado_por)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7::uuid, $8, $9::uuid)
         returning id`,
        [...valores, campanha.perfilId, posT4DaPraca(perfil.praca), p.operadorId],
      );
      campanhaId = criada!.id;
    }
    await registrarEvento(tx, {
      tipo: campanha.id ? "campanha_editada" : "campanha_criada",
      entidade: "campanha",
      entidadeId: campanhaId,
      perfilId: campanha.perfilId,
      payload: { nome: campanha.nome, angulo: campanha.angulo },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true as const, campanhaId };
  });
}

export type StatusDaCampanha = "rascunho" | "ativa" | "pausada" | "encerrada";

/**
 * Ativa, pausa ou encerra. Encerrar cancela as ações que ainda não saíram;
 * os leads ficam no estado em que estão (histórico).
 */
export async function mudarStatusDaCampanha(
  db: Db,
  p: { campanhaId: string; status: StatusDaCampanha; operadorId: string; agora: Date },
): Promise<void> {
  await db.transacao(async (tx) => {
    const [campanha] = await tx.query<{ perfil_id: string; status: StatusDaCampanha }>(
      "select perfil_id, status from public.campanhas where id = $1::uuid for update",
      [p.campanhaId],
    );
    if (!campanha) throw new Error("Campanha não encontrada");
    if (campanha.status === "encerrada") throw new Error("Campanha encerrada não volta.");

    await tx.query("update public.campanhas set status = $2 where id = $1::uuid", [p.campanhaId, p.status]);
    if (p.status === "encerrada") {
      await tx.query(
        `update public.acoes a set status = 'cancelada', erro = 'campanha encerrada'
           from public.leads l
          where a.lead_id = l.id and l.campanha_id = $1::uuid
            and a.status in ('pendente', 'aguardando_aprovacao')`,
        [p.campanhaId],
      );
    }
    await registrarEvento(tx, {
      tipo: "campanha_status",
      entidade: "campanha",
      entidadeId: p.campanhaId,
      perfilId: campanha.perfil_id,
      payload: { de: campanha.status, para: p.status },
      ator: p.operadorId,
      em: p.agora,
    });
  });
}
