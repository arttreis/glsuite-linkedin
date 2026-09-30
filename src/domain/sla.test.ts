import { describe, expect, it } from "vitest";
import { instanteLocal } from "./calendario";
import { estadoDoSla } from "./sla";

const SP = "America/Sao_Paulo";
const base = { horas: 4, fuso: SP, janela: { inicio: "09:00", fim: "18:00", jitter_min: [3, 12] as [number, number] }, feriados: new Set(["2026-10-12"]) };

describe("SLA de 4 horas úteis (§4.6)", () => {
  it("vence 4 horas úteis depois da resposta, atravessando noite, fim de semana e feriado", () => {
    const sexta16h = instanteLocal("2026-10-09", "16:00", SP);
    const estado = estadoDoSla({ ...base, ultimaEntrada: sexta16h, ultimaSaida: null, agora: instanteLocal("2026-10-09", "17:00", SP) });
    // 2 h na sexta + 2 h na terça (segunda 12/10 é feriado).
    expect(estado).toEqual({ tipo: "no_prazo", venceEm: instanteLocal("2026-10-13", "11:00", SP) });
  });

  it("estoura depois do prazo e fica respondida quando a casa responde", () => {
    const entrada = instanteLocal("2026-10-07", "10:00", SP);
    expect(estadoDoSla({ ...base, ultimaEntrada: entrada, ultimaSaida: null, agora: instanteLocal("2026-10-07", "14:30", SP) })).toEqual({
      tipo: "estourado",
      venceuEm: instanteLocal("2026-10-07", "14:00", SP),
    });
    expect(
      estadoDoSla({ ...base, ultimaEntrada: entrada, ultimaSaida: instanteLocal("2026-10-07", "11:00", SP), agora: instanteLocal("2026-10-07", "15:00", SP) }),
    ).toEqual({ tipo: "respondida" });
  });

  it("sem mensagem da pessoa não há SLA", () => {
    expect(estadoDoSla({ ...base, ultimaEntrada: null, ultimaSaida: null, agora: new Date() })).toBeNull();
  });
});
