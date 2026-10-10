import { describe, expect, it } from "vitest";
import { renderizarTemplate, tokensDesconhecidos } from "./template";

describe("template", () => {
  it("troca first_name e company, com ou sem espaço nas chaves", () => {
    expect(renderizarTemplate("Oi {{first_name}}, a {{ company }} vende online?", { first_name: "Ana", company: "Acme" })).toEqual({
      ok: true,
      texto: "Oi Ana, a Acme vende online?",
    });
  });

  it("empresa em caixa alta entra com a inicial maiúscula", () => {
    expect(renderizarTemplate("Como a {{company}} vende?", { first_name: "Ana", company: "LOJAS RENNER" })).toEqual({
      ok: true,
      texto: "Como a Lojas Renner vende?",
    });
  });

  it("recusa token fora da lista", () => {
    expect(tokensDesconhecidos("Oi {{nome}} da {{company}}")).toEqual(["nome"]);
    expect(renderizarTemplate("Oi {{nome}}", { first_name: "Ana", company: "Acme" })).toEqual({
      ok: false,
      erro: "Variável não permitida: {{nome}}. Use só {{first_name}} e {{company}}.",
    });
  });

  it("não renderiza pela metade quando falta valor", () => {
    expect(renderizarTemplate("Oi {{first_name}} da {{company}}", { first_name: "Ana", company: "  " })).toEqual({
      ok: false,
      erro: "O lead não tem {{company}} para preencher o template.",
    });
  });
});
