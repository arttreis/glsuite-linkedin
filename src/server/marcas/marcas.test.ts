import { describe, expect, it } from "vitest";
import { inicial, porNome } from "./marcas";

describe("inicial do selo", () => {
  it("é a primeira letra do nome, maiúscula e sem acento", () => {
    expect(inicial("Ágil")).toBe("A");
    expect(inicial(" kakou")).toBe("K");
    expect(inicial("GuessLess")).toBe("G");
    expect(inicial("élan")).toBe("E");
  });
});

describe("ordem das marcas", () => {
  it("é por nome, sem diferença de caixa nem de acento", () => {
    const marcas = [
      { id: "3", nome: "beta" },
      { id: "1", nome: "Ágil" },
      { id: "2", nome: "Alfa" },
      { id: "4", nome: "Zeta" },
    ];
    expect(porNome(marcas).map((m) => m.nome)).toEqual(["Ágil", "Alfa", "beta", "Zeta"]);
  });
});
