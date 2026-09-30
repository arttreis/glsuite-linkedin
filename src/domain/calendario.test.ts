import { describe, expect, it } from "vitest";
import {
  aberturaDoProximoDiaUtil,
  dataLocal,
  dentroDaJanela,
  ehDiaUtil,
  instanteLocal,
  limitesDoDia,
  proximaAbertura,
  somarDiasUteis,
  somarHorasUteis,
  sortearIntervalo,
  type Janela,
} from "./calendario";

const JANELA: Janela = { inicio: "09:00", fim: "18:00", jitter_min: [3, 12] };
const SP = "America/Sao_Paulo";
const FERIADOS = new Set(["2026-10-12", "2026-11-02", "2026-11-20"]);

describe("calendário", () => {
  it("usa a data local do fuso do perfil", () => {
    // 01:30 UTC de quinta é 22:30 de quarta em São Paulo.
    expect(dataLocal(new Date("2026-10-01T01:30:00Z"), SP)).toBe("2026-09-30");
    expect(dataLocal(new Date("2026-10-01T01:30:00Z"), "Europe/Madrid")).toBe("2026-10-01");
  });

  it("dia útil exclui fim de semana e feriado da praça", () => {
    expect(ehDiaUtil("2026-10-09", FERIADOS)).toBe(true); // sexta
    expect(ehDiaUtil("2026-10-10", FERIADOS)).toBe(false); // sábado
    expect(ehDiaUtil("2026-10-12", FERIADOS)).toBe(false); // Aparecida
  });

  it.each([
    ["2026-10-05", 2, "2026-10-07"], // segunda + 2 = quarta
    ["2026-10-08", 2, "2026-10-13"], // quinta + 2 pula fim de semana e o feriado de 12/10
    ["2026-10-10", 2, "2026-10-14"], // sábado + 2 = terça e quarta (12/10 feriado)
    ["2026-10-10", 0, "2026-10-13"], // 0 num sábado cai no próximo dia útil
    ["2026-10-07", 0, "2026-10-07"],
    ["2026-10-30", 4, "2026-11-06"], // 02/11 é feriado
  ])("%s + %i dias úteis = %s", (data, dias, esperado) => {
    expect(somarDiasUteis(data, dias, FERIADOS)).toBe(esperado);
  });

  describe("janela 9h–18h", () => {
    it("abre às 9h e fecha às 18h no horário local", () => {
      expect(dentroDaJanela(instanteLocal("2026-10-07", "08:59", SP), SP, JANELA, FERIADOS)).toBe(false);
      expect(dentroDaJanela(instanteLocal("2026-10-07", "09:00", SP), SP, JANELA, FERIADOS)).toBe(true);
      expect(dentroDaJanela(instanteLocal("2026-10-07", "17:59", SP), SP, JANELA, FERIADOS)).toBe(true);
      expect(dentroDaJanela(instanteLocal("2026-10-07", "18:00", SP), SP, JANELA, FERIADOS)).toBe(false);
    });

    it("fica fechada no fim de semana e no feriado", () => {
      expect(dentroDaJanela(instanteLocal("2026-10-10", "10:00", SP), SP, JANELA, FERIADOS)).toBe(false);
      expect(dentroDaJanela(instanteLocal("2026-10-12", "10:00", SP), SP, JANELA, FERIADOS)).toBe(false);
    });

    it("segue o horário de verão de Toronto", () => {
      // 09:30 em Toronto é 13:30 UTC no verão (EDT) e 14:30 UTC no inverno (EST).
      const toronto = "America/Toronto";
      expect(dentroDaJanela(new Date("2026-10-07T13:30:00Z"), toronto, JANELA, new Set())).toBe(true);
      expect(dentroDaJanela(new Date("2026-12-02T13:30:00Z"), toronto, JANELA, new Set())).toBe(false);
      expect(dentroDaJanela(new Date("2026-12-02T14:30:00Z"), toronto, JANELA, new Set())).toBe(true);
    });

    it("calcula a próxima abertura", () => {
      const sextaNoite = instanteLocal("2026-10-09", "19:00", SP);
      expect(proximaAbertura(sextaNoite, SP, JANELA, FERIADOS)).toEqual(instanteLocal("2026-10-13", "09:00", SP));
      const madrugada = instanteLocal("2026-10-07", "06:00", SP);
      expect(proximaAbertura(madrugada, SP, JANELA, FERIADOS)).toEqual(instanteLocal("2026-10-07", "09:00", SP));
      const dentro = instanteLocal("2026-10-07", "11:00", SP);
      expect(proximaAbertura(dentro, SP, JANELA, FERIADOS)).toEqual(dentro);
      expect(aberturaDoProximoDiaUtil(dentro, SP, JANELA, FERIADOS)).toEqual(instanteLocal("2026-10-08", "09:00", SP));
    });
  });

  it("delimita o dia local", () => {
    const { inicio, fim } = limitesDoDia(new Date("2026-10-07T15:00:00Z"), SP);
    expect(inicio.toISOString()).toBe("2026-10-07T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-10-08T03:00:00.000Z");
  });

  it("soma horas úteis para o SLA, atravessando noite e fim de semana", () => {
    const sexta16h = instanteLocal("2026-10-09", "16:00", SP);
    expect(somarHorasUteis(sexta16h, 4, SP, JANELA, FERIADOS)).toEqual(instanteLocal("2026-10-13", "11:00", SP));
    const sabado = instanteLocal("2026-10-10", "10:00", SP);
    expect(somarHorasUteis(sabado, 4, SP, JANELA, FERIADOS)).toEqual(instanteLocal("2026-10-13", "13:00", SP));
  });

  it("sorteia o intervalo dentro do jitter", () => {
    expect(sortearIntervalo(JANELA, () => 0)).toBe(3);
    expect(sortearIntervalo(JANELA, () => 1)).toBe(12);
  });
});
