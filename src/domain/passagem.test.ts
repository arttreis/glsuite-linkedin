import { describe, expect, it } from "vitest";
import { limiarDaCautela, problemaDaPonte, resumoEmTresLinhas } from "./passagem";

describe("passagem da conversa para você (SDR-60)", () => {
  it("mais cauteloso pede mais certeza para seguir sozinho; sem escolha vale o equilibrado", () => {
    expect(limiarDaCautela("cauteloso")).toBeGreaterThan(limiarDaCautela("equilibrado"));
    expect(limiarDaCautela("equilibrado")).toBeGreaterThan(limiarDaCautela("solto"));
    expect(limiarDaCautela(undefined)).toBe(0.7);
  });
});

describe("passagem de bastão (SDR-66)", () => {
  describe("a ponte", () => {
    it.each([
      "Boa pergunta, deixa eu ver isso direitinho e te respondo até amanhã.",
      "Faz sentido. Vou olhar com calma e te retorno nos próximos dias.",
      "Good question, let me check and get back to you tomorrow.",
    ])("passa: %s", (texto) => {
      expect(problemaDaPonte(texto)).toBeNull();
    });

    it.each([
      "Boa pergunta, te respondo ainda hoje.",
      "Já já te mando isso.",
      "Te respondo em uma hora.",
      "Let me check and reply in a few minutes.",
    ])("nunca promete menos que 1 dia útil: %s", (texto) => {
      expect(problemaDaPonte(texto)).toBe("A ponte promete prazo menor que 1 dia útil.");
    });

    it.each(["Vou passar para o meu colega e ele te responde.", "Nossa equipe te retorna até amanhã.", "Someone from my team will reach out."])(
      "nunca diz que outra pessoa vai responder: %s",
      (texto) => {
        expect(problemaDaPonte(texto)).toBe("A ponte diz que outra pessoa vai responder.");
      },
    );

    it("segue as regras da casa: até 30 palavras, numa linha só", () => {
      expect(problemaDaPonte(Array.from({ length: 31 }, () => "boa").join(" "))).toBe("A ponte passa de 30 palavras.");
      expect(problemaDaPonte("Boa pergunta.\nTe respondo até amanhã.")).toBe("A ponte tem mais de uma linha.");
    });
  });

  it("o resumo fica em até 3 linhas, sem linha em branco", () => {
    expect(resumoEmTresLinhas("Ana, CEO da Acme.\n\nFalaram de margem.\nPediu preço.\nLinha a mais.")).toBe(
      "Ana, CEO da Acme.\nFalaram de margem.\nPediu preço.",
    );
  });
});
