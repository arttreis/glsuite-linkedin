import { describe, expect, it } from "vitest";
import { caminhoInternoSeguro } from "./redirecionamento";

describe("caminhoInternoSeguro", () => {
  it("mantém caminhos internos", () => {
    expect(caminhoInternoSeguro("/inbox?perfil=1")).toBe("/inbox?perfil=1");
  });

  it.each([null, "", "https://evil.com", "//evil.com", "/\\evil.com", "inbox"])(
    "troca %s pelo padrão",
    (valor) => {
      expect(caminhoInternoSeguro(valor)).toBe("/");
    },
  );
});
