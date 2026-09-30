import { dataLocal, somarDiasUteis, subtrairDiasUteis, type Feriados } from "./calendario";

/**
 * Regras de parada automática por taxa de aceite (§4.4).
 *
 * "Taxa de aceite em 3 dias úteis" = dos convites que já tiveram 3 dias úteis
 * para ser aceitos (convites maduros), quantos foram aceitos dentro desse prazo.
 * Convite de hoje ainda não teve chance: contar ele derrubaria a taxa e pausaria
 * o perfil sem motivo.
 */

export type ConfigDeAceite = {
  aceite_minimo: number;
  aceite_prazo_dias_uteis: number;
  aceite_amostra_minima: number;
  aceite_janela_dias_uteis: number;
  queda_brusca: { ativa: boolean; fator: number; amostra_minima: number };
};

export type ConviteParaAceite = { enviadaEm: Date; aceitoEm: Date | null };

export type Calendario = { agora: Date; fuso: string; feriados: Feriados };

export type Taxa = { amostra: number; aceitos: number; taxa: number | null };

function prazoDoConvite(convite: ConviteParaAceite, prazo: number, cal: Calendario): string {
  return somarDiasUteis(dataLocal(convite.enviadaEm, cal.fuso), prazo, cal.feriados);
}

/** Convites cujo prazo de aceite já passou, do mais antigo para o mais novo. */
export function convitesMaduros(convites: readonly ConviteParaAceite[], prazo: number, cal: Calendario): ConviteParaAceite[] {
  const hoje = dataLocal(cal.agora, cal.fuso);
  return convites
    .filter((convite) => prazoDoConvite(convite, prazo, cal) < hoje)
    .sort((a, b) => a.enviadaEm.getTime() - b.enviadaEm.getTime());
}

export function taxaDeAceite(maduros: readonly ConviteParaAceite[], prazo: number, cal: Calendario): Taxa {
  const aceitos = maduros.filter(
    (convite) => convite.aceitoEm !== null && dataLocal(convite.aceitoEm, cal.fuso) <= prazoDoConvite(convite, prazo, cal),
  ).length;
  return { amostra: maduros.length, aceitos, taxa: maduros.length > 0 ? aceitos / maduros.length : null };
}

const porcento = (valor: number) => `${Math.round(valor * 100)}%`;

export type Veredito = { pausar: false; taxa: Taxa } | { pausar: true; taxa: Taxa; motivo: string };

/**
 * Taxa abaixo do mínimo (com amostra mínima) na janela recente, ou queda brusca
 * entre os convites mais recentes e os anteriores.
 */
export function avaliarAceite(convites: readonly ConviteParaAceite[], config: ConfigDeAceite, cal: Calendario): Veredito {
  const prazo = config.aceite_prazo_dias_uteis;
  const maduros = convitesMaduros(convites, prazo, cal);
  const inicioDaJanela = subtrairDiasUteis(
    dataLocal(cal.agora, cal.fuso),
    config.aceite_janela_dias_uteis + prazo,
    cal.feriados,
  );
  const recentes = maduros.filter((convite) => dataLocal(convite.enviadaEm, cal.fuso) >= inicioDaJanela);
  const taxa = taxaDeAceite(recentes, prazo, cal);

  if (taxa.taxa !== null && taxa.amostra >= config.aceite_amostra_minima && taxa.taxa < config.aceite_minimo) {
    return {
      pausar: true,
      taxa,
      motivo: `Taxa de aceite de ${porcento(taxa.taxa)} em ${prazo} dias úteis (${taxa.aceitos} de ${taxa.amostra} convites), abaixo de ${porcento(config.aceite_minimo)}.`,
    };
  }

  const { queda_brusca: queda } = config;
  if (queda.ativa && maduros.length >= queda.amostra_minima * 2) {
    const ultimos = maduros.slice(-queda.amostra_minima);
    const antes = maduros.slice(-queda.amostra_minima * 3, -queda.amostra_minima);
    const agora = taxaDeAceite(ultimos, prazo, cal).taxa ?? 0;
    const antes_ = taxaDeAceite(antes, prazo, cal).taxa ?? 0;
    if (antes_ > 0 && agora < antes_ * queda.fator) {
      return {
        pausar: true,
        taxa,
        motivo: `Queda brusca de aceite: de ${porcento(antes_)} para ${porcento(agora)} nos últimos ${queda.amostra_minima} convites.`,
      };
    }
  }
  return { pausar: false, taxa };
}
