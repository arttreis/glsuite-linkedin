import { describe, expect, it } from "vitest";
import { fluxoComTextos, numerosForaDasProvas, problemasDeProvas } from "./fluxo-gerado";

const TEXTOS = {
  convite: "Oi {{first_name}}, acompanho a {{company}} e queria te ter por aqui.",
  mensagens: ["Obrigado por aceitar.", "Como vocês medem a margem por canal?", "Fico por aqui."],
  motivo: "ok",
};

describe("fluxo gerado pelo público", () => {
  it("encaixa os textos no fluxo padrão: convite no T1 e mensagens no T2 a T4", () => {
    const fluxo = fluxoComTextos("domestico", TEXTOS);
    const textos = Object.fromEntries(
      fluxo.nodes.flatMap((n) => (n.tipo === "convite" || n.tipo === "mensagem" ? [[n.id, n.template]] : [])),
    );
    expect(textos).toEqual({ T1: TEXTOS.convite, T2: "Obrigado por aceitar.", T3: "Como vocês medem a margem por canal?", T4: "Fico por aqui." });
  });

  it("número citado tem que estar numa prova do público", () => {
    const provas = ["Margem 12% maior em 6 meses"];
    expect(numerosForaDasProvas("Lojas como a sua ganharam 12% de margem.", provas)).toEqual([]);
    expect(numerosForaDasProvas("Dobramos o faturamento em 30 dias, 200% mais.", provas)).toEqual(["30", "200%"]);
    const fluxo = fluxoComTextos("domestico", { ...TEXTOS, mensagens: ["Um cliente cresceu 40%.", "Pergunta?", "Tchau."] });
    expect(problemasDeProvas(fluxo, provas)).toEqual([{ toque: "T2", mensagem: "Cita 40%, que não está nas provas do público." }]);
  });
});
