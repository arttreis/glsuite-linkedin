import { describe, expect, it } from "vitest";
import { abasDaOrganizacao } from "@/app/(painel)/settings/lista-de-abas";
import { itensDoMenu } from "./navegacao";

const rotulos = (itens: { rotulo: string }[]) => itens.map((item) => item.rotulo);

describe("menu e abas por módulo (SDR-69, §4.14)", () => {
  it("com o SDR no LinkedIn, o menu é o de sempre", () => {
    expect(rotulos(itensDoMenu({ modulos: ["linkedin"], linkedinNoPrimeiroAcesso: false, plataforma: false }))).toEqual([
      "Dashboard",
      "Chats",
      "Pipeline",
      "Campanhas",
      "Configurações",
    ]);
  });

  it("sem o módulo, as telas do LinkedIn somem do menu", () => {
    expect(rotulos(itensDoMenu({ modulos: ["whatsapp"], linkedinNoPrimeiroAcesso: false, plataforma: false }))).toEqual([
      "Dashboard",
      "Configurações",
    ]);
  });

  it("com o primeiro acesso por fazer, as telas do LinkedIn viram um item só, que leva a ele", () => {
    const itens = itensDoMenu({ modulos: ["linkedin", "telegram"], linkedinNoPrimeiroAcesso: true, plataforma: false });
    expect(rotulos(itens)).toEqual(["Dashboard", "Configurar o SDR", "Configurações"]);
    expect(itens[1]!.href).toBe("/onboarding");
  });

  it("a Plataforma aparece só para quem é da plataforma", () => {
    expect(rotulos(itensDoMenu({ modulos: [], linkedinNoPrimeiroAcesso: false, plataforma: true }))).toEqual([
      "Dashboard",
      "Configurações",
      "Plataforma",
    ]);
  });

  it("as abas de Configurações seguem os módulos; Equipe e Plano são da base", () => {
    expect(rotulos(abasDaOrganizacao(["linkedin"]))).toEqual(["Empresa", "SDR", "LinkedIn", "Equipe", "Plano"]);
    expect(rotulos(abasDaOrganizacao(["whatsapp"]))).toEqual(["Equipe", "Plano"]);
  });
});
