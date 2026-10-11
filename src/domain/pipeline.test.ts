import { describe, expect, it } from "vitest";
import { ESTADOS_DO_LEAD } from "./estados";
import { colunaDoEstado, COLUNAS_DO_PIPELINE } from "./pipeline";

describe("colunas do Pipeline (§4.10)", () => {
  it("cada estado depois da triagem cai em uma coluna só", () => {
    for (const estado of ESTADOS_DO_LEAD) {
      const colunas = COLUNAS_DO_PIPELINE.filter((coluna) => (coluna.estados as readonly string[]).includes(estado));
      expect(colunas.length, estado).toBe(["importado", "triagem", "rejeitado"].includes(estado) ? 0 : 1);
    }
  });

  it("com humano continua em Conversando", () => {
    expect(colunaDoEstado("escalado_humano")?.rotulo).toBe("Conversando");
    expect(colunaDoEstado("triagem")).toBeNull();
  });
});
