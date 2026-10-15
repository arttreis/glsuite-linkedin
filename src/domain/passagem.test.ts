import { describe, expect, it } from "vitest";
import { limiarDaCautela } from "./passagem";

describe("passagem da conversa para você (SDR-60)", () => {
  it("mais cauteloso pede mais certeza para seguir sozinho; sem escolha vale o equilibrado", () => {
    expect(limiarDaCautela("cauteloso")).toBeGreaterThan(limiarDaCautela("equilibrado"));
    expect(limiarDaCautela("equilibrado")).toBeGreaterThan(limiarDaCautela("solto"));
    expect(limiarDaCautela(undefined)).toBe(0.7);
  });
});
