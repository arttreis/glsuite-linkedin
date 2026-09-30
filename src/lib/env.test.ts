import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lerEnv } from "./env";

describe("lerEnv", () => {
  const esquema = z.object({ CHAVE: z.string().min(1), PORTA: z.coerce.number().default(3000) });

  it("não valida nada até o primeiro uso", () => {
    expect(() => lerEnv(esquema, () => ({}))).not.toThrow();
  });

  it("aponta a variável que falta", () => {
    const ler = lerEnv(esquema, () => ({}));
    expect(() => ler()).toThrow(/CHAVE/);
  });

  it("aplica defaults e converte tipos", () => {
    const ler = lerEnv(esquema, () => ({ CHAVE: "x" }));
    expect(ler()).toEqual({ CHAVE: "x", PORTA: 3000 });
  });

  it("guarda o resultado depois da primeira leitura", () => {
    let leituras = 0;
    const ler = lerEnv(esquema, () => {
      leituras += 1;
      return { CHAVE: "x" };
    });
    ler();
    ler();
    expect(leituras).toBe(1);
  });
});
