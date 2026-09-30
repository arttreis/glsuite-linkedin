import { aberturaDoProximoDiaUtil, limitesDoDia, proximaAbertura, type Feriados } from "@/domain/calendario";
import type { EstadoDoLead } from "@/domain/estados";
import type { Toque } from "@/domain/validador";
import { enviarParaRevisao, prepararTexto } from "@/server/acoes/texto";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { temOptout } from "@/server/triagem/regras";
import { contarEnvios, saldoDoPerfil, type PerfilDoDespachante } from "./perfis";

export type TipoDeAcao = "convite" | "dm" | "retirar_convite";

export type Reserva = {
  id: string;
  lead_id: string;
  tipo: TipoDeAcao;
  toque: Toque | null;
  origem: "template" | "ia" | "humano";
  tentativas: number;
  texto: string | null;
  provider_id: string;
  chat_id: string | null;
  convite_id: string | null;
};

export type ContextoDaReserva = { agora: Date; feriados: Feriados; cooldownDias: number };

/** Em que estado o lead precisa estar para cada ação sair (§5.1, passo 4). */
export function estadosPermitidos(acao: { tipo: string; toque: string | null }): EstadoDoLead[] {
  if (acao.tipo === "convite") return ["na_fila"];
  if (acao.tipo === "retirar_convite") return ["convite_enviado"];
  if (acao.tipo === "dm" && acao.toque) return ["aceito", "em_sequencia"];
  if (acao.tipo === "dm") return ["em_conversa", "qualificado", "reuniao_marcada", "escalado_humano"];
  return [];
}

type Decisao = { tipo: "cancelar"; motivo: string } | { tipo: "reagendar"; para: Date; motivo: string };

type Candidata = Omit<Reserva, "texto">;

/**
 * Revalida antes de enviar (§5.1, passo 4): o lead ainda está na régua? a
 * pessoa não pediu opt-out? ninguém a tocou hoje? a empresa não está em
 * cooldown? E, na Espanha, DM nunca é automática (§4.5).
 */
async function revalidar(
  tx: Db,
  acao: Candidata,
  perfil: PerfilDoDespachante,
  ctx: ContextoDaReserva,
): Promise<Decisao | null> {
  const [lead] = await tx.query<{
    estado: EstadoDoLead;
    angulo: string | null;
    pessoa_id: string;
    optout_em: Date | null;
    empresa_chave: string | null;
  }>(
    `select l.estado, l.angulo, pe.id as pessoa_id, pe.optout_em, pe.empresa_chave
       from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
      where l.id = $1::uuid
      for update of l`,
    [acao.lead_id],
  );
  if (!lead) return { tipo: "cancelar", motivo: "lead não existe" };
  if (!estadosPermitidos(acao).includes(lead.estado)) {
    return { tipo: "cancelar", motivo: `lead fora da régua (${lead.estado})` };
  }
  if (lead.optout_em || (await temOptout(tx, acao.provider_id))) return { tipo: "cancelar", motivo: "opt-out" };
  if (perfil.praca === "espanha" && acao.tipo === "dm" && acao.origem !== "humano") {
    return { tipo: "cancelar", motivo: "Espanha: DM é manual, nunca automática (§4.5)" };
  }
  if (acao.toque && !lead.angulo) return { tipo: "cancelar", motivo: "toque sem ângulo registrado" };

  if (acao.toque) {
    const { inicio, fim } = limitesDoDia(ctx.agora, perfil.fuso);
    const [tocadaHoje] = await tx.query(
      `select 1
         from public.acoes a join public.leads l on l.id = a.lead_id
        where l.pessoa_id = $1::uuid and a.id <> $2::uuid and a.toque is not null
          and a.status in ('enviada', 'enviando')
          and coalesce(a.enviada_em, a.atualizada_em) >= $3 and coalesce(a.enviada_em, a.atualizada_em) < $4
        limit 1`,
      [lead.pessoa_id, acao.id, inicio, fim],
    );
    if (tocadaHoje) {
      return {
        tipo: "reagendar",
        para: aberturaDoProximoDiaUtil(ctx.agora, perfil.fuso, perfil.janela, ctx.feriados),
        motivo: "pessoa já recebeu um toque hoje",
      };
    }
  }

  if (acao.tipo === "convite" && lead.empresa_chave && ctx.cooldownDias > 0) {
    const [toque] = await tx.query<{ em: Date | null }>(
      `select max(l.ultimo_toque_em) as em
         from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
        where pe.empresa_chave = $1 and l.perfil_id <> $2::uuid
          and l.ultimo_toque_em > $3::timestamptz - make_interval(days => $4::int)`,
      [lead.empresa_chave, perfil.id, ctx.agora, ctx.cooldownDias],
    );
    if (toque?.em) {
      const fimDoCooldown = new Date(new Date(toque.em).getTime() + ctx.cooldownDias * 86_400_000);
      return {
        tipo: "reagendar",
        para: proximaAbertura(fimDoCooldown, perfil.fuso, perfil.janela, ctx.feriados),
        motivo: "empresa em cooldown: outro perfil da casa tocou alguém de lá",
      };
    }
  }
  return null;
}

