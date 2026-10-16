import { describe, expect, it } from "vitest";
import { abasDoLancamento } from "@/app/(painel)/launches/[id]/lista-de-abas";
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
      "Contatos",
      "Configurações",
    ]);
  });

  it("sem o módulo, as telas do LinkedIn somem do menu", () => {
    expect(rotulos(itensDoMenu({ modulos: ["whatsapp"], linkedinNoPrimeiroAcesso: false, plataforma: false }))).toEqual([
      "Dashboard",
      "Contatos",
      "Disparos",
      "Configurações",
    ]);
  });

  it("com o primeiro acesso por fazer, as telas do LinkedIn viram um item só, que leva a ele", () => {
    const itens = itensDoMenu({ modulos: ["linkedin", "telegram"], linkedinNoPrimeiroAcesso: true, plataforma: false });
    expect(rotulos(itens)).toEqual(["Dashboard", "Configurar o SDR", "Contatos", "Disparos", "Configurações"]);
    expect(itens[1]!.href).toBe("/onboarding");
  });

  it("a Plataforma aparece só para quem é da plataforma", () => {
    expect(rotulos(itensDoMenu({ modulos: [], linkedinNoPrimeiroAcesso: false, plataforma: true }))).toEqual([
      "Dashboard",
      "Contatos",
      "Configurações",
      "Plataforma",
    ]);
  });

  it("Lançamentos vem logo depois de Chats; sem o LinkedIn, logo depois do Dashboard (SDR-74)", () => {
    const menu = (modulos: Parameters<typeof itensDoMenu>[0]["modulos"]) =>
      rotulos(itensDoMenu({ modulos, linkedinNoPrimeiroAcesso: false, plataforma: false }));
    expect(menu(["linkedin", "comunidades"])).toEqual(["Dashboard", "Chats", "Lançamentos", "Pipeline", "Campanhas", "Contatos", "Configurações"]);
    expect(menu(["facebook"])).toEqual(["Dashboard", "Lançamentos", "Contatos", "Configurações"]);
    expect(menu(["instagram", "whatsapp"])).toEqual(["Dashboard", "Lançamentos", "Contatos", "Disparos", "Configurações"]);
    expect(menu(["linkedin", "whatsapp"])).not.toContain("Lançamentos");
    expect(itensDoMenu({ modulos: ["comunidades"], linkedinNoPrimeiroAcesso: false, plataforma: false })[1]!.href).toBe("/launches");
  });

  it("as abas do lançamento: Hoje e SDR, nessa ordem (SDR-74)", () => {
    expect(abasDoLancamento("abc", ["comunidades"])).toEqual([
      { href: "/launches/abc", rotulo: "Hoje" },
      { href: "/launches/abc/sdr", rotulo: "SDR" },
    ]);
    expect(rotulos(abasDoLancamento("abc", ["instagram"]))).toEqual(["Hoje", "SDR"]);
  });

  it("as abas de Configurações seguem os módulos; Equipe e Plano são da base", () => {
    expect(rotulos(abasDaOrganizacao(["linkedin"]))).toEqual(["Empresa", "SDR", "LinkedIn", "Equipe", "Plano"]);
    expect(rotulos(abasDaOrganizacao(["whatsapp"]))).toEqual(["WhatsApp", "Equipe", "Plano"]);
  });
});
