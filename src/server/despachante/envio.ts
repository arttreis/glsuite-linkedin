import { aberturaDoProximoDiaUtil, dataLocal, somarDiasUteis, sortearIntervalo, type Feriados } from "@/domain/calendario";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { lerConfiguracao } from "@/server/configuracoes";
import { aoRetirarConvite, aposAcao, prazoDoConvite } from "@/server/fluxo/motor";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { avaliarErrosDeLimite } from "@/server/guardas/guardas";
import { transicionarLead } from "@/server/leads/transicoes";
import { pausarPerfil } from "@/server/perfis/pausa";
import { enfileirarEventoRd } from "@/server/rd/sincronizar";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { classificarErro, ErroUnipile } from "@/server/unipile/erros";
import type { PerfilDoDespachante } from "./perfis";
import { estadosPermitidos, type Reserva } from "./reserva";

export type DependenciasDoEnvio = {
  db: Db;
  unipile: ClienteUnipile;
  agora: Date;
  aleatorio: () => number;
  feriados: Feriados;
  /**
   * Checagem de última hora antes de uma DM da régua: a pessoa respondeu e o
   * webhook ainda não chegou? Se sim, a DM não sai (SDR-07).
   */
  verificarResposta?: (perfil: PerfilDoDespachante, reserva: Reserva) => Promise<boolean>;
};

export type ResultadoDoEnvio =
  | { resultado: "enviada"; acaoId: string }
  | { resultado: "cancelada"; acaoId: string; motivo: string }
  | { resultado: "erro"; acaoId: string; classe: string; motivo: string };

const AUTOR_POR_ORIGEM = { template: "sistema", ia: "ia", humano: "humano" } as const;

async function marcarProximaAcao(deps: DependenciasDoEnvio, perfil: PerfilDoDespachante) {
  const minutos = sortearIntervalo(perfil.janela, deps.aleatorio);
  await deps.db.query("update public.perfis set proxima_acao_apos = $2 where id = $1::uuid", [
    perfil.id,
    new Date(deps.agora.getTime() + minutos * 60_000),
  ]);
}

type ResultadoUnipile = { providerMessageId: string | null; chatId?: string | null };

async function chamarUnipile(unipile: ClienteUnipile, perfil: PerfilDoDespachante, reserva: Reserva): Promise<ResultadoUnipile> {
  const accountId = perfil.unipile_account_id;
  if (reserva.tipo === "convite") {
    const { invitationId } = await unipile.enviarConvite({
      accountId,
      providerId: reserva.provider_id,
      mensagem: reserva.texto?.trim() ? reserva.texto : undefined,
    });
    return { providerMessageId: invitationId };
  }
  if (reserva.tipo === "retirar_convite") {
    if (!reserva.convite_id) throw new ErroUnipile({ status: 400, tipo: "sem_convite", titulo: "lead sem id de convite" });
    await unipile.cancelarConvite(accountId, reserva.convite_id);
    return { providerMessageId: null };
  }
  if (reserva.chat_id) {
    const { messageId } = await unipile.enviarMensagem({ accountId, chatId: reserva.chat_id, texto: reserva.texto ?? "" });
    return { providerMessageId: messageId, chatId: reserva.chat_id };
  }
  const { chatId, messageId } = await unipile.iniciarConversa({
    accountId,
    providerId: reserva.provider_id,
    texto: reserva.texto ?? "",
  });
  return { providerMessageId: messageId, chatId };
}

/**
 * Grava o envio e anda o fluxo (§5.1, passo 5): convite → retirada no fim do
 * prazo de aceite; mensagem → o bloco seguinte do fluxo; convite retirado →
 * a saída "não" da condição de aceite.
 */
