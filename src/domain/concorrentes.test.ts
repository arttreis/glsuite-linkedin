import { describe, expect, it } from "vitest";
import {
  analiseDaResposta,
  concorrentesDaAnalise,
  MAX_ANALISADOS,
  textoDosConcorrentes,
  vagaParaAnalisar,
  validarConcorrentes,
  type LeituraDoConcorrente,
} from "./concorrentes";
import { MERCADO_VAZIO } from "./dossie";

const AGORA = new Date("2026-10-15T14:00:00Z");

describe("concorrentes: a lista inicial vem das alternativas da análise (SDR-68)", () => {
  it("cada alternativa vira nome, o que é e de onde veio", () => {
    const lista = concorrentesDaAnalise({
      ...MERCADO_VAZIO,
      alternativas: [
        "RD Station: automação de marketing para PMEs (o site cita)",
        "Planilha: controle manual das vendas (a categoria implica)",
        "Agência de marketing",
      ],
    });
    expect(lista).toEqual([
      { nome: "RD Station", descricao: "automação de marketing para PMEs", site: null, origem: "site" },
      { nome: "Planilha", descricao: "controle manual das vendas", site: null, origem: "categoria" },
      { nome: "Agência de marketing", descricao: "", site: null, origem: "analise" },
    ]);
  });

  it("alternativa longa sem dois-pontos vira nome curto e a frase inteira na descrição", () => {
    const longa = "Fazer tudo dentro de casa com um time pequeno de vendas que prospecta à mão pelo LinkedIn e por indicação";
    const [item] = concorrentesDaAnalise({ ...MERCADO_VAZIO, alternativas: [longa] });
    expect(item!.nome.length).toBeLessThanOrEqual(80);
    expect(item!.nome.endsWith("…")).toBe(true);
    expect(item!.descricao).toBe(longa);
  });
});

describe("concorrentes: a lista editada", () => {
  it("acrescentar, editar e tirar valem, com o site normalizado", () => {
    const resultado = validarConcorrentes([
      { nome: "  Ploomes ", descricao: "CRM", site: "ploomes.com", origem: "voce" },
      { nome: "Planilha", descricao: "", site: "", origem: "categoria" },
    ]);
    expect(resultado).toEqual({
      ok: true,
      lista: [
        { nome: "Ploomes", descricao: "CRM", site: "https://ploomes.com/", origem: "voce" },
        { nome: "Planilha", descricao: "", site: null, origem: "categoria" },
      ],
    });
  });

  it("site que não é endereço público é recusado", () => {
    expect(validarConcorrentes([{ nome: "Interno", descricao: "", site: "http://192.168.0.10", origem: "voce" }])).toEqual({
      ok: false,
      erro: "Site de Interno: Use um endereço público, como https://suaempresa.com.br.",
    });
  });

  it("nome repetido e nome em branco são recusados com o motivo", () => {
    expect(
      validarConcorrentes([
        { nome: "Ploomes", descricao: "", site: null, origem: "voce" },
        { nome: "ploomes", descricao: "", site: null, origem: "voce" },
      ]),
    ).toEqual({ ok: false, erro: "ploomes aparece duas vezes na lista." });
    expect(validarConcorrentes([{ nome: "", descricao: "x", site: null, origem: "voce" }])).toEqual({
      ok: false,
      erro: "Concorrentes, item 1, nome: não pode ficar em branco.",
    });
  });

  it("lista vazia é 'não tenho concorrente direto'", () => {
    expect(validarConcorrentes([])).toEqual({ ok: true, lista: [] });
  });
});

describe("concorrentes: teto de analisados", () => {
  const prontas = (n: number) =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i): [string, LeituraDoConcorrente] => [
        `c${i}.com.br`,
        { status: "pronta", em: AGORA.toISOString(), analise: { o_que_vende: "x", para_quem: null, posicionamento: null, onde_voce_ganha: [] }, paginas: [] },
      ]),
    );

  it(`o sexto concorrente analisado é recusado; os ${MAX_ANALISADOS} primeiros passam`, () => {
    expect(vagaParaAnalisar(prontas(4), "novo.com.br", AGORA)).toEqual({ ok: true, jaLido: null });
    expect(vagaParaAnalisar(prontas(5), "novo.com.br", AGORA)).toEqual({
      ok: false,
      erro: "Você já analisou 5 concorrentes, o máximo por empresa.",
    });
  });

  it("domínio já lido devolve a análise sem gastar vaga, mesmo com o teto cheio", () => {
    const resultado = vagaParaAnalisar(prontas(5), "c2.com.br", AGORA);
    expect(resultado).toMatchObject({ ok: true, jaLido: { o_que_vende: "x" } });
  });

  it("leitura em andamento trava; parada há mais de 5 minutos recomeça", () => {
    const lendo = { "a.com.br": { status: "lendo" as const, em: new Date(AGORA.getTime() - 60_000).toISOString() } };
    expect(vagaParaAnalisar(lendo, "a.com.br", AGORA)).toEqual({ ok: false, erro: "Já estou lendo esse site. Espere terminar." });
    const parada = { "a.com.br": { status: "lendo" as const, em: new Date(AGORA.getTime() - 6 * 60_000).toISOString() } };
    expect(vagaParaAnalisar(parada, "a.com.br", AGORA)).toEqual({ ok: true, jaLido: null });
  });
});

describe("concorrentes: a resposta da IA vale item a item", () => {
  it("campo longo descarta só aquele item", () => {
    const resultado = analiseDaResposta({
      o_que_vende: "CRM para PMEs",
      para_quem: "x".repeat(301),
      posicionamento: "O CRM mais simples",
      onde_voce_ganha: ["Atendimento em português", "y".repeat(201), "Implantação em uma semana"],
    });
    expect(resultado).toEqual({
      analise: {
        o_que_vende: "CRM para PMEs",
        para_quem: null,
        posicionamento: "O CRM mais simples",
        onde_voce_ganha: ["Atendimento em português", "Implantação em uma semana"],
      },
      descartados: 2,
    });
  });

  it("sem nada aproveitável, não há análise", () => {
    expect(analiseDaResposta({ o_que_vende: "", para_quem: " ", posicionamento: "z".repeat(400), onde_voce_ganha: [] })).toBeNull();
  });

  it("o texto para os prompts leva a análise, com 'onde ganha' marcado como hipótese", () => {
    const texto = textoDosConcorrentes([
      {
        nome: "Ploomes",
        descricao: "CRM",
        site: "https://ploomes.com/",
        origem: "voce",
        analise: { o_que_vende: "CRM", para_quem: "PMEs", posicionamento: null, onde_voce_ganha: ["Implantação rápida"] },
      },
      { nome: "Planilha", descricao: "", site: null, origem: "categoria", analise: null },
    ]);
    expect(texto).toBe("- Ploomes: CRM\n  vende CRM. para PMEs. onde a oferta ganha (hipótese): Implantação rápida\n- Planilha");
  });
});
