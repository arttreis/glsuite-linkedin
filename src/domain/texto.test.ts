import { describe, expect, it } from "vitest";
import { nomeDeEmpresa, chaveDaEmpresa, primeiroNome, semAcentos } from "./texto";

describe("texto", () => {
  it("tira acentos", () => {
    expect(semAcentos("Tráfego Agência São Paulo")).toBe("Trafego Agencia Sao Paulo");
  });

  it.each([
    ["Acme Tecnologia Ltda.", null, "acme tecnologia"],
    ["ACME TECNOLOGIA", null, "acme tecnologia"],
    ["Açaí & Cia S.A.", null, "acai cia"],
    ["Qualquer Nome", "https://www.acme.com.br/sobre", "acme.com.br"],
    [null, null, null],
  ])("chave da empresa de %s / %s é %s", (nome, dominio, esperado) => {
    expect(chaveDaEmpresa(nome, dominio)).toBe(esperado);
  });

  it.each([
    ["Maria Souza", null, "Maria"],
    ["DR. JOÃO 🚀 Silva", null, "João"],
    ["ana paula", null, "Ana"],
    ["Qualquer", "Beatriz", "Beatriz"],
    ["Dra. Letícia Alves", null, "Letícia"],
    ["", null, null],
  ])("primeiro nome de %s é %s", (completo, primeiro, esperado) => {
    expect(primeiroNome(completo, primeiro)).toBe(esperado);
  });
});

describe("nomeDeEmpresa", () => {
  it("caixa alta vira só a inicial maiúscula, e sigla curta fica", () => {
    expect(nomeDeEmpresa("MAGAZINE LUIZA LTDA")).toBe("Magazine Luiza Ltda");
    expect(nomeDeEmpresa("BRF S.A.")).toBe("BRF S.A.");
    expect(nomeDeEmpresa(" IBM ")).toBe("IBM");
  });

  it("caixa misturada é como a empresa escreve, e fica", () => {
    expect(nomeDeEmpresa("GuessLess")).toBe("GuessLess");
    expect(nomeDeEmpresa("iFood")).toBe("iFood");
    expect(nomeDeEmpresa("")).toBeNull();
  });
});
