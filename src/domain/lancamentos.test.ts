import { describe, expect, it } from "vitest";
import {
  encerraSozinhoEm,
  faseDoLancamento,
  lerDadosDoLancamento,
  lerSdrDoLancamento,
  paraCampoDeData,
  problemaNasDatas,
  proximaData,
  quandoNoLancamento,
  type DatasDoLancamento,
} from "./lancamentos";

/** Horário de Brasília (-03:00, sem horário de verão desde 2019). */
const br = (local: string) => new Date(`${local}:00-03:00`);

const DATAS: DatasDoLancamento = {
  captacaoEm: br("2026-10-13T08:00"),
  aulas: [
    { nome: "Aula 1", quando: br("2026-10-20T20:00"), link: null },
    { nome: "O método", quando: br("2026-10-22T20:00"), link: "https://exemplo.com/aula-2" },
  ],
  carrinhoAbreEm: br("2026-10-24T20:00"),
  carrinhoFechaEm: br("2026-10-31T23:59"),
};

const SEM_DATAS: DatasDoLancamento = { captacaoEm: null, aulas: [], carrinhoAbreEm: null, carrinhoFechaEm: null };

const formulario = (extra: Record<string, unknown> = {}) => ({
  nome: "Lançamento Outubro",
  produto: "Curso de tráfego",
  captacaoEm: "2026-10-13T08:00",
  aulas: [
    { nome: "Aula 1", quando: "2026-10-20T20:00", link: "" },
    { nome: "Aula 2", quando: "2026-10-22T20:00", link: "https://exemplo.com/aula-2" },
  ],
  carrinhoAbreEm: "2026-10-24T20:00",
  carrinhoFechaEm: "2026-10-31T23:59",
  ...extra,
});

describe("fase do lançamento (SDR-74, §4.21)", () => {
  it("no minuto exato em que o carrinho abre já é carrinho; um minuto antes, aulas", () => {
    expect(faseDoLancamento(DATAS, br("2026-10-24T20:00"))).toBe("carrinho");
    expect(faseDoLancamento(DATAS, br("2026-10-24T19:59"))).toBe("aulas");
  });

  it("na hora da primeira aula é aulas; um minuto antes e antes da captação, captação", () => {
    expect(faseDoLancamento(DATAS, br("2026-10-20T20:00"))).toBe("aulas");
    expect(faseDoLancamento(DATAS, br("2026-10-20T19:59"))).toBe("captacao");
    expect(faseDoLancamento(DATAS, br("2026-10-01T10:00"))).toBe("captacao");
  });

  it("na hora em que o carrinho fecha é encerrado", () => {
    expect(faseDoLancamento(DATAS, br("2026-10-31T23:59"))).toBe("encerrado");
    expect(faseDoLancamento(DATAS, br("2026-10-31T23:58"))).toBe("carrinho");
  });

  it("sem datas não há fase; só com o carrinho, vai de captação direto ao carrinho", () => {
    expect(faseDoLancamento(SEM_DATAS, br("2026-10-20T20:00"))).toBe("sem_datas");
    const soCarrinho: DatasDoLancamento = { ...SEM_DATAS, carrinhoAbreEm: br("2026-10-24T20:00"), carrinhoFechaEm: br("2026-10-31T23:59") };
    expect(faseDoLancamento(soCarrinho, br("2026-10-20T20:00"))).toBe("captacao");
    expect(faseDoLancamento(soCarrinho, br("2026-10-24T20:00"))).toBe("carrinho");
    expect(faseDoLancamento(soCarrinho, br("2026-11-01T00:00"))).toBe("encerrado");
  });
});

