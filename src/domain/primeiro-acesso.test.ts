import { describe, expect, it } from "vitest";
import {
  ehPassoInicial,
  PASSO_INICIAL,
  PASSOS_DO_PRIMEIRO_ACESSO,
  passoAtual,
  podeAbrir,
  rotaDoPasso,
  type IdDoPassoInicial,
} from "./primeiro-acesso";

const feitos = (...passos: IdDoPassoInicial[]) => new Set(passos);

describe("primeiro acesso", () => {
  it("começa pelo site", () => {
    expect(passoAtual(feitos())).toBe("site");
  });

  it("depois da análise vem o objetivo, e depois dele o SDR (SDR-67)", () => {
    expect(passoAtual(feitos("site", "analise"))).toBe("objetivo");
    expect(passoAtual(feitos("site", "analise", "objetivo"))).toBe("sdr");
  });

  it("o passo atual é o primeiro que falta, mesmo com um da frente feito", () => {
    expect(passoAtual(feitos("site", "analise", "objetivo", "abordagem"))).toBe("sdr");
  });

  it("com tudo feito, fica no último", () => {
    expect(passoAtual(feitos(...PASSOS_DO_PRIMEIRO_ACESSO))).toBe("linkedin");
  });

  it("abre os feitos e o atual, não os da frente", () => {
    const estado = feitos("site", "analise");
    expect(podeAbrir("site", estado)).toBe(true);
    expect(podeAbrir("objetivo", estado)).toBe(true);
    expect(podeAbrir("sdr", estado)).toBe(false);
    expect(podeAbrir("abordagem", estado)).toBe(false);
    expect(podeAbrir("linkedin", estado)).toBe(false);
  });

  it("cada passo abre numa rota com slug em inglês", () => {
    const rotas = PASSOS_DO_PRIMEIRO_ACESSO.map(rotaDoPasso);
    expect(rotas).toEqual([
      "/onboarding/site",
      "/onboarding/analysis",
      "/onboarding/goal",
      "/onboarding/sdr",
      "/onboarding/approach",
      "/onboarding/linkedin",
    ]);
  });

  it("o indicador de passos mostra o Objetivo como passo 3, entre Análise e SDR", () => {
    expect(PASSOS_DO_PRIMEIRO_ACESSO.map((passo) => PASSO_INICIAL[passo].rotulo)).toEqual([
      "Site",
      "Análise",
      "Objetivo",
      "SDR",
      "Abordagem",
      "LinkedIn",
    ]);
  });

  it("reconhece os ids dos passos", () => {
    expect(ehPassoInicial("abordagem")).toBe(true);
    expect(ehPassoInicial("objetivo")).toBe(true);
    expect(ehPassoInicial("leads")).toBe(false);
    expect(ehPassoInicial("oferta")).toBe(false);
  });
});
