import type { Db } from "@/server/db/tipos";
import { despachar, type ResultadoDoPerfil } from "@/server/despachante/despachante";
import { carregarFeriados } from "@/server/despachante/perfis";
import { reconciliarAcoesEmVoo } from "@/server/despachante/reconciliar";
import { sincronizarStatusDasContas } from "@/server/perfis/status-conta";
import { criarVerificadorDeResposta } from "@/server/reacoes/verificar-resposta";
import { pegarTrava } from "@/server/travas";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { reprocessarWebhooksPendentes } from "@/server/webhooks/processar";

export type DependenciasDoTick = { db: Db; unipile: ClienteUnipile; agora: Date; aleatorio?: () => number };

export type RelatorioDoTick =
  | { executado: false; motivo: string }
  | {
      executado: true;
      etapas: Record<string, { ok: boolean; resultado?: unknown; erro?: string }>;
      despacho: ResultadoDoPerfil[];
    };

/**
 * O tick do cron (a cada 5 min). Uma etapa que falha não derruba as outras.
 * Ordem: contas → webhooks atrasados → ações presas → despacho. O despacho vem
 * por último para enxergar respostas e pausas que acabaram de chegar.
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
    const despacho =
      (await etapa("despacho", () =>
        despachar({ ...contexto, aleatorio: deps.aleatorio, verificarResposta: criarVerificadorDeResposta(contexto) }),
      )) ?? [];
    return { executado: true, etapas, despacho };
  } finally {
    await soltar();
  }
}
