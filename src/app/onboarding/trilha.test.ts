import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Trilha } from "./trilha";

vi.mock("next/navigation", () => ({ usePathname: () => "/onboarding/goal" }));

describe("indicador de passos do primeiro acesso", () => {
  it("mostra o Objetivo como passo 3 de 6, aberto, entre Análise e SDR (SDR-67)", () => {
    const html = renderToStaticMarkup(createElement(Trilha, { feitos: ["site", "analise"], atual: "objetivo" }));
    expect(html).toContain("Passo 3 de 6: Objetivo");
    const rotulos = [...html.matchAll(/<span class="[^"]*text-(?:tinta|tinta-suave|tinta-fraca)">([^<]+)<\/span>/g)]
      .map((m) => m[1])
      .filter((texto) => !/^\d+$/.test(texto!));
    expect(rotulos).toEqual(["Site", "Análise", "Objetivo", "SDR", "Abordagem", "LinkedIn"]);
    expect(html).toMatch(/aria-current="step"[^>]*>.*?Objetivo/);
    expect(html).toContain('href="/onboarding/analysis"');
    expect(html).not.toContain('href="/onboarding/sdr"');
  });
});
