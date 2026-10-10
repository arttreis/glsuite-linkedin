import { describe, expect, it } from "vitest";
import { dossie, explicarErroDoDossie, normalizarUrlDoSite, resumoDaOferta, type Dossie } from "./dossie";
import { limparEdicao } from "./edicao";

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

describe("limparEdicao no dossiê", () => {
  it("tira espaço das pontas e descarta item de lista em branco", () => {
    const editado = {
      ...DOSSIE,
      empresa: { nome: "  GuessLess ", resumo: DOSSIE.empresa.resumo },
      diferenciais: ["Engenharia, não achismo", "   "],
      objecoes: [{ objecao: "", resposta: " " }],
      provas: [...DOSSIE.provas, { tipo: "case", texto: "", fonte_url: "" }],
    };
    const limpo = dossie.parse(limparEdicao(editado));
    expect(limpo.empresa.nome).toBe("GuessLess");
    expect(limpo.diferenciais).toEqual(["Engenharia, não achismo"]);
    expect(limpo.objecoes).toEqual([]);
    expect(limpo.provas).toHaveLength(1);
  });

  it("prova escrita à mão fica sem fonte", () => {
    const editado = { ...DOSSIE, provas: [{ tipo: "cliente", texto: "Atende a Kakou", fonte_url: " " }] };
    expect(dossie.parse(limparEdicao(editado)).provas[0]!.fonte_url).toBeNull();
  });
});

describe("explicarErroDoDossie", () => {
  const erro = (entrada: unknown) => explicarErroDoDossie(dossie.safeParse(limparEdicao(entrada)).error!);

  it("diz a seção e o item do problema", () => {
    expect(erro({ ...DOSSIE, produtos: [] })).toBe("O que vocês vendem: precisa de pelo menos 1.");
    expect(erro({ ...DOSSIE, produtos: [{ nome: "", descricao: "Algo", para_quem: "" }] })).toBe("O que vocês vendem, item 1, nome: não pode ficar em branco.");
    expect(erro({ ...DOSSIE, empresa: { nome: "GuessLess", resumo: "" } })).toBe("Empresa, resumo: não pode ficar em branco.");
    expect(erro({ ...DOSSIE, tom_de_voz: "x".repeat(601) })).toBe("Tom de voz: passou de 600 caracteres.");
    expect(erro({ ...DOSSIE, dores: Array.from({ length: 9 }, (_, i) => `dor ${i}`) })).toBe("Dores: no máximo 8.");
  });
});
