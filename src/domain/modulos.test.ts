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

  describe("domínio inteiro na plataforma (SDR-126)", () => {
    const daCasa = lerAdminsDaPlataforma("@guessless.com.br,@guessless.ca");

    it("lê as entradas de domínio como vieram, em minúsculas", () => {
      expect(lerAdminsDaPlataforma(" @GuessLess.com.br; @guessless.ca ")).toEqual(["@guessless.com.br", "@guessless.ca"]);
    });

    it("abre para qualquer e-mail @guessless.com.br", () => {
      expect(ehAdminDaPlataforma("midia@guessless.com.br", daCasa)).toBe(true);
    });

    it("abre para qualquer e-mail @guessless.ca", () => {
      expect(ehAdminDaPlataforma("ana@guessless.ca", daCasa)).toBe(true);
    });

    it("não abre para domínio que só termina parecido", () => {
      expect(ehAdminDaPlataforma("x@evilguessless.com.br", daCasa)).toBe(false);
    });

    it("não abre para domínio da casa seguido de outro", () => {
      expect(ehAdminDaPlataforma("x@guessless.com.br.evil.com", daCasa)).toBe(false);
    });

    it("não abre para subdomínio", () => {
      expect(ehAdminDaPlataforma("x@sub.guessless.com.br", daCasa)).toBe(false);
    });

    it("não abre para e-mail com outro @ antes do domínio", () => {
      expect(ehAdminDaPlataforma("x@evil.com@guessless.com.br", daCasa)).toBe(false);
    });

    it("e-mail inteiro e domínio convivem na mesma lista", () => {
      const admins = lerAdminsDaPlataforma("arthur@gmail.com,@guessless.ca");
      expect(ehAdminDaPlataforma("arthur@gmail.com", admins)).toBe(true);
      expect(ehAdminDaPlataforma("outro@gmail.com", admins)).toBe(false);
      expect(ehAdminDaPlataforma("ana@guessless.ca", admins)).toBe(true);
    });

    it("lista vazia não abre para ninguém", () => {
      const admins = lerAdminsDaPlataforma("");
      expect(admins).toEqual([]);
      expect(ehAdminDaPlataforma("midia@guessless.com.br", admins)).toBe(false);
      expect(ehAdminDaPlataforma("arthur@gmail.com", lerAdminsDaPlataforma(undefined))).toBe(false);
    });

    it("compara sem diferenciar maiúsculas", () => {
      expect(ehAdminDaPlataforma("Midia@GuessLess.COM.BR", lerAdminsDaPlataforma("@GUESSLESS.com.br"))).toBe(true);
    });

    it("uma entrada só com @ é ignorada", () => {
      const admins = lerAdminsDaPlataforma("@ , ;@");
      expect(admins).toEqual([]);
      expect(ehAdminDaPlataforma("midia@guessless.com.br", lerAdminsDaPlataforma("@"))).toBe(false);
    });
  });

  it("o motivo da mudança vira uma linha de até 300 caracteres", () => {
    expect(motivoDaMudanca("  contratou\n o módulo  ")).toBe("contratou o módulo");
    expect(motivoDaMudanca("   ")).toBeNull();
    expect(motivoDaMudanca(42)).toBeNull();
    expect(motivoDaMudanca("x".repeat(400))).toHaveLength(300);
  });
});
