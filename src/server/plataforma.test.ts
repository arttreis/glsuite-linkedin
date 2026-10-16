import { beforeEach, describe, expect, it, vi } from "vitest";

const login = vi.hoisted(() => ({ email: null as string | null }));

vi.mock("@/server/supabase/servidor", () => ({
  emailDeAcessoSemLogin: () => null,
  exigirSessao: async () => ({ userId: "22222222-2222-4222-8222-222222222222", email: login.email }),
  // A linha de operadores diz que é alguém da GuessLess: o admin da Acme pode ter escrito isso nela.
  exigirOperadorNoApp: async () => ({
    id: "22222222-2222-4222-8222-222222222222",
    nome: "Maria",
    email: "arthur@guessless.com.br",
    papel: "admin",
    organizacaoId: "33333333-3333-4333-8333-333333333333",
    organizacaoNome: "Acme",
    primeiroAcessoConcluido: true,
    modulos: ["whatsapp"],
  }),
}));

const { ehDaPlataforma, exigirAdminDaPlataforma } = await import("./plataforma");

describe("quem é da plataforma (§4.14)", () => {
  beforeEach(() => {
    process.env.PLATAFORMA_ADMINS = "arthur@guessless.com.br";
  });

  it("vale o e-mail do login, não o que está na tabela de operadores", async () => {
    login.email = "maria@acme.com.br";
    expect(await ehDaPlataforma()).toBe(false);
    await expect(exigirAdminDaPlataforma()).rejects.toThrow();

    login.email = null;
    expect(await ehDaPlataforma()).toBe(false);
    await expect(exigirAdminDaPlataforma()).rejects.toThrow();

    login.email = "Arthur@GuessLess.com.br";
    expect(await ehDaPlataforma()).toBe(true);
    expect(await exigirAdminDaPlataforma()).toMatchObject({ emailDoLogin: "arthur@guessless.com.br" });
  });
});
