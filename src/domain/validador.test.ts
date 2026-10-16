import { describe, expect, it } from "vitest";
import { validarMensagem, type ContextoDeValidacao, type RegraDoValidador } from "./validador";

const BRASIL: ContextoDeValidacao = {
  toque: "T2",
  tipo: "dm",
  origem: "template",
  praca: "domestico",
  palavrasProibidas: ["agência", "marketing", "growth", "tráfego"],
  tetoCaracteres: 350,
};

const CANADA: ContextoDeValidacao = {
  ...BRASIL,
  praca: "canada",
  palavrasProibidas: ["agency", "marketing", "growth", "traffic"],
};

const regras = (texto: string, ctx: ContextoDeValidacao = BRASIL): RegraDoValidador[] =>
  validarMensagem(texto, ctx).violacoes.map((v) => v.regra);

describe("validador de copy (§4.2)", () => {
  it("aceita uma DM limpa", () => {
    expect(validarMensagem("Oi Maria, vi que a Acme vende em três marketplaces. Faz sentido?", BRASIL)).toEqual({
      ok: true,
      violacoes: [],
    });
  });

  describe("travessão e meia-risca, em todas as mensagens", () => {
    it.each(["Oi — tudo bem?", "de 2 – 3 dias", "figura ‒ dash", "barra ― horizontal"])("bloqueia %s", (texto) => {
      expect(regras(texto)).toContain("travessao");
    });

    it("vale também para humano e para conversa", () => {
      expect(regras("Claro — posso sim", { ...BRASIL, origem: "humano", toque: null })).toContain("travessao");
    });

    it("não confunde com hífen", () => {
      expect(regras("e-commerce bem-feito")).not.toContain("travessao");
    });
  });

  describe("palavras proibidas, configuráveis por perfil e idioma", () => {
    it.each(["Sou da agência X", "Nosso MARKETING", "growth de verdade", "trafego pago", "as agências cobram"])(
      "bloqueia %s (sem acento, maiúscula ou plural)",
      (texto) => {
        expect(regras(texto)).toContain("palavra_proibida");
      },
    );

    it("não bloqueia palavra que só contém o termo no meio", () => {
      expect(regras("Refém do marketplace")).not.toContain("palavra_proibida");
    });

    it("usa a lista do perfil", () => {
      expect(regras("We are an agency", CANADA)).toContain("palavra_proibida");
      expect(regras("We are an agency", BRASIL)).not.toContain("palavra_proibida");
    });

    it("diz qual palavra achou", () => {
      expect(validarMensagem("Somos uma agência", BRASIL).violacoes[0]!.mensagem).toBe('Usa a palavra proibida "agência".');
    });
  });

  describe("URL, só em T1 a T4", () => {
    it.each(["veja https://guessless.com.br", "acesse www.acme.com", "agenda em calendly.com/juliano", "bit.ly/abc", "fale com joao@acme.com.br"])(
      "bloqueia %s na régua",
      (texto) => {
        expect(regras(texto)).toContain("url");
      },
    );

    it("não confunde abreviação e decimal com link", () => {
      expect(regras("A Acme S.A. cresceu 1.5x, ok?")).not.toContain("url");
    });

    it("não se aplica à conversa depois da resposta", () => {
      expect(regras("Agenda: https://cal.com/juliano", { ...BRASIL, toque: null, origem: "humano" })).not.toContain("url");
    });
  });

  describe("teto de caracteres por toque", () => {
    it("bloqueia acima do teto com números na mensagem", () => {
      const resultado = validarMensagem("a".repeat(181), { ...BRASIL, toque: "T4", tetoCaracteres: 180 });
      expect(resultado.violacoes).toEqual([{ regra: "teto_caracteres", mensagem: "Tem 181 caracteres; o teto do T4 é 180." }]);
    });

    it("aceita exatamente o teto", () => {
      expect(regras("a".repeat(180), { ...BRASIL, toque: "T4", tetoCaracteres: 180 })).toEqual([]);
    });
  });

  it("bloqueia nota de convite acima do limite do LinkedIn da conta", () => {
    const convite: ContextoDeValidacao = { ...BRASIL, toque: "T1", tipo: "convite", tetoCaracteres: 250, limiteNotaConvite: 200 };
    expect(regras("a".repeat(201), convite)).toEqual(["limite_nota_convite"]);
    expect(regras("", convite)).toEqual([]);
  });

  describe("nunca afirmar que foi escrita à mão", () => {
    it.each([
      "Escrevi à mão, prometo",
      "Não é mensagem automática",
      "This is handwritten",
      "I'm not a bot",
      "Mensaje escrito a mano",
    ])("bloqueia %s em texto automático", (texto) => {
      expect(regras(texto, { ...BRASIL, origem: "ia", toque: null })).toContain("escrita_a_mao");
      expect(regras(texto, { ...BRASIL, origem: "template" })).toContain("escrita_a_mao");
    });

    it("humano escrevendo de verdade pode dizer", () => {
      expect(regras("Escrevi à mão", { ...BRASIL, origem: "humano" })).not.toContain("escrita_a_mao");
    });
  });


  it("bloqueia variável que sobrou sem preencher", () => {
    expect(regras("Oi {{first_name}}")).toContain("token_nao_resolvido");
  });

  it("bloqueia DM vazia", () => {
    expect(regras("   ")).toEqual(["vazio"]);
  });

  describe("regras extras para o texto da IA", () => {
    const conversa: ContextoDeValidacao = { ...BRASIL, toque: null, origem: "ia", linkDeAgenda: "https://cal.com/juliano/30min" };

    it("não deixa a IA puxar para WhatsApp, e-mail ou telefone", () => {
      expect(regras("Me chama no WhatsApp?", conversa)).toContain("escalada_canal");
      expect(regras("Pode me mandar um e-mail?", conversa)).toContain("escalada_canal");
      expect(regras("Liga no +55 11 99999-8888", conversa)).toContain("escalada_canal");
    });

    it("só aceita o link de agenda configurado", () => {
      expect(regras("Escolhe um horário: https://cal.com/juliano/30min", conversa)).toEqual([]);
      expect(regras("Veja https://site-qualquer.com", conversa)).toContain("link_nao_permitido");
    });
  });

  describe("fora do LinkedIn, os links do lançamento (SDR-75)", () => {
    const foraDoLinkedIn: ContextoDeValidacao = {
      ...BRASIL,
      toque: null,
      origem: "ia",
      linkDeAgenda: null,
      linksPermitidos: ["https://pay.hotmart.com/X1"],
    };

    it("link da lista passa, mesmo com a pontuação da frase colada", () => {
      expect(validarMensagem("Aqui: https://pay.hotmart.com/X1.", foraDoLinkedIn)).toEqual({ ok: true, violacoes: [] });
    });

    it("link fora da lista é barrado, com o link na mensagem", () => {
      expect(validarMensagem("Dá uma olhada em https://outro.com/oferta", foraDoLinkedIn).violacoes).toEqual([
        {
          regra: "link_nao_permitido",
          mensagem: "A IA só pode mandar os links do lançamento e o de agenda (achei https://outro.com/oferta).",
        },
      ]);
    });

    it("o link de agenda passa; um da lista e um de fora, barra", () => {
      const comAgenda = { ...foraDoLinkedIn, linkDeAgenda: "https://cal.com/duda/20min" };
      expect(regras("Marca aqui: https://cal.com/duda/20min", comAgenda)).toEqual([]);
      expect(regras("Pague em https://pay.hotmart.com/X1 ou em https://outro.com", comAgenda)).toEqual(["link_nao_permitido"]);
    });

    it("texto de humano não passa por esta regra, como hoje", () => {
      expect(regras("Veja https://outro.com/oferta", { ...foraDoLinkedIn, origem: "humano" })).not.toContain("link_nao_permitido");
    });
  });
});
