import { describe, expect, it } from "vitest";
import { canaisDoTeste, notaDoComecoForaDoLinkedIn } from "./teste-do-sdr";

describe("canais do chat de teste (SDR-75)", () => {
  it("o LinkedIn com o módulo do LinkedIn", () => {
    expect(canaisDoTeste(["linkedin"])).toEqual(["linkedin"]);
  });

  it("cada canal novo com o seu módulo; Comunidades traz o Telegram", () => {
    expect(canaisDoTeste(["linkedin", "instagram", "facebook", "comunidades"])).toEqual(["linkedin", "instagram", "facebook", "telegram"]);
    expect(canaisDoTeste(["linkedin", "telegram"])).toEqual(["linkedin", "telegram"]);
  });

  it("a lista nunca volta vazia", () => {
    expect(canaisDoTeste(["whatsapp"])).toEqual(["linkedin"]);
    expect(canaisDoTeste([])).toEqual(["linkedin"]);
  });

  it("fora do LinkedIn, a nota diz que quem começa é a pessoa", () => {
    expect(notaDoComecoForaDoLinkedIn("instagram", "Marina")).toBe(
      "No Instagram, quem começa a conversa é a pessoa. Escreva a primeira mensagem como Marina.",
    );
    expect(notaDoComecoForaDoLinkedIn("facebook", "Marina")).toMatch(/^No Messenger,/);
    expect(notaDoComecoForaDoLinkedIn("telegram", "Marina")).toMatch(/^No Telegram,/);
  });
});
