import { z } from "zod";
import type { ContextoDoPerfil } from "@/domain/campanha";
import {
  fluxo as esquemaDoFluxo,
  sequenciaParaFluxo,
  validarCopyDoFluxo,
  validarFluxo,
  type Fluxo,
  type ProblemaDoBloco,
  type ProblemaDoFluxo,
} from "@/domain/fluxo";
import { posT4DaPraca, sequencia } from "@/domain/sequencia";
import type { ValoresDoTemplate } from "@/domain/template";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { fluxoDaCampanha, salvarFluxo } from "@/server/fluxo/fluxos";
import { contextoDoPerfil } from "./perfil";

export const entradaDeCampanha = z.object({
  id: z.uuid().optional(),
  perfilId: z.uuid(),
  nome: z.string().trim().min(3).max(120),
  angulo: z.string().min(1),
  nicho: z.string().trim().max(120).nullable(),
  modoCopy: z.enum(["template", "personalizada"]),
  maxLeads: z.number().int().positive().nullable(),
  /** O fluxo montado no editor (SDR-21). */
  fluxo: esquemaDoFluxo.optional(),
  /** Entrada antiga: a sequência linear de toques, convertida para fluxo. */
  sequencia: sequencia.optional(),
}).refine((c) => c.fluxo || c.sequencia, { message: "A campanha precisa de um fluxo." });

export type EntradaDeCampanha = z.input<typeof entradaDeCampanha>;

export type ResultadoDoSalvamento =
  | { ok: true; campanhaId: string }
  | { ok: false; erros: string[]; problemas: ProblemaDoBloco[]; problemasDoFluxo?: ProblemaDoFluxo[] };

/** Forma do fluxo (§4.1) e copy de cada bloco; vazio quando pode ativar. */
export function problemasParaAtivar(
  f: Fluxo,
  perfil: ContextoDoPerfil,
  exemplo: ValoresDoTemplate,
): { fluxo: ProblemaDoFluxo[]; copy: ProblemaDoBloco[] } {
  return {
    fluxo: validarFluxo(f),
    copy: validarCopyDoFluxo(f, perfil, exemplo).filter((problema) => problema.violacoes.length > 0),
  };
}

/**
 * Cria ou edita uma campanha. A copy de cada bloco passa pelo validador antes
 * de salvar (§9 SDR-05): travessão, palavra proibida, URL e excesso de
 * caracteres bloqueiam o salvamento com a mensagem de cada regra. A forma do
 * fluxo também (§4.1): salvar fluxo inválido como rascunho é permitido, mas
 * ativar não. O pós-T4 da campanha vem da praça do perfil (§4.5) e é o
 * padrão do bloco Fim.
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

  // Campanha que nasceu de um público fica com o ângulo dele (§4.9); a criada à
  // mão escolhe da lista das campanhas antigas.
  const [doPublico] = campanha.id
    ? await db.query<{ angulo: string }>("select angulo from public.campanhas where id = $1::uuid and publico_id is not null", [campanha.id])
    : [];
  const angulo = doPublico?.angulo ?? campanha.angulo;
  if (!doPublico) {
    const [daLista] = await db.query("select 1 from public.angulos where nome = $1 and ativo", [angulo]);
    if (!daLista) return { ok: false, erros: [`Ângulo fora da lista fechada: ${angulo}`], problemas: [] };
  }

  const perfil = await contextoDoPerfil(db, campanha.perfilId);
  const exemplo = await lerConfiguracao(db, "template_exemplo");
  const fluxo = campanha.fluxo ?? sequenciaParaFluxo(campanha.sequencia!, posT4DaPraca(perfil.praca));
  const problemas = validarCopyDoFluxo(fluxo, perfil, exemplo);
  if (problemas.some((problema) => problema.violacoes.length > 0)) {
    return { ok: false, erros: ["A copy tem problemas: corrija antes de salvar."], problemas };
  }

  const valores = [campanha.nome, angulo, campanha.nicho, campanha.modoCopy, campanha.maxLeads];

  return db.transacao(async (tx) => {
    let campanhaId: string;
    if (campanha.id) {
      const [atualizada] = await tx.query<{ id: string }>(
        // A sequência antiga só muda pela entrada antiga: lead que entrou antes
        // do fluxo continua nela (§4.1).
        `update public.campanhas
            set nome = $2, angulo = $3, nicho = $4, modo_copy = $5, max_leads = $6,
                sequencia = coalesce($8::jsonb, sequencia)
          where id = $1::uuid and perfil_id = $7::uuid
          returning id`,
        [campanha.id, ...valores, campanha.perfilId, campanha.sequencia ? JSON.stringify(campanha.sequencia) : null],
      );
      if (!atualizada) return { ok: false as const, erros: ["Campanha não encontrada neste perfil."], problemas: [] };
      campanhaId = atualizada.id;
    } else {
      const [criada] = await tx.query<{ id: string }>(
        `insert into public.campanhas (nome, angulo, nicho, modo_copy, max_leads, perfil_id, pos_t4, criado_por, sequencia)
         values ($1, $2, $3, $4, $5, $6::uuid, $7, $8::uuid, $9::jsonb)
         returning id`,
        [...valores, campanha.perfilId, posT4DaPraca(perfil.praca), p.operadorId, JSON.stringify(campanha.sequencia ?? [])],
      );
      campanhaId = criada!.id;
    }
    await salvarFluxo(tx, { campanhaId, fluxo, operadorId: p.operadorId });
    await registrarEvento(tx, {
      tipo: campanha.id ? "campanha_editada" : "campanha_criada",
      entidade: "campanha",
      entidadeId: campanhaId,
      perfilId: campanha.perfilId,
      payload: { nome: campanha.nome, angulo },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true as const, campanhaId };
  });
}

export type StatusDaCampanha = "rascunho" | "ativa" | "pausada" | "encerrada";

export class ErroDeStatus extends Error {}

/**
 * Ativa, pausa ou encerra. Ativar exige fluxo válido e copy sem problema
 * (§4.1). Encerrar cancela as ações que ainda não saíram; os leads ficam no
 * estado em que estão (histórico).
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
    if (campanha.status === "encerrada") throw new ErroDeStatus("Campanha encerrada não volta.");
    if (p.status === "ativa") {
      const fluxo = await fluxoDaCampanha(tx, p.campanhaId);
      const { fluxo: forma, copy } = problemasParaAtivar(
        fluxo!,
        await contextoDoPerfil(tx, campanha.perfil_id),
        await lerConfiguracao(tx, "template_exemplo"),
      );
      if (forma.length > 0 || copy.length > 0) {
        const primeiro = forma[0]?.mensagem ?? copy[0]?.violacoes[0]?.mensagem;
        throw new ErroDeStatus(`O fluxo ainda não pode rodar: ${primeiro} Corrija no editor e ative de novo.`);
      }
    }

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
