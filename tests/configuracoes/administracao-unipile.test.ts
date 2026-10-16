import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroUnipile, PECA_A_CHAVE } from "@/server/unipile/erros";

// A ação volta para a aba por `redirect`, que no Next lança; aqui ele lança o destino.
class Redirecionou extends Error {
  constructor(readonly destino: string) {
    super(destino);
  }
}

const falhas = vi.hoisted(() => ({ webhooks: null as unknown, status: null as unknown }));

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Redirecionou(destino);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/supabase/servidor", () => ({
  exigirOperador: async () => ({ id: "op", organizacaoId: "org", nome: "Ana", papel: "admin", modulos: ["linkedin"] }),
  exigirOperadorComModuloNaAcao: async () => ({ id: "op", organizacaoId: "org", nome: "Ana", papel: "admin", modulos: ["linkedin"] }),
}));
vi.mock("@/lib/env", () => ({ urlPublicaDoApp: () => "https://app.test" }));
vi.mock("@/server/db", () => ({ obterDb: () => ({}) }));
vi.mock("@/server/dependencias", () => ({
  obterUnipile: () => ({
    listarWebhooks: async () => {
      if (falhas.webhooks) throw falhas.webhooks;
      return [];
    },
    criarWebhook: async () => "wh",
  }),
  segredoDaUnipile: () => "segredo",
  obterGeradorDeSdr: () => null,
  obterLeitorDeSite: () => null,
}));
vi.mock("@/server/perfis/status-conta", () => ({
  sincronizarStatusDasContas: async () => {
    if (falhas.status) throw falhas.status;
  },
}));

const { atualizarStatusDasContasDoPainel, registrarWebhooksDoPainel } = await import("@/app/(painel)/settings/acoes");

async function destino(acao: () => Promise<unknown>): Promise<string> {
  const erro = await acao().catch((e: unknown) => e);
  if (!(erro instanceof Redirecionou)) throw erro;
  return erro.destino;
}

const mensagem = (url: string) => new URL(url, "https://app.test").searchParams.get("msg");

describe("botões da Administração com a Unipile recusando (SDR-122)", () => {
  beforeEach(() => {
    falhas.webhooks = null;
    falhas.status = null;
  });

  it("registrar webhooks com a chave recusada volta para a aba com o texto da chave", async () => {
    falhas.webhooks = new ErroUnipile({ status: 401, tipo: "missing_credentials", titulo: "Missing credentials" });
    const url = await destino(registrarWebhooksDoPainel);
    expect(url.startsWith("/settings/linkedin?msg=")).toBe(true);
    expect(mensagem(url)).toBe(`A Unipile recusou a chave da API (Unipile 401 missing_credentials: Missing credentials). ${PECA_A_CHAVE}`);
  });

  it("registrar webhooks sem erro segue com a mensagem de hoje", async () => {
    expect(mensagem(await destino(registrarWebhooksDoPainel))).toBe("3 webhooks registrados na Unipile.");
  });

  it("atualizar status com a Unipile fora volta com o aviso de tentar de novo", async () => {
    falhas.status = new ErroUnipile({ status: 503, tipo: "http_503", titulo: "Service Unavailable" });
    const url = await destino(atualizarStatusDasContasDoPainel);
    expect(url.startsWith("/settings/linkedin?msg=")).toBe(true);
    expect(mensagem(url)).toBe("A Unipile não respondeu (Unipile 503 http_503: Service Unavailable). Tente de novo em instantes.");
  });

  it("atualizar status sem erro segue com a mensagem de hoje", async () => {
    expect(mensagem(await destino(atualizarStatusDasContasDoPainel))).toBe("Status das contas atualizado pela Unipile.");
  });

  it("erro que não é da Unipile continua subindo", async () => {
    falhas.status = new Error("banco fora");
    await expect(atualizarStatusDasContasDoPainel()).rejects.toThrow("banco fora");
  });
});