async function aplicarDecisao(tx: Db, acao: Candidata, perfil: PerfilDoDespachante, decisao: Decisao, agora: Date) {
  if (decisao.tipo === "cancelar") {
    await tx.query("update public.acoes set status = 'cancelada', erro = $2 where id = $1::uuid", [acao.id, decisao.motivo]);
  } else {
    await tx.query("update public.acoes set agendada_para = $2, erro = $3 where id = $1::uuid", [
      acao.id,
      decisao.para,
      decisao.motivo,
    ]);
  }
  await registrarEvento(tx, {
    tipo: decisao.tipo === "cancelar" ? "acao_cancelada" : "acao_reagendada",
    entidade: "acao",
    entidadeId: acao.id,
    perfilId: perfil.id,
    payload: { motivo: decisao.motivo, ...(decisao.tipo === "reagendar" ? { para: decisao.para.toISOString() } : {}) },
    em: agora,
  });
}

type Passo = { reserva: Reserva } | { fim: "perfil_pausado" | "sem_saldo" | "nada_a_fazer" } | { proxima: true };

/**
 * Reserva a próxima ação do perfil (§5.1, passos 2 a 4). Tudo numa transação
 * com a linha do perfil travada: dois ticks nunca calculam o mesmo saldo ao
 * mesmo tempo, e a ação reservada sai da fila (`enviando`) antes do envio.
 * Ordem: respostas de conversa, DMs da régua, convites, retiradas.
 */
export async function reservarProximaAcao(
  db: Db,
  perfil: PerfilDoDespachante,
  ctx: ContextoDaReserva,
): Promise<{ reserva: Reserva } | { nada: "perfil_pausado" | "sem_saldo" | "nada_a_fazer" }> {
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    const passo = await db.transacao<Passo>(async (tx) => {
      const [ativo] = await tx.query("select 1 from public.perfis where id = $1::uuid and status = 'ativo' for update", [
        perfil.id,
      ]);
      if (!ativo) return { fim: "perfil_pausado" };

      const saldo = saldoDoPerfil(perfil, await contarEnvios(tx, perfil, ctx.agora), ctx.agora);
      const tipos: TipoDeAcao[] = ["retirar_convite"];
      if (saldo.dms > 0) tipos.push("dm");
      if (saldo.convites > 0) tipos.push("convite");

      const [acao] = await tx.query<Candidata>(
        `select a.id, a.lead_id, a.tipo, a.toque, a.origem, a.tentativas,
                pe.provider_id, l.chat_id, l.convite_id
           from public.acoes a
           join public.leads l on l.id = a.lead_id
           join public.campanhas c on c.id = l.campanha_id
           join public.pessoas pe on pe.id = l.pessoa_id
          where a.perfil_id = $1::uuid
            and a.status = 'pendente'
            and a.agendada_para <= $2::timestamptz
            and a.tipo = any($3::text[])
            and (a.toque is null or c.status = 'ativa')
            and not (a.origem = 'ia' and a.texto_final is null)
          order by (a.toque is null) desc,
                   case a.tipo when 'dm' then 0 when 'convite' then 1 else 2 end,
                   a.agendada_para, a.criada_em
          limit 1
          for update of a skip locked`,
        [perfil.id, ctx.agora, tipos],
      );
      if (!acao) return { fim: saldo.convites === 0 && saldo.dms === 0 ? "sem_saldo" : "nada_a_fazer" };

      const decisao = await revalidar(tx, acao, perfil, ctx);
      if (decisao) {
        await aplicarDecisao(tx, acao, perfil, decisao, ctx.agora);
        return { proxima: true };
      }

      let texto: string | null = null;
      if (acao.tipo === "convite" || acao.tipo === "dm") {
        const preparado = await prepararTexto(tx, acao.id);
        if (!preparado.ok) {
          await enviarParaRevisao(tx, acao.id, preparado.violacoes, preparado.texto);
          await registrarEvento(tx, {
            tipo: "acao_em_revisao",
            entidade: "acao",
            entidadeId: acao.id,
            perfilId: perfil.id,
            payload: { violacoes: preparado.violacoes },
            em: ctx.agora,
          });
          return { proxima: true };
        }
        texto = preparado.texto;
      }

      await tx.query(
        `update public.acoes
            set status = 'enviando', tentativas = tentativas + 1, texto_final = coalesce($2, texto_final)
          where id = $1::uuid`,
        [acao.id, texto],
      );
      return { reserva: { ...acao, tentativas: acao.tentativas + 1, texto } };
    });

    if ("reserva" in passo) return passo;
    if ("fim" in passo) return { nada: passo.fim };
  }
  return { nada: "nada_a_fazer" };
}
