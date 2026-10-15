import { describe, expect, it } from "vitest";
import { buscaDoPublico, cargoDaBusca, mesmosFiltros, saldoDeBusca, tamanhoDoPublico, type BuscaDoPublico } from "./busca";

const BUSCA: BuscaDoPublico = {
  cargos: ["Head de E-commerce", "Diretor de E-commerce"],
  palavras: "",
  regioes: [{ id: "106057199", nome: "Brasil" }],
  setores: [],
  lista: null,
  parte: 0,
  cursor: "pagina-3",
  assinatura: null,
  esgotada: false,
};

describe("busca do público", () => {
  it("junta os cargos com OR, entre aspas, sem aspas soltas", () => {
    expect(cargoDaBusca(["Head de E-commerce", 'Diretor "Digital"'])).toBe('"Head de E-commerce" OR "Diretor Digital"');
  });

  it("onde a busca parou não muda o filtro; cargo, palavra, região e setor mudam", () => {
    expect(mesmosFiltros(BUSCA, { ...BUSCA, cursor: null, esgotada: true })).toBe(true);
    expect(mesmosFiltros(BUSCA, { ...BUSCA, palavras: "marketplace" })).toBe(false);
    expect(mesmosFiltros(BUSCA, { ...BUSCA, regioes: [] })).toBe(false);
  });

  it("trocar a lista de empresas muda o filtro; onde parou na lista, não", () => {
    const lista = { id: "6f1c1f0e-7a4b-4c3a-9d7e-1a2b3c4d5e6f", nome: "Administradoras judiciais" };
    expect(mesmosFiltros(BUSCA, { ...BUSCA, lista })).toBe(false);
    expect(mesmosFiltros({ ...BUSCA, lista }, { ...BUSCA, lista: { ...lista, nome: "Outro nome" }, parte: 3, assinatura: "abc" })).toBe(true);
  });

  it("busca salva antes da lista de empresas continua valendo, sem lista e do começo", () => {
    const antiga = { cargos: ["CEO"], palavras: "", regioes: [], setores: [], cursor: null, esgotada: false };
    expect(buscaDoPublico.parse(antiga)).toEqual({ ...antiga, lista: null, parte: 0, assinatura: null });
  });

  it("saldo do dia nunca fica negativo", () => {
    expect(saldoDeBusca(30, 100)).toBe(70);
    expect(saldoDeBusca(120, 100)).toBe(0);
  });

  it("região e setor só por id numérico do LinkedIn", () => {
    expect(buscaDoPublico.safeParse({ ...BUSCA, regioes: [{ id: "Brasil", nome: "Brasil" }] }).success).toBe(false);
  });
});

describe("tamanhoDoPublico", () => {
  it("abaixo de mil, o número exato", () => {
    expect(tamanhoDoPublico(1)).toBe("1 pessoa");
    expect(tamanhoDoPublico(430)).toBe("430 pessoas");
  });

  it("mil pode ser o teto da contagem: vira mil ou mais", () => {
    expect(tamanhoDoPublico(1000)).toBe("Mil ou mais pessoas");
  });

  it("acima de mil, arredondado como o LinkedIn mostra", () => {
    expect(tamanhoDoPublico(12_437)).toBe("Cerca de 12 mil pessoas");
    expect(tamanhoDoPublico(1_234_567)).toBe("Cerca de 1,2 milhão de pessoas");
    expect(tamanhoDoPublico(999_999)).toBe("Cerca de 1 milhão de pessoas");
  });

  it("sem total ou zero, sem frase", () => {
    expect(tamanhoDoPublico(null)).toBeNull();
    expect(tamanhoDoPublico(0)).toBeNull();
  });
});
