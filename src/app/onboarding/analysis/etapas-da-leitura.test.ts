import { describe, expect, it } from "vitest";
import { etapasDaLeitura } from "./etapas-da-leitura";

const estados = (etapas: ReturnType<typeof etapasDaLeitura>) => Object.fromEntries(etapas.map((e) => [e.id, e.estado]));
const pagina = { url: "https://guessless.com.br/", titulo: "GuessLess" };

describe("etapas da leitura do site", () => {
  it("sem página aberta, está abrindo o site e o resto vem depois", () => {
    expect(estados(etapasDaLeitura({ etapa: "paginas", paginas: [], maxPaginas: 8 }))).toEqual({
      abrir: "atual",
      paginas: "futura",
      negocio: "futura",
      mercado: "futura",
      pronto: "futura",
    });
  });

  it("com páginas abertas, lê as páginas e conta quantas de até quantas", () => {
    const etapas = etapasDaLeitura({ etapa: "paginas", paginas: [pagina, pagina, pagina], maxPaginas: 8 });
    expect(estados(etapas)).toMatchObject({ abrir: "feita", paginas: "atual", negocio: "futura" });
    expect(etapas.find((e) => e.id === "paginas")!.rotulo).toBe("Lendo as páginas (3 de até 8)");
  });

  it("leitura antiga, sem o teto gravado, conta só as lidas", () => {
    const etapas = etapasDaLeitura({ etapa: "paginas", paginas: [pagina] });
    expect(etapas.find((e) => e.id === "paginas")!.rotulo).toBe("Lendo as páginas (1 página)");
  });

  it("montando a análise: páginas feitas, negócio e produto agora", () => {
    expect(estados(etapasDaLeitura({ etapa: "analise", paginas: [pagina], maxPaginas: 8 }))).toEqual({
      abrir: "feita",
      paginas: "feita",
      negocio: "atual",
      mercado: "futura",
      pronto: "futura",
    });
  });

  it("no Mercado, negócio e produto ficam feitos", () => {
    expect(estados(etapasDaLeitura({ etapa: "mercado", paginas: [pagina], maxPaginas: 8 }))).toEqual({
      abrir: "feita",
      paginas: "feita",
      negocio: "feita",
      mercado: "atual",
      pronto: "futura",
    });
  });

  it("as etapas estão sempre na mesma ordem", () => {
    expect(etapasDaLeitura({ etapa: "paginas", paginas: [] }).map((e) => e.rotulo)).toEqual([
      "Abrindo o site",
      "Lendo as páginas",
      "Entendendo o negócio e o produto",
      "Montando o mercado",
      "Pronto",
    ]);
  });
});
