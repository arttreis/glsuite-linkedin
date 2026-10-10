import { STATUS_SAUDAVEIS } from "@/domain/conta";
import { enfileirarAlerta } from "@/server/alertas/alertas";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

/**
 * Pausa o perfil (§4.4). Congela as ações sem mexer no estado dos leads: o
 * despachante simplesmente ignora perfil pausado. O dono do perfil e o Arthur
 * recebem alerta. Idempotente: pausar um perfil já pausado não gera novo evento
 * nem novo alerta.
 */
export async function pausarPerfil(
  db: Db,
  p: { perfilId: string; motivo: string; ator: string; agora: Date },
): Promise<boolean> {
  const pausados = await db.query<{ nome: string }>(
    `update public.perfis
        set status = 'pausado', motivo_pausa = $2, pausado_em = $3
      where id = $1::uuid and status = 'ativo'
      returning nome`,
    [p.perfilId, p.motivo, p.agora],
  );
  const [perfil] = pausados;
  if (!perfil) return false;
  await registrarEvento(db, {
    tipo: "perfil_pausado",
    entidade: "perfil",
    entidadeId: p.perfilId,
    perfilId: p.perfilId,
    payload: { motivo: p.motivo },
    ator: p.ator,
    em: p.agora,
  });
  await enfileirarAlerta(db, {
    chave: `pausa/${p.perfilId}/${p.agora.toISOString()}`,
    tipo: "perfil_pausado",
    perfilId: p.perfilId,
    assunto: `[SDR] Perfil ${perfil.nome} pausado`,
    texto: [
      `O perfil ${perfil.nome} foi pausado.`,
      ``,
      `Motivo: ${p.motivo}`,
      ``,
      `As ações ficam congeladas e o estado dos leads é preservado. Despausar é sempre manual, pelo painel.`,
    ].join("\n"),
  });
  return true;
}

export class ErroDeAtivacao extends Error {}

/**
 * Despausa (ou ativa pela primeira vez) o perfil. É sempre um ato humano,
 * registrado em `eventos` com o operador (§4.4). A primeira ativação marca o
 * início da "semana 1" da rampa (§4.3). O contador das guardas recomeça daqui.
 */
export async function despausarPerfil(
  db: Db,
  p: { perfilId: string; operadorId: string; agora: Date },
): Promise<{ primeiraAtivacao: boolean }> {
  return db.transacao(async (tx) => {
    const [perfil] = await tx.query<{
      status: string;
      unipile_account_id: string | null;
      unipile_status: string | null;
      ativado_em: Date | null;
      motivo_pausa: string | null;
      casa: boolean;
    }>(
      "select status, unipile_account_id, unipile_status, ativado_em, motivo_pausa, casa from public.perfis where id = $1::uuid for update",
      [p.perfilId],
    );
    if (!perfil) throw new ErroDeAtivacao("Perfil não encontrado.");
    if (perfil.casa) throw new ErroDeAtivacao("Esta é a conta da casa: ela só busca a prévia de leads e nunca ativa (§4.4).");
    if (perfil.status === "ativo") throw new ErroDeAtivacao("O perfil já está ativo.");
    if (!perfil.unipile_account_id) throw new ErroDeAtivacao("Conecte o LinkedIn do perfil antes de ativar.");
    if (perfil.unipile_status && !STATUS_SAUDAVEIS.has(perfil.unipile_status)) {
      throw new ErroDeAtivacao(`A conta está com status ${perfil.unipile_status} na Unipile. Reconecte antes de ativar.`);
    }

    const primeiraAtivacao = perfil.ativado_em === null;
    await tx.query(
      `update public.perfis
          set status = 'ativo', motivo_pausa = null, despausado_em = $2,
              ativado_em = coalesce(ativado_em, $2), proxima_acao_apos = null
        where id = $1::uuid`,
      [p.perfilId, p.agora],
    );
    await registrarEvento(tx, {
      tipo: "perfil_despausado",
      entidade: "perfil",
      entidadeId: p.perfilId,
      perfilId: p.perfilId,
      payload: { primeira_ativacao: primeiraAtivacao, motivo_da_pausa: perfil.motivo_pausa },
      ator: p.operadorId,
      em: p.agora,
    });
    return { primeiraAtivacao };
  });
}
