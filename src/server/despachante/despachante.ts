import { dentroDaJanela } from "@/domain/calendario";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { STATUS_SAUDAVEIS } from "@/server/perfis/status-conta";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { executarReserva, type DependenciasDoEnvio } from "./envio";
import { carregarFeriados, carregarPerfisAtivos, type PerfilDoDespachante } from "./perfis";
import { reservarProximaAcao, type Reserva } from "./reserva";

export type DependenciasDoDespacho = {
  db: Db;
  unipile: ClienteUnipile;
  agora: Date;
  aleatorio?: () => number;
  verificarResposta?: (perfil: PerfilDoDespachante, reserva: Reserva) => Promise<boolean>;
};

export type ResultadoDoPerfil = {
  perfil: string;
  resultado:
    | "fora_da_janela"
    | "aguardando_intervalo"
    | "conta_instavel"
    | "perfil_pausado"
    | "sem_saldo"
    | "nada_a_fazer"
    | "enviada"
    | "cancelada"
    | "erro";
  detalhe?: string;
};

/**
 * Um tick do despachante (§5.1). Para cada perfil ativo: dentro da janela?
 * passou o intervalo aleatório? a conta está estável? Então reserva e envia no
 * máximo uma ação.
 */
export async function despachar(deps: DependenciasDoDespacho): Promise<ResultadoDoPerfil[]> {
  const { db, agora } = deps;
  const perfis = await carregarPerfisAtivos(db);
  if (perfis.length === 0) return [];
  const feriadosPorPraca = await carregarFeriados(db);
  const cooldownDias = await lerConfiguracao(db, "cooldown_empresa_dias");
  const estavelMinutos = await lerConfiguracao(db, "conta_estavel_minutos");

  const resultados: ResultadoDoPerfil[] = [];
  for (const perfil of perfis) {
    const feriados = feriadosPorPraca.get(perfil.praca) ?? new Set<string>();
    const pular = (resultado: ResultadoDoPerfil["resultado"], detalhe?: string) =>
      resultados.push({ perfil: perfil.slug, resultado, detalhe });

    if (!dentroDaJanela(agora, perfil.fuso, perfil.janela, feriados)) {
      pular("fora_da_janela");
      continue;
    }
    if (perfil.proxima_acao_apos && new Date(perfil.proxima_acao_apos) > agora) {
      pular("aguardando_intervalo");
      continue;
    }
    const estavelDesde = perfil.unipile_status_em ? new Date(perfil.unipile_status_em).getTime() : 0;
    if (
      (perfil.unipile_status && !STATUS_SAUDAVEIS.has(perfil.unipile_status)) ||
      agora.getTime() - estavelDesde < estavelMinutos * 60_000
    ) {
      pular("conta_instavel", perfil.unipile_status ?? undefined);
      continue;
    }

    const reserva = await reservarProximaAcao(db, perfil, { agora, feriados, cooldownDias });
    if ("nada" in reserva) {
      pular(reserva.nada);
      continue;
    }
    const envio: DependenciasDoEnvio = {
      db,
      unipile: deps.unipile,
      agora,
      aleatorio: deps.aleatorio ?? Math.random,
      feriados,
      verificarResposta: deps.verificarResposta,
    };
    const resultado = await executarReserva(envio, perfil, reserva.reserva);
    pular(resultado.resultado, resultado.resultado === "enviada" ? resultado.acaoId : resultado.motivo);
  }
  return resultados;
}
