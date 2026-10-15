import { AnthropicError, APIConnectionError } from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ErroDoModelo } from "@/server/agente/modelo";
import { foraDoFormato } from "./claude";

describe("erro da saída estruturada do resumo (SDR-67)", () => {
  it("resposta que não fecha com o esquema vira mensagem clara, não 'a IA não respondeu'", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const erro = new AnthropicError("Failed to parse structured output: invalid\nValidation issues:\n  - resumo: Required");
    expect(() => foraDoFormato(erro)).toThrow(new ErroDoModelo("A IA devolveu o resumo fora do formato. Tente de novo."));
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("erro de rede segue como erro, para virar 'a IA não respondeu'", () => {
    const erro = new APIConnectionError({ message: "Connection error." });
    expect(() => foraDoFormato(erro)).toThrow(erro);
  });
});
