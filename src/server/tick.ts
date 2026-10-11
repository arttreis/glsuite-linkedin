import { processarMensagensPendentes } from "@/server/agente/agente";
import type { ModeloDeLinguagem } from "@/server/agente/modelo";
import { enviarAlertasPendentes, type EnviadorDeEmail } from "@/server/alertas/alertas";
import { alertarSlasEstourados } from "@/server/conversas/alertas";
import type { Db } from "@/server/db/tipos";
import { despachar, type ResultadoDoPerfil } from "@/server/despachante/despachante";
import { carregarFeriados } from "@/server/despachante/perfis";
import { avaliarGuardasDeTodos } from "@/server/guardas/guardas";
import { reconciliarAcoesEmVoo } from "@/server/despachante/reconciliar";
import { avaliarModosAutomaticos } from "@/server/perfis/modo";
import { sincronizarStatusDasContas } from "@/server/perfis/status-conta";
import { processarPesquisasPendentes } from "@/server/pesquisa/pesquisa";
import { criarVerificadorDeResposta } from "@/server/reacoes/verificar-resposta";
import { pegarTrava } from "@/server/travas";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { reprocessarWebhooksPendentes } from "@/server/webhooks/processar";

export type DependenciasDoTick = {
  db: Db;
  unipile: ClienteUnipile;
  agora: Date;
  aleatorio?: () => number;
  /** Sem enviador (Resend não configurado), os alertas ficam na fila. */
  enviador?: EnviadorDeEmail | null;
  /** Sem modelo (Claude não configurado), as mensagens e os T1 personalizados esperam na fila. */
  modelo?: ModeloDeLinguagem | null;
  /** Sem cliente (token do RD ausente), os eventos esperam na fila. */
};

export type RelatorioDoTick =
  | { executado: false; motivo: string }
  | {
      executado: true;
      etapas: Record<string, { ok: boolean; resultado?: unknown; erro?: string }>;
      despacho: ResultadoDoPerfil[];
    };

/**
 * O tick do cron (a cada 5 min). Uma etapa que falha não derruba as outras.
 * Ordem: contas → webhooks atrasados → ações presas → guardas → modo
 * automático (rebaixamento) → despacho → agente → pesquisa (T1 personalizado) → RD → SLA → alertas. O despacho vem
 * depois de tudo o que pode pausar um perfil, tirar um lead da régua ou
 * devolver um rascunho automático para a fila.
 */
export async function executarTick(deps: DependenciasDoTick): Promise<RelatorioDoTick> {
  const soltar = await pegarTrava(deps.db, "tick", deps.agora, 4 * 60_000);
  if (!soltar) return { executado: false, motivo: "outro tick em andamento" };

  const etapas: Record<string, { ok: boolean; resultado?: unknown; erro?: string }> = {};
  const etapa = async <T>(nome: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      const resultado = await fn();
      etapas[nome] = { ok: true, resultado };
      return resultado;
    } catch (erro) {
      etapas[nome] = { ok: false, erro: (erro as Error).message };
      return undefined;
    }
  };

  try {
    const contexto = { db: deps.db, unipile: deps.unipile, agora: deps.agora };
    await etapa("contas", () => sincronizarStatusDasContas(deps.db, deps.unipile, deps.agora));
    await etapa("webhooks", () => reprocessarWebhooksPendentes(contexto));
    await etapa("em_voo", async () =>
      reconciliarAcoesEmVoo({ ...contexto, feriadosPorPraca: await carregarFeriados(deps.db) }),
    );
    await etapa("guardas", () => avaliarGuardasDeTodos(deps.db, deps.agora));
    await etapa("modo", () => avaliarModosAutomaticos(deps.db, deps.agora));
    const despacho =
      (await etapa("despacho", () =>
        despachar({ ...contexto, aleatorio: deps.aleatorio, verificarResposta: criarVerificadorDeResposta(contexto) }),
      )) ?? [];
    if (deps.modelo) {
      const modelo = deps.modelo;
      await etapa("agente", () => processarMensagensPendentes({ db: deps.db, modelo, agora: deps.agora, aleatorio: deps.aleatorio }));
      await etapa("pesquisa", () => processarPesquisasPendentes({ ...contexto, modelo }));
    }
    await etapa("sla", () => alertarSlasEstourados(deps.db, deps.agora));
    if (deps.enviador) {
      const enviador = deps.enviador;
      await etapa("alertas", () => enviarAlertasPendentes(deps.db, enviador, deps.agora));
    }
    return { executado: true, etapas, despacho };
  } finally {
    await soltar();
  }
}