export async function registrarSucesso(
  db: Db,
  p: { perfil: PerfilDoDespachante; reserva: Reserva; resultado: ResultadoUnipile; agora: Date; feriados: Feriados },
): Promise<void> {
  const { perfil, reserva, resultado, agora } = p;
  await db.transacao(async (tx) => {
    await tx.query(
      `update public.acoes
          set status = 'enviada', enviada_em = $2, provider_message_id = $3, erro = null
        where id = $1::uuid`,
      [reserva.id, agora, resultado.providerMessageId],
    );

    if (reserva.tipo === "convite") {
      await tx.query(
        `update public.leads
            set convite_enviado_em = $2, convite_id = $3, passo_atual = coalesce($4, 'T1'), ultimo_toque_em = $2
          where id = $1::uuid`,
        [reserva.lead_id, agora, resultado.providerMessageId, reserva.toque],
      );
      await transicionarLead(tx, { leadId: reserva.lead_id, para: "convite_enviado", ator: "despachante", agora });
      const proximoPasso = { texto: "Acompanhar o aceite do convite", data: somarDiasUteis(dataLocal(agora, perfil.fuso), 5, p.feriados) };
      await tx.query("update public.leads set proximo_passo = $2, proximo_passo_em = $3::date where id = $1::uuid", [
        reserva.lead_id,
        proximoPasso.texto,
        proximoPasso.data,
      ]);
      await enfileirarEventoRd(tx, {
        leadId: reserva.lead_id,
        etapa: "02",
        dados: { proximo_passo: proximoPasso.texto, proximo_passo_em: proximoPasso.data },
      });
      await agendarAcao(tx, {
        leadId: reserva.lead_id,
        perfilId: perfil.id,
        tipo: "retirar_convite",
        toque: null,
        origem: "template",
        agendadaPara: await prazoDoConvite(tx, { perfil, leadId: reserva.lead_id, toque: reserva.toque, agora, feriados: p.feriados }),
        chave: chaveDoToque(reserva.lead_id, "retirar"),
      });
    } else if (reserva.tipo === "retirar_convite") {
      await tx.query("update public.leads set convite_id = null where id = $1::uuid", [reserva.lead_id]);
      await transicionarLead(tx, {
        leadId: reserva.lead_id,
        para: "convite_retirado",
        ator: "despachante",
        agora,
        motivo: "convite pendente além do prazo",
      });
      await aoRetirarConvite(tx, { perfil, leadId: reserva.lead_id, agora, ator: "despachante" });
    } else {
      await tx.query(
        `insert into public.mensagens (lead_id, perfil_id, pessoa_id, acao_id, chat_id, direcao, autor, texto, provider_message_id, em)
         select l.id, l.perfil_id, l.pessoa_id, $2::uuid, $3, 'saida', $4, $5, $6, $7
           from public.leads l where l.id = $1::uuid
         on conflict (provider_message_id) do nothing`,
        [reserva.lead_id, reserva.id, resultado.chatId ?? null, AUTOR_POR_ORIGEM[reserva.origem], reserva.texto ?? "", resultado.providerMessageId, agora],
      );
      await tx.query(
        `update public.leads
            set chat_id = coalesce(chat_id, $2), ultimo_toque_em = case when $3::text is null then ultimo_toque_em else $4 end,
                passo_atual = coalesce($3, passo_atual)
          where id = $1::uuid`,
        [reserva.lead_id, resultado.chatId ?? null, reserva.toque, agora],
      );
      if (reserva.toque) {
        await aposAcao(tx, { perfil, leadId: reserva.lead_id, toque: reserva.toque, agora, feriados: p.feriados, ator: "despachante" });
      }
    }

    await registrarEvento(tx, {
      tipo: "acao_enviada",
      entidade: "acao",
      entidadeId: reserva.id,
      perfilId: perfil.id,
      payload: { tipo: reserva.tipo, toque: reserva.toque, lead_id: reserva.lead_id },
      ator: "despachante",
      em: agora,
    });
  });
}

/**
 * Erro no envio (§5.1, reenvio):
 * - transitório: nova tentativa com backoff exponencial, máx. 3;
 * - limite do LinkedIn: volta para a fila no próximo dia útil e conta para a
 *   regra de parada (§4.4);
 * - conta: pausa o perfil na hora;
 * - permanente: a ação falha e o lead vai para revisão.
 */
