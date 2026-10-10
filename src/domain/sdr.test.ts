import { describe, expect, it } from "vitest";
import { limparEdicao } from "./edicao";
import { explicarErroDoSdr, sdr, sdrDaIa, textoDoSdr, type Sdr } from "./sdr";

const SDR: Sdr = {
  objetivo: "marcar 20 minutos com a Duda para mostrar o atacado",
  voz: "Leve e próxima, trata por você.",
  abertura: "Uma observação sobre estoque parado em multimarca, sem pedir nada.",
  qualificacao: ["Tem loja multimarca de moda feminina"],
  objecoes: [{ objecao: "Já tenho fornecedor", resposta: "Lote mínimo menor e peça que não está em toda loja." }],
  regras: ["Não falo de preço por mensagem"],
  quando_chamar_voce: ["Pedido de tabela de atacado"],
  link_agenda: null,
};

describe("SDR (SDR-42)", () => {
  it("vira o bloco do prompt com cada parte do SDR", () => {
    const texto = textoDoSdr(SDR, "Duda");
    expect(texto).toContain("Objetivo: marcar 20 minutos com a Duda");
    expect(texto).toContain("Voz de Duda:\nLeve e próxima");
    expect(texto).toContain('- "Já tenho fornecedor": Lote mínimo menor');
    expect(texto).toContain("Regras de Duda:\n- Não falo de preço por mensagem");
    expect(texto).toContain("(use escalar_humano):\n- Pedido de tabela de atacado");
  });

  it("lista vazia não entra no prompt", () => {
    const texto = textoDoSdr({ ...SDR, qualificacao: [], objecoes: [], regras: [], quando_chamar_voce: [] }, "Duda");
    expect(texto).not.toContain("Regras de Duda");
    expect(texto).not.toContain("escalar_humano");
  });

  it("a IA não escreve o link de agenda", () => {
    expect(Object.keys(sdrDaIa.shape)).not.toContain("link_agenda");
  });

  it("link de agenda só https", () => {
    expect(sdr.safeParse({ ...SDR, link_agenda: "https://cal.com/duda/20min" }).success).toBe(true);
    expect(sdr.safeParse({ ...SDR, link_agenda: "http://cal.com/duda" }).success).toBe(false);
    expect(sdr.safeParse({ ...SDR, link_agenda: "javascript:alert(1)" }).success).toBe(false);
  });

  it("erro de edição diz a parte do SDR", () => {
    const erro = sdr.safeParse(limparEdicao({ ...SDR, objetivo: "  " })).error!;
    expect(explicarErroDoSdr(erro)).toBe("Objetivo: não pode ficar em branco.");
  });
});
