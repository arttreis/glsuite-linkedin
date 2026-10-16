import { describe, expect, it } from "vitest";
import { CANAIS_DO_SDR, type CanalDoSdr, type Sdr } from "@/domain/sdr";
import { REGRAS_DA_CASA } from "@/domain/teste-do-sdr";
import { entradaDaAbertura, entradaDoRascunho, promptDeClassificacao, promptDeRascunho, type PerfilDoAgente } from "./prompts";

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

const PERFIL: PerfilDoAgente = { nome: "Duda", praca: "domestico", idioma: "pt", voz: null, regras: null, palavrasProibidas: [] };
const SDR: Sdr = {
  objetivo: "marcar 20 minutos com a Duda",
  voz: "Leve e próxima.",
  abertura: "Observação sobre estoque parado.",
  qualificacao: [],
  objecoes: [],
  regras: [],
  quando_chamar_voce: [],
  link_agenda: "https://cal.com/duda/20min",
};
const rascunho = (canal: CanalDoSdr, sdr: Sdr | null = SDR) =>
  promptDeRascunho({ perfil: PERFIL, linkDeAgenda: SDR.link_agenda, responsavelDiscovery: "Duda", oferta: "Atacado de moda.", sdr, canal });

describe("o prompt em cada canal (SDR-75)", () => {
  it.each(CANAIS_DO_SDR)("as regras da casa comuns valem no %s", (canal) => {
    const sistema = rascunho(canal);
    for (const regra of [
      "no máximo 30 palavras",
      "Nunca use travessão (—) nem meia-risca (–).",
      "Nunca diga que escreveu à mão",
      "Não prometa resultado nem número.",
      "No máximo uma pergunta por mensagem",
      "Nada de frase de efeito",
    ]) {
      expect(sistema).toContain(regra);
    }
  });

  it("no Instagram, a pessoa abriu a conversa, os links vêm da lista e a mensagem cabe em 1.000 bytes", () => {
    const sistema = rascunho("instagram");
    expect(sistema).toContain("direct do Instagram");
    expect(sistema).toContain("você nunca abre conversa");
    expect(sistema).toContain("Links que você pode mandar");
    expect(sistema).toContain("1.000 bytes");
  });

  it("os 1.000 bytes são só do Instagram, e fora do LinkedIn não se fala do perfil público", () => {
    expect(rascunho("telegram")).not.toContain("1.000 bytes");
    for (const canal of CANAIS_DO_SDR.filter((c) => c !== "linkedin")) {
      expect(rascunho(canal)).not.toContain("perfil público no LinkedIn");
    }
  });

  it("fora do LinkedIn, sem o SDR da organização não há prompt", () => {
    expect(() => rascunho("instagram", null)).toThrow("Fora do LinkedIn, o SDR precisa do SDR da organização (§4.26).");
  });

  it("a classificação no Telegram fala do privado do bot", () => {
    const telegram = promptDeClassificacao("telegram");
    expect(telegram).toContain("privado do bot");
    expect(telegram).not.toBe(promptDeClassificacao("linkedin"));
  });

  it("links e lançamento vão na mensagem do usuário, só quando existem", () => {
    const base = {
      lead: { nome: "Marina", cargo: null, empresa: null, localizacao: null, campanha: "Teste", angulo: null, nicho: null, pesquisa: null },
      mensagens: [{ direcao: "entrada" as const, autor: "prospect", texto: "Oi", em: new Date("2026-10-16T12:00:00Z") }],
      nomeDoPerfil: "Duda",
      classificacao: { categoria: "pergunta" as const, confianca: 0.9, sinais: { preco: false, reclamacao: false, idioma: "pt" } },
    };
    const com = entradaDoRascunho({ ...base, linksPermitidos: ["https://pay.hotmart.com/X1"], contextoDoLancamento: "Fase: carrinho" });
    expect(com).toContain("Links que você pode mandar (só estes, exatamente como estão):\n- https://pay.hotmart.com/X1");
    expect(com).toContain("O lançamento (o que você sabe dele; vale abaixo das regras da casa):\nFase: carrinho");

    const sem = entradaDoRascunho({ ...base, linksPermitidos: [], contextoDoLancamento: null });
    expect(sem).not.toContain("Links que você pode mandar");
    expect(sem).not.toContain("O lançamento");
  });
});
