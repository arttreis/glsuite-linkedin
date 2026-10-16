import { describe, expect, it } from "vitest";
import {
  CATALOGO_DE_MODULOS,
  ehAdminDaPlataforma,
  ehModulo,
  lerAdminsDaPlataforma,
  liberado,
  linkedinNoPrimeiroAcesso,
  MODULOS,
  MODULOS_DOS_LANCAMENTOS,
  motivoDaMudanca,
  NOME_DO_MODULO,
  soOPrimeiroAcesso,
} from "./modulos";

describe("módulos (SDR-69, §4.14)", () => {
  it("o catálogo tem cada módulo uma vez, na ordem dos ids", () => {
    expect(CATALOGO_DE_MODULOS.map((m) => m.id)).toEqual([...MODULOS]);
    expect(ehModulo("whatsapp")).toBe(true);
    expect(ehModulo("email")).toBe(false);
    expect(ehModulo(undefined)).toBe(false);
  });

  it("o Marco E traz Instagram, Facebook e Comunidades, com o nome de docs/naming.md (SDR-74)", () => {
    expect(MODULOS).toEqual(["linkedin", "whatsapp", "telegram", "instagram", "facebook", "comunidades"]);
    expect(CATALOGO_DE_MODULOS.map((m) => m.id)).toEqual([...MODULOS]);
    expect(NOME_DO_MODULO.comunidades).toBe("Lançamentos em grupos");
    expect(CATALOGO_DE_MODULOS.find((m) => m.id === "facebook")!.resumo).toBe("O mesmo, no Messenger e nos posts da Página.");
    expect(ehModulo("comunidades")).toBe(true);
  });

  it("Lançamentos sai com qualquer um dos três módulos novos (§4.14, §4.21)", () => {
    expect(liberado(["instagram"], MODULOS_DOS_LANCAMENTOS)).toBe(true);
    expect(liberado(["facebook"], MODULOS_DOS_LANCAMENTOS)).toBe(true);
    expect(liberado(["comunidades"], MODULOS_DOS_LANCAMENTOS)).toBe(true);
    expect(liberado(["linkedin", "whatsapp"], MODULOS_DOS_LANCAMENTOS)).toBe(false);
  });

  it("libera quando a organização tem pelo menos um dos módulos exigidos; sem exigência, é da base", () => {
    expect(liberado(["linkedin"], "linkedin")).toBe(true);
    expect(liberado(["linkedin"], "whatsapp")).toBe(false);
    expect(liberado(["telegram"], ["whatsapp", "telegram"])).toBe(true);
    expect(liberado([], ["whatsapp", "telegram"])).toBe(false);
    expect(liberado([], undefined)).toBe(true);
  });

  it("o primeiro acesso é do SDR no LinkedIn e só tranca o app quando ele é o único módulo", () => {
    expect(soOPrimeiroAcesso(["linkedin"], false)).toBe(true);
    expect(soOPrimeiroAcesso(["linkedin"], true)).toBe(false);
    expect(soOPrimeiroAcesso(["linkedin", "whatsapp"], false)).toBe(false);
    expect(soOPrimeiroAcesso(["whatsapp"], false)).toBe(false);
    expect(soOPrimeiroAcesso([], false)).toBe(false);

    expect(linkedinNoPrimeiroAcesso(["linkedin", "whatsapp"], false)).toBe(true);
    expect(linkedinNoPrimeiroAcesso(["whatsapp"], false)).toBe(false);
    expect(linkedinNoPrimeiroAcesso(["linkedin"], true)).toBe(false);
  });

  it("lê a lista de quem é da plataforma em qualquer separador e compara sem caixa", () => {
    const admins = lerAdminsDaPlataforma(" Arthur@GuessLess.com.br, midia@guessless.com.br;ops@guessless.com.br  nada ");
    expect(admins).toEqual(["arthur@guessless.com.br", "midia@guessless.com.br", "ops@guessless.com.br"]);
    expect(ehAdminDaPlataforma("ARTHUR@guessless.com.br", admins)).toBe(true);
    expect(ehAdminDaPlataforma("outro@guessless.com.br", admins)).toBe(false);
    expect(ehAdminDaPlataforma(null, admins)).toBe(false);
    expect(lerAdminsDaPlataforma(undefined)).toEqual([]);
  });

  it("o motivo da mudança vira uma linha de até 300 caracteres", () => {
    expect(motivoDaMudanca("  contratou\n o módulo  ")).toBe("contratou o módulo");
    expect(motivoDaMudanca("   ")).toBeNull();
    expect(motivoDaMudanca(42)).toBeNull();
    expect(motivoDaMudanca("x".repeat(400))).toHaveLength(300);
  });
});
