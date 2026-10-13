import { describe, expect, it } from "vitest";
import type { Dossie } from "./dossie";
import { limparEdicao } from "./edicao";
import {
  explicarErroDoPublico,
  provasForaDoDossie,
  publico,
  publicosDaSugestao,
  type Publico,
  type SugestaoDePublicos,
} from "./publico";

const DOSSIE: Dossie = {
  empresa: { nome: "GuessLess", resumo: "Consultoria de crescimento para e-commerce." },
  produtos: [{ nome: "Diagnóstico de margem", descricao: "Mapa da margem por canal.", para_quem: "e-commerce" }],
  para_quem: "E-commerces de médio porte.",
  diferenciais: [],
  provas: [
    { tipo: "numero", texto: "Margem 12% maior em 6 meses", fonte_url: null },
    { tipo: "cliente", texto: "Atende a Loja X", fonte_url: null },
  ],
  dores: [],
  objecoes: [],
  tom_de_voz: "Direto.",
  idioma: "pt",
  mercado: { segmentos: [], alternativas: [], gatilhos: [] },
};

const PUBLICO: Publico = {
  nome: "Diretores de e-commerce de moda",
  quem: { cargos: ["Head de E-commerce", "Diretor de E-commerce"], senioridade: "diretoria" },
  empresa: { setores: ["Varejo de moda"], porte: "50 a 500 funcionários", regiao: "Brasil, Sudeste" },
  por_que: { dor: "Não sabe a margem por canal.", gatilho: "", resultado: "Decide o mix de canais com número." },
  angulo: "A margem que o marketplace esconde.",
  provas: ["Margem 12% maior em 6 meses"],
  quem_nao_e: "Analistas sem decisão de orçamento.",
};

const sugerido = (parcial: Partial<SugestaoDePublicos["publicos"][number]> = {}): SugestaoDePublicos["publicos"][number] => ({
  ...PUBLICO,
  provas: [0],
  aderencia: { nota: 82, motivo: "O site cita clientes de moda." },
  ...parcial,
});

describe("publicosDaSugestao", () => {
  it("guarda a aderência que a IA deu, com o motivo", () => {
    const { publicos } = publicosDaSugestao({ publicos: [sugerido()] }, DOSSIE);
    expect(publicos[0]!.aderencia).toEqual({ nota: 82, motivo: "O site cita clientes de moda." });
  });

  it("aderência fora de 0 a 100 ou sem motivo fica de fora, e o público fica", () => {
    const { publicos } = publicosDaSugestao(
      {
        publicos: [
          sugerido({ aderencia: { nota: 140, motivo: "Muito bom." } }),
          sugerido({ aderencia: { nota: -1, motivo: "Ruim." } }),
          sugerido({ aderencia: { nota: 70, motivo: "  " } }),
        ],
      },
      DOSSIE,
    );
    expect(publicos.map((p) => p.aderencia)).toEqual([null, null, null]);
  });

  it("troca o número da prova pelo texto do dossiê e ignora número fora da lista", () => {
    const { publicos } = publicosDaSugestao({ publicos: [sugerido({ provas: [1, 7, 1, -1] })] }, DOSSIE);
    expect(publicos[0]!.provas).toEqual(["Atende a Loja X"]);
  });

  it("descarta o que não cabe no esquema", () => {
    const resultado = publicosDaSugestao({ publicos: [sugerido(), sugerido({ nome: "" })] }, DOSSIE);
    expect(resultado.publicos).toHaveLength(1);
    expect(resultado.descartados).toBe(1);
  });

  it("fica com no máximo 5", () => {
    const seis = Array.from({ length: 6 }, (_, i) => sugerido({ nome: `Público ${i}` }));
    expect(publicosDaSugestao({ publicos: seis }, DOSSIE)).toMatchObject({ descartados: 1 });
  });
});

describe("provasForaDoDossie", () => {
  it("aponta a prova que o dossiê não tem", () => {
    expect(provasForaDoDossie({ ...PUBLICO, provas: ["Margem 12% maior em 6 meses", "Inventada"] }, DOSSIE)).toEqual(["Inventada"]);
    expect(provasForaDoDossie(PUBLICO, DOSSIE)).toEqual([]);
  });
});

describe("público", () => {
  it("explica o erro pela seção e pelo campo", () => {
    const erro = (entrada: unknown) => explicarErroDoPublico(publico.safeParse(limparEdicao(entrada)).error!);
    expect(erro({ ...PUBLICO, quem: { cargos: [" "], senioridade: "" } })).toBe("Quem, cargos: precisa de pelo menos 1.");
    expect(erro({ ...PUBLICO, por_que: { ...PUBLICO.por_que, dor: "" } })).toBe("Por que precisa, dor: não pode ficar em branco.");
    expect(erro({ ...PUBLICO, angulo: "x".repeat(301) })).toBe("Ângulo: passou de 300 caracteres.");
  });
});
