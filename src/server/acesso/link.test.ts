import { describe, expect, it, vi } from "vitest";
import { pedirLinkDeAcesso, type DependenciasDoLink } from "./link";

function dependencias(p: Partial<DependenciasDoLink> = {}) {
  const criarUsuario = vi.fn<(email: string) => Promise<void>>(async () => {});
  const enviarLink = vi.fn<(email: string) => Promise<string | null>>(async () => null);
  const deps: DependenciasDoLink = { dominios: ["guessless.com.br"], criarUsuario, enviarLink, ...p };
  return { deps, criarUsuario, enviarLink };
}

describe("pedido de link de acesso (SDR-40)", () => {
  it("e-mail liberado ganha o usuário no Auth antes do link", async () => {
    const { deps, criarUsuario, enviarLink } = dependencias();
    expect(await pedirLinkDeAcesso(deps, "nova@guessless.com.br")).toEqual({ ok: true });
    expect(criarUsuario).toHaveBeenCalledWith("nova@guessless.com.br");
    expect(enviarLink).toHaveBeenCalledWith("nova@guessless.com.br");
    expect(criarUsuario.mock.invocationCallOrder[0]!).toBeLessThan(enviarLink.mock.invocationCallOrder[0]!);
  });

  it("e-mail de fora não cria usuário: só recebe link quem já tem", async () => {
    const { deps, criarUsuario, enviarLink } = dependencias();
    await pedirLinkDeAcesso(deps, "alguem@gmail.com");
    expect(criarUsuario).not.toHaveBeenCalled();
    expect(enviarLink).toHaveBeenCalledWith("alguem@gmail.com");
  });

  it("sem a chave secreta, o e-mail liberado ainda recebe link se já tiver usuário", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, enviarLink } = dependencias({ criarUsuario: null });
    expect(await pedirLinkDeAcesso(deps, "antiga@guessless.com.br")).toEqual({ ok: true });
    expect(enviarLink).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it("falha ao criar o usuário não manda link", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, enviarLink } = dependencias({
      criarUsuario: vi.fn(async () => {
        throw new Error("500: fora do ar");
      }),
    });
    const resultado = await pedirLinkDeAcesso(deps, "nova@guessless.com.br");
    expect(resultado.ok).toBe(false);
    expect(enviarLink).not.toHaveBeenCalled();
    erro.mockRestore();
  });

  it("limite de envio explica que o link já foi mandado", async () => {
    const { deps } = dependencias({ enviarLink: vi.fn(async () => "over_email_send_rate_limit") });
    expect(await pedirLinkDeAcesso(deps, "nova@guessless.com.br")).toEqual({
      ok: false,
      mensagem: expect.stringContaining("menos de 1 minuto"),
    });
  });

  it("e-mail de fora sem usuário ouve que o acesso é restrito", async () => {
    const { deps } = dependencias({ enviarLink: vi.fn(async () => "otp_disabled") });
    expect(await pedirLinkDeAcesso(deps, "alguem@gmail.com")).toEqual({
      ok: false,
      mensagem: expect.stringContaining("domínio liberado"),
    });
  });
});
