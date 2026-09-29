import { describe, expect, it } from "vitest";
import { calcularSaldo, limitesDaSemana, semanaDesdeAtivacao } from "./rampa";

const RAMPA_BRASIL = [
  { semana: 1, convites_dia: 8, dms_dia: 15 },
  { semana: 2, convites_dia: 12, dms_dia: 20 },
  { semana: 3, convites_dia: 15, dms_dia: 25 },
];

describe("rampa e teto (§4.3)", () => {
  it.each([
    ["2026-10-01", "2026-10-01", 1],
    ["2026-10-01", "2026-10-07", 1],
    ["2026-10-01", "2026-10-08", 2],
    ["2026-10-01", "2026-10-15", 3],
    ["2026-10-01", "2026-12-01", 9],
  ])("ativado em %s, hoje %s é a semana %i", (ativacao, hoje, semana) => {
    expect(semanaDesdeAtivacao(ativacao, hoje)).toBe(semana);
  });

  it("usa a etapa da semana e a última para 3+", () => {
    expect(limitesDaSemana(RAMPA_BRASIL, 1)).toEqual({ convitesDia: 8, dmsDia: 15 });
    expect(limitesDaSemana(RAMPA_BRASIL, 2)).toEqual({ convitesDia: 12, dmsDia: 20 });
    expect(limitesDaSemana(RAMPA_BRASIL, 9)).toEqual({ convitesDia: 15, dmsDia: 25 });
  });

  it("o saldo respeita o dia e a janela móvel de 7 dias", () => {
    const limites = { convitesDia: 15, dmsDia: 25 };
    expect(calcularSaldo(limites, 75, { convitesHoje: 10, dmsHoje: 20, convitesUltimos7Dias: 40 })).toEqual({ convites: 5, dms: 5 });
    expect(calcularSaldo(limites, 75, { convitesHoje: 3, dmsHoje: 0, convitesUltimos7Dias: 73 })).toEqual({ convites: 2, dms: 25 });
    expect(calcularSaldo(limites, 75, { convitesHoje: 16, dmsHoje: 30, convitesUltimos7Dias: 80 })).toEqual({ convites: 0, dms: 0 });
  });
});
