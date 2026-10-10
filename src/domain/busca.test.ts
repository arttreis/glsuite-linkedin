import { describe, expect, it } from "vitest";
import { buscaDoPublico, cargoDaBusca, mesmosFiltros, saldoDeBusca, type BuscaDoPublico } from "./busca";

const BUSCA: BuscaDoPublico = {
  cargos: ["Head de E-commerce", "Diretor de E-commerce"],
  palavras: "",
  regioes: [{ id: "106057199", nome: "Brasil" }],
  setores: [],
  cursor: "pagina-3",
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

  it("saldo do dia nunca fica negativo", () => {
    expect(saldoDeBusca(30, 100)).toBe(70);
    expect(saldoDeBusca(120, 100)).toBe(0);
  });

  it("região e setor só por id numérico do LinkedIn", () => {
    expect(buscaDoPublico.safeParse({ ...BUSCA, regioes: [{ id: "Brasil", nome: "Brasil" }] }).success).toBe(false);
  });
});
