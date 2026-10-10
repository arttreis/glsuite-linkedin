import { describe, expect, it } from "vitest";
import { ehPassoInicial, passoAtual, podeAbrir, type IdDoPassoInicial } from "./primeiro-acesso";

const feitos = (...passos: IdDoPassoInicial[]) => new Set(passos);

describe("primeiro acesso", () => {
  it("começa pelo site", () => {
    expect(passoAtual(feitos())).toBe("site");
  });

  it("o passo atual é o primeiro que falta, mesmo com um da frente feito", () => {
    expect(passoAtual(feitos("site", "analise", "leads"))).toBe("sdr");
  });

  it("com tudo feito, fica no último", () => {
    expect(passoAtual(feitos("site", "analise", "sdr", "leads", "abordagem", "linkedin"))).toBe("linkedin");
  });

  it("abre os feitos e o atual, não os da frente", () => {
    const estado = feitos("site", "analise");
    expect(podeAbrir("site", estado)).toBe(true);
    expect(podeAbrir("sdr", estado)).toBe(true);
    expect(podeAbrir("leads", estado)).toBe(false);
    expect(podeAbrir("linkedin", estado)).toBe(false);
  });

  it("reconhece os ids dos passos", () => {
    expect(ehPassoInicial("abordagem")).toBe(true);
    expect(ehPassoInicial("oferta")).toBe(false);
  });
});
