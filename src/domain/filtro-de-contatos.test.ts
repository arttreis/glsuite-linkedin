import { describe, expect, it } from "vitest";
import { descreverFiltro, FILTRO_VAZIO, filtroDoSegmento, lerFiltro, semCondicao, sqlDoFiltro } from "./filtro-de-contatos";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const nomes = new Map([
  [A, "Cliente"],
  [B, "Inativo"],
]);

describe("filtro de contatos (SDR-70, §4.15)", () => {
  it("o que não vale vira o padrão: quem pode ser contatado, sem condição", () => {
    expect(lerFiltro(undefined)).toEqual(FILTRO_VAZIO);
    expect(lerFiltro({ canal: "sms", tags: { todas: ["x"] } })).toEqual(FILTRO_VAZIO);
    expect(FILTRO_VAZIO).toEqual({
      tags: { todas: [], alguma: [], nenhuma: [] },
      origens: [],
      linkedin: { etapas: [], campanhas: [], notaMinima: null },
      situacao: "podem",
    });
  });

  it("os valores vão nos parâmetros, numerados a partir do primeiro, e nunca no texto", () => {
    const { condicoes, parametros } = sqlDoFiltro(lerFiltro({ texto: "50%_off'; drop", tags: { alguma: [A] }, origens: ["importacao"] }), 3);
    expect(parametros).toEqual(["%50\\%\\_off'; drop%", [A], ["importacao"]]);
    expect(condicoes.join(" ")).not.toContain("drop");
    expect(condicoes[0]).toContain("$3");
    expect(condicoes[1]).toContain("$4");
    expect(condicoes[2]).toContain("$5");
    expect(condicoes.at(-1)).toBe("c.nao_contatar_em is null");
  });

  it("texto com 4 dígitos ou mais também procura no telefone", () => {
    expect(sqlDoFiltro(lerFiltro({ texto: "(11) 9999" }), 1).parametros).toEqual(["%(11) 9999%", "%119999%"]);
    expect(sqlDoFiltro(lerFiltro({ texto: "Ana 12" }), 1).parametros).toEqual(["%Ana 12%"]);
  });

  it("descreve o filtro em português", () => {
    expect(descreverFiltro(FILTRO_VAZIO, nomes)).toBe("Todos os contatos que podem ser contatados");
    expect(descreverFiltro(lerFiltro({ tags: { alguma: [A], nenhuma: [B] }, canal: "whatsapp" }), nomes)).toBe(
      "Contatos com a tag Cliente, sem a tag Inativo e que podem receber pelo WhatsApp",
    );
    expect(descreverFiltro(lerFiltro({ tags: { todas: [A, B] }, situacao: "todos" }), nomes)).toBe("Todos os contatos com todas as tags Cliente, Inativo");
    expect(descreverFiltro(lerFiltro({ situacao: "nao_contatar" }), nomes)).toBe("Contatos que pediram para não ser contatados");
    expect(descreverFiltro(lerFiltro({ tags: { alguma: ["33333333-3333-4333-8333-333333333333"] } }), nomes)).toBe("Contatos com a tag (tag apagada)");
  });

  it("descreve as condições do LinkedIn e a data (SDR-71, §4.17)", () => {
    const campanha = "44444444-4444-4444-8444-444444444444";
    const comCampanha = new Map([...nomes, [campanha, "Diretores"]]);
    const filtro = lerFiltro({ linkedin: { etapas: ["conversando", "qualificado"], campanhas: [campanha], notaMinima: 70 }, desde: "2026-10-01" });
    expect(descreverFiltro(filtro, comCampanha)).toBe(
      "Contatos que estão em Conversando ou Qualificado no Pipeline, da campanha Diretores, com nota de aderência a partir de 70 e que entraram a partir de 01/10/2026",
    );
    expect(filtroDoSegmento({ situacao: "todos", canal: "whatsapp" })).toMatchObject({ situacao: "podem", canal: "whatsapp" });
    expect(semCondicao(FILTRO_VAZIO)).toBe(true);
    expect(semCondicao(lerFiltro({ desde: "2026-10-01" }))).toBe(false);
  });
});
