import { describe, expect, it } from "vitest";
import { instanteLocal, type Janela } from "./calendario";
import { estadoDoSla, prazosDaPassagem } from "./sla";

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

describe("prazos da passagem sem resposta (SDR-66)", () => {
  const janela: Janela = { inicio: "09:00", fim: "18:00", jitter_min: [3, 10] };
  const prazos = (data: string, hora: string, feriados: string[] = []) =>
    prazosDaPassagem({ passadaEm: instanteLocal(data, hora, SP), fuso: SP, janela, feriados: new Set(feriados) });

  it("numa terça às 10h: lembrete às 14h, admin na quarta às 10h", () => {
    expect(prazos("2026-10-13", "10:00")).toEqual({
      lembrete: instanteLocal("2026-10-13", "14:00", SP),
      admin: instanteLocal("2026-10-14", "10:00", SP),
    });
  });

  it("na sexta às 17h: o fim de semana não conta", () => {
    expect(prazos("2026-10-16", "17:00")).toEqual({
      lembrete: instanteLocal("2026-10-19", "12:00", SP),
      admin: instanteLocal("2026-10-19", "17:00", SP),
    });
  });

  it("no sábado: conta da abertura de segunda; feriado também não conta", () => {
    expect(prazos("2026-10-17", "11:00", ["2026-10-20"])).toEqual({
      lembrete: instanteLocal("2026-10-19", "13:00", SP),
      admin: instanteLocal("2026-10-21", "09:00", SP),
    });
  });

  it("o admin nunca é avisado antes do lembrete, mesmo com janela curta", () => {
    const curta: Janela = { inicio: "09:00", fim: "11:00", jitter_min: [3, 10] };
    const p = prazosDaPassagem({ passadaEm: instanteLocal("2026-10-13", "10:00", SP), fuso: SP, janela: curta, feriados: new Set() });
    expect(p.lembrete).toEqual(instanteLocal("2026-10-15", "10:00", SP));
    expect(p.admin).toEqual(p.lembrete);
  });
});
