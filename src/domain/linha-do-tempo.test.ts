import { describe, expect, it } from "vitest";
import { fluxoPadrao, type Fluxo } from "./fluxo";
import { fluxoComTextosNovos, linhaDoTempo } from "./linha-do-tempo";

describe("linha do tempo da campanha (SDR-50)", () => {
  it("lê o fluxo padrão na ordem, com quando cada texto sai", () => {
    const { passos, completa } = linhaDoTempo(fluxoPadrao("domestico"));
    expect(passos.map((p) => [p.nodeId, p.tipo, p.quando])).toEqual([
      ["T1", "convite", "Assim que a pessoa entra na fila"],
      ["T2", "mensagem", expect.stringMatching(/depois do aceite$|^Logo depois do aceite$/)],
      ["T3", "mensagem", expect.stringContaining("depois da mensagem anterior")],
      ["T4", "mensagem", expect.stringContaining("depois da mensagem anterior")],
    ]);
    expect(completa).toBe(true);
  });

  it("troca só os textos pedidos e mantém a forma", () => {
    const fluxo = fluxoPadrao("domestico");
    const novo = fluxoComTextosNovos(fluxo, { T1: "  Oi {{first_name}}  ", T3: "Como a {{company}} faz hoje?" });
    expect(novo.arestas).toEqual(fluxo.arestas);
    const passos = linhaDoTempo(novo).passos;
    expect(passos.find((p) => p.nodeId === "T1")!.texto).toBe("Oi {{first_name}}");
    expect(passos.find((p) => p.nodeId === "T3")!.texto).toBe("Como a {{company}} faz hoje?");
    expect(passos.find((p) => p.nodeId === "T2")!.texto).toBe(linhaDoTempo(fluxo).passos.find((p) => p.nodeId === "T2")!.texto);
  });

  it("texto fora do caminho do sim deixa a linha incompleta", () => {
    const fluxo = fluxoPadrao("domestico");
    const comDesvio: Fluxo = {
      ...fluxo,
      nodes: [...fluxo.nodes, { id: "extra", tipo: "mensagem", template: "Outra" }],
    };
    expect(linhaDoTempo(comDesvio).completa).toBe(false);
  });
});