export async function registrarFalha(
  deps: DependenciasDoEnvio,
  perfil: PerfilDoDespachante,
  reserva: Reserva,
  erro: unknown,
): Promise<ResultadoDoEnvio> {
  const { db, agora } = deps;
  const classe = classificarErro(erro);
  const motivo = erro instanceof ErroUnipile ? `${erro.status} ${erro.tipo}: ${erro.message}` : String((erro as Error)?.message ?? erro);
  const reenvio = await lerConfiguracao(db, "reenvio");
  const limparTexto = reserva.origem === "template";

  await db.transacao(async (tx) => {
    if (classe === "transitorio" && reserva.tentativas < reenvio.max_tentativas) {
      const espera = reenvio.backoff_minutos * 2 ** (reserva.tentativas - 1);
      await tx.query(
        `update public.acoes set status = 'pendente', agendada_para = $2, erro = $3,
                texto_final = case when $4::boolean then null else texto_final end
          where id = $1::uuid`,
        [reserva.id, new Date(agora.getTime() + espera * 60_000), motivo, limparTexto],
      );
    } else if (classe === "limite") {
      await tx.query(
        `update public.acoes set status = 'pendente', agendada_para = $2, erro = $3, tentativas = tentativas - 1,
                texto_final = case when $4::boolean then null else texto_final end
          where id = $1::uuid`,
        [reserva.id, aberturaDoProximoDiaUtil(agora, perfil.fuso, perfil.janela, deps.feriados), motivo, limparTexto],
      );
      await registrarEvento(tx, {
        tipo: "erro_limite",
        entidade: "perfil",
        entidadeId: perfil.id,
        perfilId: perfil.id,
        payload: { acao_id: reserva.id, erro: motivo },
        em: agora,
      });
      // Repetiu? Pausa já, sem esperar o próximo tick (§4.4).
      await avaliarErrosDeLimite(tx, perfil.id, agora);
    } else if (classe === "conta") {
      await tx.query(
        `update public.acoes set status = 'pendente', erro = $2, tentativas = tentativas - 1,
                texto_final = case when $3::boolean then null else texto_final end
          where id = $1::uuid`,
        [reserva.id, motivo, limparTexto],
      );
      await pausarPerfil(tx, {
        perfilId: perfil.id,
        motivo: `A Unipile recusou por problema na conta (${erro instanceof ErroUnipile ? erro.tipo : "desconhecido"}). Confira a conexão, checkpoint ou captcha.`,
        ator: "despachante",
        agora,
      });
    } else {
      await tx.query("update public.acoes set status = 'falhou', erro = $2 where id = $1::uuid", [reserva.id, motivo]);
      await tx.query("update public.leads set revisao_motivo = $2 where id = $1::uuid", [
        reserva.lead_id,
        `Envio falhou: ${motivo}`,
      ]);
      await registrarEvento(tx, {
        tipo: "acao_falhou",
        entidade: "acao",
        entidadeId: reserva.id,
        perfilId: perfil.id,
        payload: { erro: motivo, classe, lead_id: reserva.lead_id },
        em: agora,
      });
    }
  });

  if (classe !== "transitorio") await marcarProximaAcao(deps, perfil);
  return { resultado: "erro", acaoId: reserva.id, classe, motivo };
}

/** Envia a ação reservada. A última checagem de estado acontece aqui, colada ao envio. */
export async function executarReserva(
  deps: DependenciasDoEnvio,
  perfil: PerfilDoDespachante,
  reserva: Reserva,
): Promise<ResultadoDoEnvio> {
  const cancelar = async (motivo: string): Promise<ResultadoDoEnvio> => {
    await deps.db.query("update public.acoes set status = 'cancelada', erro = $2 where id = $1::uuid", [reserva.id, motivo]);
    return { resultado: "cancelada", acaoId: reserva.id, motivo };
  };

  const [lead] = await deps.db.query<{ estado: string }>("select estado from public.leads where id = $1::uuid", [reserva.lead_id]);
  if (!lead || !(estadosPermitidos(reserva) as string[]).includes(lead.estado)) {
    return cancelar(`lead saiu da régua antes do envio (${lead?.estado ?? "removido"})`);
  }

  let resultado: ResultadoUnipile;
  try {
    if (reserva.tipo === "dm" && reserva.toque && deps.verificarResposta && (await deps.verificarResposta(perfil, reserva))) {
      return cancelar("a pessoa respondeu antes do envio");
    }
    resultado = await chamarUnipile(deps.unipile, perfil, reserva);
  } catch (erro) {
    return registrarFalha(deps, perfil, reserva, erro);
  }
  await registrarSucesso(deps.db, { perfil, reserva, resultado, agora: deps.agora, feriados: deps.feriados });
  await marcarProximaAcao(deps, perfil);
  return { resultado: "enviada", acaoId: reserva.id };
}