describe("problema nas datas (§4.21)", () => {
  it("datas em ordem passam, mesmo no passado ou com a captação depois da aula", () => {
    expect(problemaNasDatas(DATAS)).toBeNull();
    expect(problemaNasDatas({ ...DATAS, captacaoEm: br("2026-10-21T08:00") })).toBeNull();
  });

  it("aula fora de ordem diz qual está antes de qual", () => {
    const foraDeOrdem = { ...DATAS, aulas: [DATAS.aulas[1]!, DATAS.aulas[0]!] };
    expect(problemaNasDatas(foraDeOrdem)).toBe("As aulas precisam estar em ordem de data: a aula 2 está antes da aula 1.");
    const mesmaHora = { ...DATAS, aulas: [DATAS.aulas[0]!, { ...DATAS.aulas[1]!, quando: DATAS.aulas[0]!.quando }] };
    expect(problemaNasDatas(mesmaHora)).toBe("As aulas precisam estar em ordem de data: a aula 2 está antes da aula 1.");
  });

  it("carrinho que fecha antes de abrir, ou no mesmo instante, não passa", () => {
    const motivo = "O carrinho fecha antes de abrir. Confira as duas datas.";
    expect(problemaNasDatas({ ...DATAS, carrinhoFechaEm: br("2026-10-24T19:00") })).toBe(motivo);
    expect(problemaNasDatas({ ...DATAS, carrinhoFechaEm: DATAS.carrinhoAbreEm })).toBe(motivo);
  });

  it("aula sem nome ou sem data (gravada de outro jeito) não passa", () => {
    expect(problemaNasDatas({ ...DATAS, aulas: [{ nome: " ", quando: br("2026-10-20T20:00"), link: null }] })).toBe("Cada aula precisa de nome e data.");
    expect(problemaNasDatas({ ...DATAS, aulas: [{ nome: "Aula 1", quando: new Date(Number.NaN), link: null }] })).toBe("Cada aula precisa de nome e data.");
  });
});

describe("datas do lançamento", () => {
  it("encerra sozinho 7 dias depois de o carrinho fechar; sem a data, nunca", () => {
    expect(encerraSozinhoEm(DATAS)).toEqual(br("2026-11-07T23:59"));
    expect(encerraSozinhoEm(SEM_DATAS)).toBeNull();
  });

  it("a próxima data é a primeira que ainda não chegou", () => {
    expect(proximaData(DATAS, br("2026-10-21T10:00"))).toEqual({ rotulo: "Aula: O método", em: br("2026-10-22T20:00") });
    expect(proximaData(DATAS, br("2026-10-01T10:00"))).toEqual({ rotulo: "Captação começa", em: br("2026-10-13T08:00") });
    expect(proximaData(DATAS, br("2026-10-31T23:59"))).toBeNull();
    expect(proximaData(SEM_DATAS, br("2026-10-21T10:00"))).toBeNull();
  });

  it("mostra a data como a tela fala, no horário de Brasília", () => {
    expect(quandoNoLancamento(br("2026-10-22T20:00"))).toBe("qui 22/10 às 20h");
    expect(quandoNoLancamento(br("2026-10-31T23:59"))).toBe("sáb 31/10 às 23h59");
    expect(paraCampoDeData(br("2026-10-20T20:00"))).toBe("2026-10-20T20:00");
    expect(paraCampoDeData(null)).toBe("");
  });
});

