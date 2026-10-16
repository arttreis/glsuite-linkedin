import { describe, expect, it } from "vitest";
import {
  descreverFiltros,
  esquemaDosFiltros,
  FILTROS_INICIAIS,
  podeSelecionar,
  rotuloDaSituacao,
  temFiltroDeConteudo,
  type FiltrosDeBusca,
} from "./busca";

const filtros = (extra: Partial<FiltrosDeBusca>): FiltrosDeBusca => ({ ...FILTROS_INICIAIS, ...extra });

describe("filtros da busca de leads", () => {
  it("grau e idioma sozinhos não bastam: precisa de conteúdo", () => {
    expect(temFiltroDeConteudo(FILTROS_INICIAIS)).toBe(false);
    expect(temFiltroDeConteudo(filtros({ graus: [1, 2, 3], idiomas: ["pt"] }))).toBe(false);
    expect(temFiltroDeConteudo(filtros({ cargo: "CMO" }))).toBe(true);
    expect(temFiltroDeConteudo(filtros({ locais: [{ id: "105871508", titulo: "São Paulo" }] }))).toBe(true);
  });

  it("valida no servidor: apara texto, completa o que falta e recusa id que não é do LinkedIn", () => {
    expect(esquemaDosFiltros.parse({ cargo: "  Head de marketing " })).toEqual(filtros({ cargo: "Head de marketing", graus: [] }));
    expect(esquemaDosFiltros.safeParse({ locais: [{ id: "sp", titulo: "São Paulo" }] }).success).toBe(false);
    expect(esquemaDosFiltros.safeParse({ graus: [4] }).success).toBe(false);
    expect(esquemaDosFiltros.safeParse({ idiomas: ["de"] }).success).toBe(false);
  });

  it("descreve a busca em uma linha para o nome da importação", () => {
    expect(
      descreverFiltros(
        filtros({
          cargo: "Head de e-commerce",
          locais: [
            { id: "1", titulo: "São Paulo" },
            { id: "2", titulo: "Curitiba" },
          ],
          setores: [{ id: "27", titulo: "Varejo" }],
          graus: [3, 2],
          idiomas: ["pt"],
        }),
      ),
    ).toBe("Busca: cargo: Head de e-commerce · local: São Paulo, Curitiba · setor: Varejo · 2º e 3º+ grau · idioma: pt");
    // Os três graus é o mesmo que nenhum: não polui a descrição.
    expect(descreverFiltros(filtros({ palavrasChave: "varejo", graus: [1, 2, 3] }))).toBe('Busca: "varejo"');
    expect(descreverFiltros(filtros({ cargo: "x".repeat(300) }))).toHaveLength(200);
  });
});

describe("situação de quem a busca trouxe", () => {
  it("só nova e já na base podem ser selecionadas", () => {
    expect(podeSelecionar({ tipo: "nova" })).toBe(true);
    expect(podeSelecionar({ tipo: "na_base" })).toBe(true);
    expect(podeSelecionar({ tipo: "na_campanha" })).toBe(false);
    expect(podeSelecionar({ tipo: "de_outro_perfil", perfil: "Juliano" })).toBe(false);
    expect(podeSelecionar({ tipo: "optout" })).toBe(false);
  });

  it("explica a situação sem código interno", () => {
    expect(rotuloDaSituacao({ tipo: "de_outro_perfil", perfil: "Juliano" })).toBe("É do perfil Juliano");
    expect(rotuloDaSituacao({ tipo: "optout" })).toBe("Pediu para não ser contatada");
  });
});
