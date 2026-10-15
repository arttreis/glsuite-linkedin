import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import type { Dossie } from "./dossie";
import {
  explicarErroDoObjetivo,
  lerObjetivoConfirmado,
  LIMITE_DO_RESUMO,
  limparResumo,
  mesmasRespostas,
  respostasDoObjetivo,
  respostasIniciais,
  resumoDaIa,
  textoDoObjetivo,
  type RespostasDoObjetivo,
} from "./objetivo";

const ANALISE: Dossie = {
  empresa: { nome: "Loja da Duda", resumo: "Moda feminina." },
  produtos: [
    { nome: "Atacado", descricao: "Venda em lote.", para_quem: "multimarcas" },
    { nome: "Consultoria de vitrine", descricao: "Montagem de vitrine.", para_quem: "lojas" },
  ],
  para_quem: "Lojas multimarca.",
  diferenciais: [],
  provas: [],
  dores: [],
  objecoes: [],
  tom_de_voz: "Leve.",
  idioma: "pt",
  mercado: { segmentos: [], alternativas: [], gatilhos: [] },
};

const RESPOSTAS: RespostasDoObjetivo = {
  produtos: ["Atacado", "Consultoria de vitrine"],
  principal: "Atacado",
  acao: "qualificar",
  quem_atende: "Duda",
  duracao: 30,
  nunca: "Não oferecer desconto",
};

describe("respostas do objetivo (SDR-67)", () => {
  it("começam com os produtos da análise: o primeiro marcado e principal, propor conversa de 20 minutos com quem configura", () => {
    expect(respostasIniciais(ANALISE, "Duda")).toEqual({
      produtos: ["Atacado"],
      principal: "Atacado",
      acao: "propor_conversa",
      quem_atende: "Duda",
      duracao: 20,
      nunca: null,
    });
  });

  it("aceitam um produto fora da análise e o nunca em branco vira null", () => {
    const lido = respostasDoObjetivo.parse({ ...RESPOSTAS, produtos: ["Atacado", " Mentoria "], principal: "Mentoria", nunca: "  " });
    expect(lido).toMatchObject({ produtos: ["Atacado", "Mentoria"], principal: "Mentoria", nunca: null });
  });

  it("o principal precisa estar marcado", () => {
    const lido = respostasDoObjetivo.safeParse({ ...RESPOSTAS, principal: "Outro" });
    expect(lido.success).toBe(false);
    expect(explicarErroDoObjetivo(lido.error!)).toBe("Produto principal: O principal precisa estar marcado.");
  });

  it("sem produto marcado, diz o que falta", () => {
    const lido = respostasDoObjetivo.safeParse({ ...RESPOSTAS, produtos: [], principal: "" });
    expect(explicarErroDoObjetivo(lido.error!)).toBe("O que você quer vender: precisa de pelo menos 1.");
  });

  it("agendar direto na agenda ainda não se grava (vem no SDR-69), e a duração é uma das quatro", () => {
    expect(respostasDoObjetivo.safeParse({ ...RESPOSTAS, acao: "agendar" }).success).toBe(false);
    expect(respostasDoObjetivo.safeParse({ ...RESPOSTAS, duracao: 25 }).success).toBe(false);
    for (const duracao of [15, 20, 30, 45]) expect(respostasDoObjetivo.safeParse({ ...RESPOSTAS, duracao }).success).toBe(true);
  });

  it("a ordem dos produtos não muda as respostas", () => {
    expect(mesmasRespostas(RESPOSTAS, { ...RESPOSTAS, produtos: ["Consultoria de vitrine", "Atacado"] })).toBe(true);
    expect(mesmasRespostas(RESPOSTAS, { ...RESPOSTAS, duracao: 45 })).toBe(false);
  });

  it("viram texto com o principal, o que o SDR faz e o nunca", () => {
    const texto = textoDoObjetivo(RESPOSTAS);
    expect(texto).toContain("Produto principal: Atacado");
    expect(texto).toContain("Também vende pelo LinkedIn: Consultoria de vitrine");
    expect(texto).toContain("qualificar o lead e passar a conversa para Duda");
    expect(texto).toContain("30 minutos");
    expect(texto).toContain("Nunca: Não oferecer desconto");
    expect(textoDoObjetivo({ ...RESPOSTAS, acao: "propor_conversa" })).toContain("propor uma conversa de 30 minutos com Duda");
  });

  it("o confirmado lido do banco precisa do resumo", () => {
    expect(lerObjetivoConfirmado({ ...RESPOSTAS, resumo: "O Kakou vai prospectar." })).toMatchObject({ principal: "Atacado" });
    expect(lerObjetivoConfirmado(RESPOSTAS)).toBeNull();
    expect(lerObjetivoConfirmado(null)).toBeNull();
  });
});

describe("resumo do objetivo", () => {
  it("a resposta da IA com campo longo passa pelo parse do SDK (SDR-63)", () => {
    const formato = zodOutputFormat(resumoDaIa);
    expect(() => formato.parse(JSON.stringify({ resumo: "x".repeat(5000) }))).not.toThrow();
  });

  it("resumo longo é cortado em 4 frases, não recusado", () => {
    const longo = "Primeira frase. Segunda frase! Terceira frase? Quarta frase. Quinta frase. Sexta.";
    expect(limparResumo(longo)).toBe("Primeira frase. Segunda frase! Terceira frase? Quarta frase.");
  });

  it("frase gigante é cortada no limite, numa palavra inteira", () => {
    const resumo = limparResumo(`O Kakou vai ${"prospectar lojas ".repeat(80)}`)!;
    expect(resumo.length).toBeLessThanOrEqual(LIMITE_DO_RESUMO);
    expect(resumo.endsWith("…")).toBe(true);
    expect(resumo).not.toMatch(/\s…$/);
  });

  it("espaços e quebras somem; vazio vira null", () => {
    expect(limparResumo("  O Kakou vai\n\nprospectar lojas.  ")).toBe("O Kakou vai prospectar lojas.");
    expect(limparResumo("   ")).toBeNull();
  });
});
