import { describe, expect, it } from "vitest";
import { ESTADOS_DO_LEAD, podeTransicionar } from "./estados";

describe("máquina de estados do lead (§6.1)", () => {
  it.each([
    ["triagem", "na_fila"],
    ["triagem", "rejeitado"],
    ["na_fila", "convite_enviado"],
    ["convite_enviado", "aceito"],
    ["convite_enviado", "convite_retirado"],
    ["aceito", "em_sequencia"],
    ["em_sequencia", "sem_resposta"],
    ["em_conversa", "qualificado"],
    ["qualificado", "reuniao_marcada"],
    ["em_conversa", "encerrado_nao"],
    ["em_conversa", "escalado_humano"],
  ] as const)("permite %s → %s", (de, para) => {
    expect(podeTransicionar(de, para)).toBe(true);
  });

  it("qualquer estado depois do convite vai para em_conversa quando a pessoa responde", () => {
    for (const estado of ["convite_enviado", "aceito", "em_sequencia", "sem_resposta", "convite_retirado"] as const) {
      expect(podeTransicionar(estado, "em_conversa")).toBe(true);
    }
  });

  it("opt-out vale de qualquer estado e é terminal", () => {
    for (const estado of ESTADOS_DO_LEAD.filter((e) => e !== "optout")) {
      expect(podeTransicionar(estado, "optout")).toBe(true);
    }
    for (const destino of ESTADOS_DO_LEAD) {
      expect(podeTransicionar("optout", destino)).toBe(false);
    }
  });

  it.each([
    ["triagem", "convite_enviado"],
    ["rejeitado", "na_fila"],
    ["encerrado_nao", "em_conversa"],
    ["sem_resposta", "em_sequencia"],
    ["em_conversa", "em_sequencia"],
  ] as const)("recusa %s → %s", (de, para) => {
    expect(podeTransicionar(de, para)).toBe(false);
  });
});
