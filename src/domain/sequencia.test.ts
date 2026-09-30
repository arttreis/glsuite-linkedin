import { describe, expect, it } from "vitest";
import { posT4DaPraca, proximoToque, sequencia, sequenciaPadrao, tetoDoPasso } from "./sequencia";

const comTextos = () =>
  sequenciaPadrao().map((passo) => ({ ...passo, template: passo.tipo === "dm" ? "Texto" : "" }));

describe("sequência da campanha (§4.1)", () => {
  it("o default tem 4 toques com os offsets e tetos do épico", () => {
    const passos = sequenciaPadrao();
    expect(passos.map((p) => [p.toque, p.offset_dias_uteis, p.ancora, tetoDoPasso(p)])).toEqual([
      ["T1", 0, "inicio", 250],
      ["T2", 2, "aceite", 350],
      ["T3", 4, "anterior", 250],
      ["T4", 5, "anterior", 180],
    ]);
  });

  it("aceita offsets diferentes (são configuração) e convite sem nota", () => {
    const passos = comTextos();
    passos[2]!.offset_dias_uteis = 3;
    expect(sequencia.safeParse(passos).success).toBe(true);
  });

  it("exige a ordem T1…T4, convite primeiro e texto nas DMs", () => {
    const foraDeOrdem = comTextos().reverse();
    expect(sequencia.safeParse(foraDeOrdem).success).toBe(false);

    const semTexto = comTextos();
    semTexto[1]!.template = " ";
    const erro = sequencia.safeParse(semTexto);
    expect(erro.success).toBe(false);
    expect(erro.error?.issues[0]?.message).toBe("O T2 precisa de texto.");
  });

  it("acha o próximo toque", () => {
    expect(proximoToque(comTextos(), "T2")?.toque).toBe("T3");
    expect(proximoToque(comTextos(), "T4")).toBeUndefined();
  });

  it("define o pós-T4 pela praça (§4.5)", () => {
    expect(posT4DaPraca("domestico")).toBe("conexao");
    expect(posT4DaPraca("canada")).toBe("pausa_60_novo_angulo");
    expect(posT4DaPraca("espanha")).toBe("pausa_60_novo_angulo");
  });
});
