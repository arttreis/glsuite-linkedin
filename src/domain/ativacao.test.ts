import { describe, expect, it } from "vitest";
import { resumoDaRampa, travasDaAtivacao } from "./ativacao";

const ids = (perfil: Parameters<typeof travasDaAtivacao>[0]) => travasDaAtivacao(perfil).map((trava) => trava.id);

describe("travas da primeira ativação (§8)", () => {
  it("Arthur espera só a rampa e o teto (D3)", () => {
    expect(ids({ slug: "arthur", nome: "Arthur", praca: "domestico", modoResposta: "aprovacao" })).toEqual(["D3"]);
  });

  it("Juliano espera a T-2: a IA sempre escreve por ele", () => {
    expect(ids({ slug: "juliano", nome: "Juliano", praca: "domestico", modoResposta: "aprovacao" })).toEqual(["T-2"]);
    expect(ids({ slug: "juliano", nome: "Juliano", praca: "domestico", modoResposta: "automatico" })).toEqual(["T-2"]);
  });
});

describe("resumo da rampa", () => {
  it("lista os valores em ordem de semana", () => {
    const rampa = [
      { semana: 3, convites_dia: 15, dms_dia: 25 },
      { semana: 1, convites_dia: 8, dms_dia: 15 },
      { semana: 2, convites_dia: 12, dms_dia: 20 },
    ];
    expect(resumoDaRampa(rampa, "convites_dia")).toBe("8 → 12 → 15");
    expect(resumoDaRampa(rampa, "dms_dia")).toBe("15 → 20 → 25");
  });
});
