import { describe, expect, it } from "vitest";
import { haQuantoTempo, tempoDecorrido } from "./tempo";

const AGORA = new Date("2026-10-12T15:00:00Z");
const antes = (ms: number) => new Date(AGORA.getTime() - ms);

describe("há quanto tempo", () => {
  it("fala o tempo do jeito curto", () => {
    expect(haQuantoTempo(antes(20 * 1000), AGORA)).toBe("agora");
    expect(haQuantoTempo(antes(5 * 60 * 1000), AGORA)).toBe("há 5 min");
    expect(haQuantoTempo(antes(3 * 60 * 60 * 1000), AGORA)).toBe("há 3 h");
    expect(haQuantoTempo(antes(30 * 60 * 60 * 1000), AGORA)).toBe("ontem");
    expect(haQuantoTempo(antes(4 * 24 * 60 * 60 * 1000), AGORA)).toBe("há 4 dias");
    expect(haQuantoTempo(new Date("2026-09-30T15:00:00Z"), AGORA)).toBe("30/09");
  });
});

describe("tempo decorrido", () => {
  it("conta segundos e minutos do que está em andamento", () => {
    expect(tempoDecorrido(antes(400), AGORA)).toBe("0 s");
    expect(tempoDecorrido(antes(40 * 1000), AGORA)).toBe("40 s");
    expect(tempoDecorrido(antes(65 * 1000), AGORA)).toBe("1 min 5 s");
    expect(tempoDecorrido(antes(3 * 60 * 1000), AGORA)).toBe("3 min");
  });

  it("relógio adiantado no início não vira tempo negativo", () => {
    expect(tempoDecorrido(new Date(AGORA.getTime() + 2000), AGORA)).toBe("0 s");
  });
});
