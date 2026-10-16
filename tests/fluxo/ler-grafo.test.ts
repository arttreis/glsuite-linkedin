import { afterEach, describe, expect, it, vi } from "vitest";
import { fluxoPadrao, sequenciaParaFluxo } from "@/domain/fluxo";
import { sequenciaPadrao } from "@/domain/sequencia";
import { lerGrafo } from "@/server/fluxo/fluxos";

const passos = sequenciaPadrao().map((passo) => (passo.tipo === "dm" ? { ...passo, template: "Olá" } : passo));
const legado = { sequencia: passos, pos_t4: "conexao" as const };

describe("lerGrafo", () => {
  afterEach(() => vi.restoreAllMocks());

  it("devolve o grafo gravado, sem avisar, quando ele é válido", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const gravado = fluxoPadrao("domestico");
    expect(lerGrafo(gravado, legado)).toEqual(gravado);
    expect(erro).not.toHaveBeenCalled();
  });

  it("cai na sequência da campanha e registra o erro quando o grafo é inválido", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lido = lerGrafo({ versao: 1, nodes: [], arestas: [] }, legado);
    expect(lido).toEqual(sequenciaParaFluxo(passos, "conexao"));
    expect(erro).toHaveBeenCalledOnce();
    expect(erro.mock.calls[0]![0]).toContain("Grafo do fluxo inválido");
  });
});
