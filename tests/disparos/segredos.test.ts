import { describe, expect, it } from "vitest";
import { criarCofre } from "@/server/segredos";

const cofre = criarCofre(Buffer.alloc(32, 1).toString("base64"));

describe("cofre dos segredos dos canais (SDR-72, §5)", () => {
  it("cifra e decifra; o mesmo texto cifrado duas vezes sai diferente", () => {
    const a = cofre.cifrar("EAAG-token");
    expect(a).not.toContain("EAAG");
    expect(a).not.toBe(cofre.cifrar("EAAG-token"));
    expect(cofre.decifrar(a)).toBe("EAAG-token");
  });

  it("texto mexido ou chave errada não abre", () => {
    const cifrado = cofre.cifrar("segredo");
    const [versao, iv, etiqueta, corpo] = cifrado.split(":");
    const mexido = [versao, iv, etiqueta, Buffer.from("outra coisa").toString("base64")].join(":");
    expect(() => cofre.decifrar(mexido)).toThrow();
    expect(() => criarCofre(Buffer.alloc(32, 2).toString("base64")).decifrar(cifrado)).toThrow();
    expect(corpo).toBeTruthy();
  });

  it("o segredo derivado é o mesmo para o mesmo canal e muda de canal para canal", () => {
    expect(cofre.derivar("whatsapp-webhook", "a")).toBe(cofre.derivar("whatsapp-webhook", "a"));
    expect(cofre.derivar("whatsapp-webhook", "a")).not.toBe(cofre.derivar("whatsapp-webhook", "b"));
    expect(cofre.derivar("whatsapp-webhook", "a")).not.toBe(cofre.derivar("telegram-webhook", "a"));
    expect(cofre.derivar("x", "a")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("chave de tamanho errado não vale", () => {
    expect(() => criarCofre(Buffer.alloc(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
