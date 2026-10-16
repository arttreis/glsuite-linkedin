import { describe, expect, it } from "vitest";
import { CANAIS_DE_DISPARO, ehCanalDeDisparo, NOME_DO_CANAL, TIPOS_DE_CANAL } from "./canais";

describe("canais (SDR-74, D22)", () => {
  it("todo canal de disparo é um tipo de canal; Instagram, Facebook e o número dos grupos não disparam", () => {
    for (const canal of CANAIS_DE_DISPARO) expect(TIPOS_DE_CANAL).toContain(canal);
    expect(ehCanalDeDisparo("whatsapp")).toBe(true);
    expect(ehCanalDeDisparo("telegram")).toBe(true);
    expect(ehCanalDeDisparo("instagram")).toBe(false);
    expect(ehCanalDeDisparo("facebook")).toBe(false);
    expect(ehCanalDeDisparo("whatsapp_app")).toBe(false);
    expect(ehCanalDeDisparo(undefined)).toBe(false);
  });

  it("cada um dos cinco tem nome", () => {
    expect(TIPOS_DE_CANAL).toHaveLength(5);
    for (const tipo of TIPOS_DE_CANAL) expect(NOME_DO_CANAL[tipo]).toBeTruthy();
    expect(NOME_DO_CANAL.whatsapp_app).toBe("WhatsApp dos grupos");
  });
});
