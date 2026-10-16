import { describe, expect, it } from "vitest";
import {
  assinaturaDasPartes,
  classificarProcura,
  empresasPendentes,
  empresasUnicas,
  lerNomesDeEmpresas,
  partesDaBusca,
  type EmpresaDaBusca,
} from "./lista-de-empresas";

describe("lerNomesDeEmpresas", () => {
  it("texto colado: um nome por linha, sem linha em branco nem espaço sobrando", () => {
    expect(lerNomesDeEmpresas("Acme Administração Judicial\n\n   Brasil   Recuperações  \r\nZeta")).toEqual([
      "Acme Administração Judicial",
      "Brasil Recuperações",
      "Zeta",
    ]);
  });

  it("a primeira linha sai quando é só o título da coluna", () => {
    expect(lerNomesDeEmpresas("Empresa\nAcme\nZeta")).toEqual(["Acme", "Zeta"]);
    expect(lerNomesDeEmpresas("Razão Social\nAcme")).toEqual(["Acme"]);
  });

  it("CSV: a coluna da empresa vem pelo nome, mesmo com outras colunas e ponto e vírgula", () => {
    const csv = 'nome do responsável;Nome da Empresa;cidade\nMaria;"Acme; Filial SP";São Paulo\nJoão;Zeta Ltda;Rio';
    expect(lerNomesDeEmpresas(csv, "administradoras.csv")).toEqual(["Acme; Filial SP", "Zeta Ltda"]);
  });

  it("CSV com nome e empresa: empresa ganha de nome", () => {
    expect(lerNomesDeEmpresas("nome,company\nMaria,Acme\nJoão,Zeta", "x.csv")).toEqual(["Acme", "Zeta"]);
  });

  it("CSV sem cabeçalho reconhecível: a primeira coluna, desde a primeira linha", () => {
    expect(lerNomesDeEmpresas("Acme,São Paulo\nZeta,Rio", "x.csv")).toEqual(["Acme", "Zeta"]);
  });

  it("colado de uma planilha (com tab) vira tabela", () => {
    expect(lerNomesDeEmpresas("Razão social\tCNPJ\nAcme S.A.\t00.000\nZeta\t11.111")).toEqual(["Acme S.A.", "Zeta"]);
  });

  it("TXT é um nome por linha, mesmo com vírgula no nome", () => {
    expect(lerNomesDeEmpresas("Acme, Silva & Cia\nZeta", "lista.txt")).toEqual(["Acme, Silva & Cia", "Zeta"]);
  });
});

describe("empresasUnicas", () => {
  it("repetida pela chave da empresa entra uma vez, com o nome que veio primeiro", () => {
    expect(empresasUnicas(["Acme Tecnologia Ltda.", "ACME TECNOLOGIA", "Zeta", "  ", "..."])).toEqual({
      empresas: [
        { nome: "Acme Tecnologia Ltda.", chave: "acme tecnologia" },
        { nome: "Zeta", chave: "zeta" },
      ],
      repetidas: 1,
    });
  });

  it("não tem teto de empresas", () => {
    const nomes = Array.from({ length: 2500 }, (_, i) => `Empresa ${i}`);
    expect(empresasUnicas(nomes).empresas).toHaveLength(2500);
  });
});

describe("classificarProcura", () => {
  it("sem nenhuma página, a empresa fica sem página", () => {
    expect(classificarProcura("Acme", [])).toEqual({ situacao: "sem_pagina", opcoes: [] });
  });

  it("exatamente uma página com a mesma chave: achada, e as outras ficam para trocar", () => {
    const paginas = [
      { id: "2", nome: "Acme Consultoria" },
      { id: "1", nome: "ACME Ltda" },
    ];
    expect(classificarProcura("Acme", paginas)).toEqual({
      situacao: "achada",
      pagina: { id: "1", nome: "ACME Ltda" },
      opcoes: [
        { id: "1", nome: "ACME Ltda" },
        { id: "2", nome: "Acme Consultoria" },
      ],
    });
  });

  it("uma página só, mas de outro nome: o humano escolhe", () => {
    expect(classificarProcura("Acme", [{ id: "9", nome: "Acme Consultoria" }])).toMatchObject({ situacao: "escolher" });
  });

  it("duas páginas de mesmo nome: o humano escolhe, entre até 5", () => {
    const paginas = Array.from({ length: 8 }, (_, i) => ({ id: String(i + 1), nome: i < 2 ? "Acme" : `Acme ${i}` }));
    const resultado = classificarProcura("Acme", paginas);
    expect(resultado.situacao).toBe("escolher");
    expect(resultado.opcoes.map((o) => o.id)).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("partes da busca com lista", () => {
  const empresa = (nome: string, situacao: EmpresaDaBusca["situacao"], linkedinId: string | null = null): EmpresaDaBusca => ({
    nome,
    chave: nome.toLowerCase(),
    situacao,
    linkedinId,
  });

  it("achadas em grupos de 10, uma parte por empresa sem página, pendentes de fora", () => {
    const achadas = Array.from({ length: 12 }, (_, i) => empresa(`Achada ${i}`, "achada", String(100 + i)));
    const partes = partesDaBusca([
      ...achadas,
      empresa("Zeta", "sem_pagina"),
      empresa("Beta", "sem_pagina"),
      empresa("Nova", "a_procurar"),
      empresa("Dúvida", "escolher"),
    ]);
    expect(partes).toEqual([
      { empresas: Array.from({ length: 10 }, (_, i) => String(100 + i)) },
      { empresas: ["110", "111"] },
      { empresa: "Beta" },
      { empresa: "Zeta" },
    ]);
  });

  it("sem cargo, uma página por parte, para nenhuma parte passar do teto do LinkedIn", () => {
    expect(partesDaBusca([empresa("Beta", "achada", "2"), empresa("Acme", "achada", "1"), empresa("Zeta", "sem_pagina")], 1)).toEqual([
      { empresas: ["1"] },
      { empresas: ["2"] },
      { empresa: "Zeta" },
    ]);
  });

  it("duas empresas na mesma página do LinkedIn contam uma vez", () => {
    expect(partesDaBusca([empresa("Acme", "achada", "1"), empresa("Acme SP", "achada", "1")])).toEqual([{ empresas: ["1"] }]);
  });

  it("conta quem ainda não entra na busca", () => {
    expect(empresasPendentes([empresa("A", "a_procurar"), empresa("B", "escolher"), empresa("C", "achada", "1")])).toBe(2);
  });

  it("a assinatura não depende da ordem em que as empresas vêm, e muda quando a lista muda", () => {
    const a = [empresa("Acme", "achada", "1"), empresa("Zeta", "sem_pagina"), empresa("Beta", "achada", "2")];
    const mesma = assinaturaDasPartes(partesDaBusca([...a].reverse()));
    expect(assinaturaDasPartes(partesDaBusca(a))).toBe(mesma);
    expect(mesma).toMatch(/^[0-9a-f]{8}$/);
    expect(assinaturaDasPartes(partesDaBusca([...a, empresa("Gama", "sem_pagina")]))).not.toBe(mesma);
  });
});
