import { describe, expect, it } from "vitest";
import { normalizarUrlDoSite, resumoDaOferta, type Dossie } from "./dossie";

describe("normalizarUrlDoSite", () => {
  it("aceita endereço sem esquema e tira o www do domínio", () => {
    expect(normalizarUrlDoSite(" www.guessless.com.br ")).toEqual({
      ok: true,
      url: "https://www.guessless.com.br/",
      dominio: "guessless.com.br",
    });
  });

  it("mantém o caminho e tira a âncora", () => {
    expect(normalizarUrlDoSite("http://empresa.com/servicos#topo")).toMatchObject({
      ok: true,
      url: "http://empresa.com/servicos",
    });
  });

  it.each(["", "localhost:3000", "http://127.0.0.1", "ftp://empresa.com", "https://user:senha@empresa.com", "intranet", "x".repeat(260)])(
    "recusa %s",
    (entrada) => {
      expect(normalizarUrlDoSite(entrada)).toEqual({
        ok: false,
        erro: "Use um endereço público, como https://suaempresa.com.br.",
      });
    },
  );
});

const DOSSIE: Dossie = {
  empresa: { nome: "GuessLess", resumo: "Consultoria de crescimento para e-commerce." },
  produtos: [{ nome: "Diagnóstico de margem", descricao: "Mapa da margem por canal.", para_quem: "e-commerce" }],
  para_quem: "E-commerces de médio porte.",
  diferenciais: ["Engenharia, não achismo"],
  provas: [{ tipo: "numero", texto: "Margem 12% maior em 6 meses", fonte_url: "https://guessless.com.br/cases" }],
  dores: ["Refém do marketplace"],
  objecoes: [],
  tom_de_voz: "Direto.",
  idioma: "pt",
};

describe("resumoDaOferta", () => {
  it("traz empresa, produtos, público, diferenciais, provas e dores", () => {
    const resumo = resumoDaOferta(DOSSIE);
    expect(resumo).toContain("GuessLess: Consultoria de crescimento");
    expect(resumo).toContain("Diagnóstico de margem");
    expect(resumo).toContain("Margem 12% maior");
    expect(resumo).toContain("Refém do marketplace");
  });

  it("nunca passa de 1.500 caracteres", () => {
    const longo = { ...DOSSIE, dores: Array.from({ length: 8 }, () => "d".repeat(200)), diferenciais: Array.from({ length: 8 }, () => "x".repeat(200)) };
    expect(resumoDaOferta(longo).length).toBeLessThanOrEqual(1500);
  });
});