describe("formulário do lançamento", () => {
  it("lê o datetime-local no horário de Brasília", () => {
    const lido = lerDadosDoLancamento(formulario());
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(lido.dados.nome).toBe("Lançamento Outubro");
    expect(lido.dados.datas.aulas[0]!.quando.toISOString()).toBe("2026-10-20T23:00:00.000Z");
    expect(lido.dados.datas.aulas[0]!.link).toBeNull();
    expect(lido.dados.datas.aulas[1]!.link).toBe("https://exemplo.com/aula-2");
    expect(lido.dados.datas.carrinhoFechaEm!.toISOString()).toBe("2026-11-01T02:59:00.000Z");
  });

  it("o nome perde o espaço sobrando; sem datas e sem produto também salva", () => {
    const lido = lerDadosDoLancamento({ nome: "  Lançamento   Outubro ", aulas: [{ nome: "", quando: "", link: "" }] });
    expect(lido).toEqual({ ok: true, dados: { nome: "Lançamento Outubro", produto: null, datas: SEM_DATAS } });
  });

  it("recusa nome com 41 caracteres, nome só com espaços, link de aula http:// e 21 aulas, com o motivo", () => {
    expect(lerDadosDoLancamento(formulario({ nome: "x".repeat(41) }))).toEqual({
      ok: false,
      erro: "O nome vai até 40 caracteres: ele vira a tag de quem entra no lançamento.",
    });
    expect(lerDadosDoLancamento(formulario({ nome: "x".repeat(40) })).ok).toBe(true);
    expect(lerDadosDoLancamento(formulario({ nome: "    " }))).toEqual({ ok: false, erro: "Dê um nome ao lançamento." });
    expect(lerDadosDoLancamento(formulario({ aulas: [{ nome: "Aula 1", quando: "2026-10-20T20:00", link: "http://exemplo.com" }] }))).toEqual({
      ok: false,
      erro: "O link precisa começar com https://.",
    });
    const aulas = Array.from({ length: 21 }, (_, i) => ({ nome: `Aula ${i + 1}`, quando: `2026-10-${String(i + 1).padStart(2, "0")}T20:00`, link: "" }));
    expect(lerDadosDoLancamento(formulario({ aulas, carrinhoAbreEm: "", carrinhoFechaEm: "" }))).toEqual({ ok: false, erro: "No máximo 20 aulas." });
  });

  it("aula sem nome ou sem data, aula fora de ordem e carrinho invertido não salvam", () => {
    expect(lerDadosDoLancamento(formulario({ aulas: [{ nome: "Aula 1", quando: "", link: "" }] }))).toEqual({ ok: false, erro: "Cada aula precisa de nome e data." });
    expect(lerDadosDoLancamento(formulario({ aulas: [{ nome: "", quando: "2026-10-20T20:00", link: "" }] }))).toEqual({ ok: false, erro: "Cada aula precisa de nome e data." });
    expect(
      lerDadosDoLancamento(
        formulario({
          aulas: [
            { nome: "Aula 1", quando: "2026-10-22T20:00", link: "" },
            { nome: "Aula 2", quando: "2026-10-20T20:00", link: "" },
          ],
        }),
      ),
    ).toEqual({ ok: false, erro: "As aulas precisam estar em ordem de data: a aula 2 está antes da aula 1." });
    expect(lerDadosDoLancamento(formulario({ carrinhoFechaEm: "2026-10-24T20:00" }))).toEqual({ ok: false, erro: "O carrinho fecha antes de abrir. Confira as duas datas." });
    expect(lerDadosDoLancamento(formulario({ captacaoEm: "amanhã" }))).toMatchObject({ ok: false, erro: expect.stringContaining("Captação começa") });
  });
});

describe("aba SDR do lançamento", () => {
  const sdr = (extra: Record<string, unknown> = {}) => ({
    preco: " 12x de R$ 97 ou R$ 997 à vista ",
    perguntas: [
      { pergunta: "Tem garantia?", resposta: "Sete dias." },
      { pergunta: "", resposta: "" },
    ],
    sdrSabe: "",
    linkDoCarrinho: "https://pay.hotmart.com/X123",
    ...extra,
  });

  it("guarda o preço, as perguntas, o que o SDR sabe e o link; vazio vira null", () => {
    expect(lerSdrDoLancamento(sdr())).toEqual({
      ok: true,
      dados: {
        preco: "12x de R$ 97 ou R$ 997 à vista",
        perguntas: [{ pergunta: "Tem garantia?", resposta: "Sete dias." }],
        sdrSabe: null,
        linkDoCarrinho: "https://pay.hotmart.com/X123",
      },
    });
    expect(lerSdrDoLancamento(sdr({ sdrSabe: "x".repeat(2000) })).ok).toBe(true);
  });

  it("recusa 2.001 caracteres no que o SDR sabe, link sem https e pergunta sem resposta", () => {
    expect(lerSdrDoLancamento(sdr({ sdrSabe: "x".repeat(2001) }))).toEqual({ ok: false, erro: "No máximo 2.000 caracteres no que o SDR sabe." });
    expect(lerSdrDoLancamento(sdr({ linkDoCarrinho: "pay.hotmart.com/X123" }))).toEqual({ ok: false, erro: "O link do carrinho precisa começar com https://." });
    expect(lerSdrDoLancamento(sdr({ perguntas: [{ pergunta: "Tem garantia?", resposta: " " }] }))).toEqual({ ok: false, erro: "Cada pergunta precisa da resposta." });
  });
});
