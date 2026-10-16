import { liberado, type ExigenciaDeModulo, type Modulo } from "@/domain/modulos";

/**
 * As abas do lançamento (§4.21), cada uma com o módulo que a libera. Hoje e
 * SDR valem com qualquer um dos módulos dos lançamentos. Os tickets seguintes
 * acrescentam entre as duas: Grupos e Link (SDR-76, com "comunidades"), Agenda
 * (SDR-93) e Palavras-chave (SDR-94).
 */
const ABAS: { caminho: string; rotulo: string; modulo?: ExigenciaDeModulo }[] = [
  { caminho: "", rotulo: "Hoje" },
  { caminho: "/sdr", rotulo: "SDR" },
];

export function abasDoLancamento(id: string, modulos: readonly Modulo[]): { href: string; rotulo: string }[] {
  return ABAS.filter((aba) => liberado(modulos, aba.modulo)).map(({ caminho, rotulo }) => ({ href: `/launches/${id}${caminho}`, rotulo }));
}
