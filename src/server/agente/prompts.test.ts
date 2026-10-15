import { describe, expect, it } from "vitest";
import { REGRAS_DA_CASA } from "@/domain/teste-do-sdr";
import { entradaDaAbertura, promptDeRascunho } from "./prompts";

const LEAD = {
  nome: "Marina Souza",
  cargo: "Gerente de AGC",
  empresa: "Administradora X",
  localizacao: null,
  campanha: "Administradoras",
  angulo: null,
  nicho: null,
  pesquisa: null,
};

describe("primeira mensagem (SDR-64)", () => {
  it("termina com uma pergunta fácil, mesmo que a abertura do SDR não peça", () => {
    const entrada = entradaDaAbertura({ lead: LEAD });
    expect(entrada).toContain("termina com uma pergunta curta sobre a realidade da pessoa");
    expect(entrada).toContain("Mesmo que a abertura do SDR não fale em pergunta, esta tem.");
  });

  it("o rascunho proíbe frase de efeito", () => {
    const sistema = promptDeRascunho({
      perfil: { nome: "Arthur", praca: "domestico", idioma: "pt", voz: null, regras: null, palavrasProibidas: [] },
      linkDeAgenda: null,
      responsavelDiscovery: "Arthur",
      oferta: "Diagnóstico de margem.",
    });
    expect(sistema).toContain("Nada de frase de efeito");
  });

  it("a regra está entre as regras da casa, que o ajuste do SDR não desliga", () => {
    expect(REGRAS_DA_CASA.some((regra) => regra.includes("termina com uma pergunta"))).toBe(true);
  });
});
