import { describe, expect, it } from "vitest";
import { promptDaEstruturacao, promptDaLeitura, VERSAO_DOS_PROMPTS_DO_DOSSIE } from "./prompts";

describe("prompts do dossiê (SDR-41)", () => {
  it("o Mercado é hipótese e não leva número de mercado", () => {
    const prompt = promptDaEstruturacao();
    expect(prompt).toContain('"mercado" é a única parte que é hipótese sua');
    expect(prompt).toContain("Nunca escreva número de tamanho de mercado");
    expect(prompt).toContain("Concorrente com nome só se estiver nas notas");
    expect(prompt).toContain('"(o site cita)" quando ela está nas notas ou "(a categoria implica)"');
  });

  it("a leitura anota setores, clientes e concorrentes citados, para o Mercado", () => {
    expect(promptDaLeitura({ maxPaginas: 8 })).toContain("concorrentes ou alternativas que ele menciona");
  });

  it("a versão subiu com a origem das alternativas (SDR-68)", () => {
    expect(VERSAO_DOS_PROMPTS_DO_DOSSIE).toBe("dossie-3");
  });
});
