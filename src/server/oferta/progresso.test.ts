import { describe, expect, it } from "vitest";
import { comecouOMercado, TAMANHO_DO_TRECHO, trechoDaPagina } from "./progresso";

describe("trecho da página", () => {
  it("pula menu e título e fica com a primeira frase, sem a marcação", () => {
    const texto = [
      "[Início](/) | [Sobre](/sobre) | [Contato](/contato)",
      "# GuessLess",
      "![logo](/logo.png)",
      "- Diagnóstico",
      "A **GuessLess** ajuda [e-commerces](/ecommerce) de médio porte a crescer com margem.",
      "Outra frase que não entra no trecho porque a primeira já serviu.",
    ].join("\n");
    expect(trechoDaPagina(texto)).toBe("A GuessLess ajuda e-commerces de médio porte a crescer com margem.");
  });

  it("corta frase longa numa palavra, com reticências, sem passar do tamanho", () => {
    const frase = "Consultoria de crescimento para e-commerce ".repeat(6).trim();
    const trecho = trechoDaPagina(frase)!;
    expect(trecho.length).toBeLessThanOrEqual(TAMANHO_DO_TRECHO);
    expect(trecho.endsWith("…")).toBe(true);
    expect(frase.startsWith(trecho.slice(0, -1))).toBe(true);
    expect(frase[trecho.length - 1]).toBe(" ");
  });

  it("página sem frase fica sem trecho", () => {
    expect(trechoDaPagina("")).toBeNull();
    expect(trechoDaPagina("# Contato\n[WhatsApp](https://wa.me/1)\nSão Paulo")).toBeNull();
  });
});

describe("começou o Mercado", () => {
  it("vê a chave do Mercado no JSON ainda chegando", () => {
    expect(comecouOMercado('{"empresa":{"nome":"GuessLess"},"idioma":"pt"')).toBe(false);
    expect(comecouOMercado('{"empresa":{"nome":"GuessLess"},"idioma":"pt","mercado"')).toBe(false);
    expect(comecouOMercado('{"idioma":"pt","mercado":{"segm')).toBe(true);
    expect(comecouOMercado('{"idioma": "pt",\n  "mercado" : {')).toBe(true);
  });

  it("a palavra dentro de um texto não conta", () => {
    expect(comecouOMercado('{"empresa":{"resumo":"Lidera o \\"mercado\\": varejo')).toBe(false);
  });
});
