import { describe, expect, it } from "vitest";
import { faltasParaPreencher, type PessoaDeExemplo } from "./previa";

const pessoa = (sobre: Partial<PessoaDeExemplo> = {}): PessoaDeExemplo => ({
  providerId: "p1",
  nome: "Ana Lima",
  primeiroNome: "Ana",
  empresa: "Acme",
  ...sobre,
});

describe("faltasParaPreencher", () => {
  it("conta, por token usado, quem não tem o dado para preencher", () => {
    const textos = ["Oi {{first_name}}", "Como a {{company}} vende hoje?"];
    const pessoas = [pessoa(), pessoa({ empresa: null }), pessoa({ empresa: "  " }), pessoa({ primeiroNome: null })];
    expect(faltasParaPreencher(textos, pessoas)).toEqual([
      { token: "first_name", pessoas: 1 },
      { token: "company", pessoas: 2 },
    ]);
  });

  it("token que nenhum texto usa não conta", () => {
    expect(faltasParaPreencher(["Oi {{first_name}}, tudo bem?"], [pessoa({ empresa: null })])).toEqual([]);
  });

  it("todo mundo com os dados: nada falta", () => {
    expect(faltasParaPreencher(["Oi {{first_name}} da {{company}}"], [pessoa(), pessoa({ providerId: "p2" })])).toEqual([]);
  });
});
