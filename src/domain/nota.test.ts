import { describe, expect, it } from "vitest";
import { notasValidas } from "./nota";

describe("notasValidas", () => {
  it("fica com uma nota por pessoa do lote, de 0 a 100, com motivo de uma linha", () => {
    const notas = notasValidas(
      {
        notas: [
          { indice: 0, nota: 87.4, motivo: "Cargo e setor batem.\n Porte desconhecido." },
          { indice: 0, nota: 10, motivo: "repetida" },
          { indice: 1, nota: 140, motivo: "acima de 100" },
          { indice: 2, nota: -5, motivo: "" },
          { indice: 7, nota: 50, motivo: "fora do lote" },
        ],
      },
      3,
    );
    expect(notas).toEqual([
      { indice: 0, nota: 87, motivo: "Cargo e setor batem. Porte desconhecido." },
      { indice: 1, nota: 100, motivo: "acima de 100" },
      { indice: 2, nota: 0, motivo: "sem motivo" },
    ]);
  });
});
