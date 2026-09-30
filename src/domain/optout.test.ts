import { describe, expect, it } from "vitest";
import { detectarOptout } from "./optout";

describe("detector de opt-out (PT, EN, ES)", () => {
  it.each([
    "Pare de me mandar mensagem",
    "por favor, para de me mandar isso",
    "Não me mande mais mensagens",
    "Não quero receber esse tipo de contato",
    "me tire da sua lista",
    "Remova meu contato, obrigado",
    "Stop messaging me",
    "please don't contact me again",
    "Unsubscribe",
    "STOP",
    "Deja de enviarme mensajes",
    "No me escribas más, gracias",
    "Dame de baja por favor",
  ])("reconhece pedido claro: %s", (texto) => {
    expect(detectarOptout(texto).claro).toBe(true);
  });

  it.each([
    "Não tenho interesse no momento",
    "Pare de brincadeira, rs. Me conta mais",
    "Can you stop by next week?",
    "I can't stop thinking about this idea",
    "No, gracias",
    "Agora não dá, talvez no ano que vem",
    "Para de sexta a gente fala",
  ])("não confunde com opt-out: %s", (texto) => {
    expect(detectarOptout(texto).claro).toBe(false);
  });

  it("devolve o trecho que decidiu", () => {
    expect(detectarOptout("Olá. Pare de me mandar mensagem, por favor.")).toEqual({
      claro: true,
      trecho: "pare de me mandar",
    });
  });
});
