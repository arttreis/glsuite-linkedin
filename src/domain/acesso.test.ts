import { describe, expect, it } from "vitest";
import { emailLiberado, lerDominiosLiberados, nomeDoEmail } from "./acesso";

describe("acesso", () => {
  it.each([
    ["guessless.com.br", ["guessless.com.br"]],
    [" @GuessLess.com.br, outra.com  outra.com ", ["guessless.com.br", "outra.com"]],
    ["", []],
    [undefined, []],
  ])("lê os domínios de %j", (texto, esperado) => {
    expect(lerDominiosLiberados(texto)).toEqual(esperado);
  });

  it.each([
    ["arthur@guessless.com.br", true],
    ["Arthur@GuessLess.com.br", true],
    ["alguem@gmail.com", false],
    ["alguem@sub.guessless.com.br", false],
    ["alguem@guessless.com.br.evil.com", false],
    ["sem-arroba", false],
    ["@guessless.com.br", false],
  ])("%s liberado é %s", (email, esperado) => {
    expect(emailLiberado(email, ["guessless.com.br"])).toBe(esperado);
  });

  it("sem domínio liberado, ninguém é liberado", () => {
    expect(emailLiberado("arthur@guessless.com.br", [])).toBe(false);
  });

  it.each([
    ["arthur.reis@guessless.com.br", "Arthur Reis"],
    ["midia@guessless.com.br", "Midia"],
    ["JOAO_PEDRO+teste@guessless.com.br", "Joao Pedro Teste"],
    ["a@guessless.com.br", "Sem nome"],
  ])("nome de %s é %s", (email, esperado) => {
    expect(nomeDoEmail(email)).toBe(esperado);
  });
});
