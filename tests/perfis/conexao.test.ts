import { beforeEach, describe, expect, it } from "vitest";
import { garantirWebhooks, gerarLinkDeConexao, registrarContaConectada } from "@/server/perfis/conexao";
import { sincronizarStatusDasContas } from "@/server/perfis/status-conta";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, idDoPerfil } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-01T14:00:00Z");
const URL_APP = "https://sdr.guessless.com.br";
const SEGREDO = "segredo-dos-webhooks-123";

describe("conexão do perfil pela Unipile (hosted auth)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
  });

  it("gera o link de conexão do perfil do Arthur com o id do perfil e o callback assinado", async () => {
    const perfilId = await idDoPerfil(banco.db, "arthur");
    const url = await gerarLinkDeConexao(
      { db: banco.db, unipile, urlApp: URL_APP, segredo: SEGREDO },
      { perfilId, agora: AGORA },
    );

    expect(url).toMatch(/^https:\/\/account\.unipile\.com\//);
    const [pedido] = unipile.chamadasDe("gerarLinkDeConexao");
    expect(pedido).toMatchObject({ tipo: "create", nome: perfilId, sucessoUrl: `${URL_APP}/perfis?conexao=ok` });
    expect(new URL(String(pedido!.notifyUrl)).searchParams.get("segredo")).toBe(SEGREDO);
  });

  it("pede reconexão quando o perfil já tem conta", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await gerarLinkDeConexao(
      { db: banco.db, unipile, urlApp: URL_APP, segredo: SEGREDO },
      { perfilId: await idDoPerfil(banco.db, "arthur"), agora: AGORA },
    );
    expect(unipile.chamadasDe("gerarLinkDeConexao")[0]).toMatchObject({ tipo: "reconnect", contaParaReconectar: "acc-arthur" });
  });

  it("liga a conta ao perfil no callback, mantendo o perfil pausado", async () => {
    const perfilId = await idDoPerfil(banco.db, "arthur");
    unipile.donos.set("acc-nova", {
      providerId: "ACoArthur",
      nome: "Arthur Reis",
      publicIdentifier: "arthur",
      premium: false,
      salesNavigator: false,
    });

    const resultado = await registrarContaConectada(
      { db: banco.db, unipile },
      { status: "CREATION_SUCCESS", account_id: "acc-nova", name: perfilId },
      AGORA,
    );

    expect(resultado).toEqual({ ok: true, perfilId });
    const [perfil] = await banco.db.query(
      `select unipile_account_id, linkedin_provider_id, tipo_conta, limite_nota_convite, unipile_status, status
         from public.perfis where id = $1::uuid`,
      [perfilId],
    );
    expect(perfil).toEqual({
      unipile_account_id: "acc-nova",
      linkedin_provider_id: "ACoArthur",
      tipo_conta: "gratuita",
      limite_nota_convite: 200,
      unipile_status: "OK",
      status: "pausado",
    });
  });

  it("recusa callback de perfil desconhecido, conta que não é do LinkedIn ou conta de outro perfil", async () => {
    const deps = { db: banco.db, unipile };
    expect(
      await registrarContaConectada(deps, { status: "CREATION_SUCCESS", account_id: "x", name: crypto.randomUUID() }, AGORA),
    ).toEqual({ ok: false, motivo: "perfil desconhecido" });

    unipile.contas.set("acc-wpp", { id: "acc-wpp", tipo: "WHATSAPP", nome: null, status: ["OK"] });
    const arthur = await idDoPerfil(banco.db, "arthur");
    expect(await registrarContaConectada(deps, { status: "CREATION_SUCCESS", account_id: "acc-wpp", name: arthur }, AGORA)).toMatchObject({
      ok: false,
    });

    await ativarPerfil(banco.db, "juliano", { accountId: "acc-juliano" });
    expect(
      await registrarContaConectada(deps, { status: "CREATION_SUCCESS", account_id: "acc-juliano", name: arthur }, AGORA),
    ).toEqual({ ok: false, motivo: "conta já ligada ao perfil juliano" });
  });

  it("sincroniza o status das contas e pausa a que caiu", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await ativarPerfil(banco.db, "juliano", { accountId: "acc-juliano" });
    unipile.contas.set("acc-arthur", { id: "acc-arthur", tipo: "LINKEDIN", nome: null, status: ["OK", "CREDENTIALS"] });
    unipile.falharProxima("obterConta", new ErroUnipile({ status: 503, tipo: "http_503", titulo: "fora" }));

    // A primeira chamada (arthur) falha com 503 e é ignorada nesta rodada.
    expect(await sincronizarStatusDasContas(banco.db, unipile, AGORA)).toBe(0);
    expect(await sincronizarStatusDasContas(banco.db, unipile, AGORA)).toBe(1);

    const perfis = await banco.db.query<{ slug: string; status: string }>(
      "select slug, status from public.perfis where slug in ('arthur', 'juliano') order by slug",
    );
    expect(perfis).toEqual([
      { slug: "arthur", status: "pausado" },
      { slug: "juliano", status: "ativo" },
    ]);
  });

  it("registra os 3 webhooks uma vez só", async () => {
    const primeira = await garantirWebhooks(unipile, { urlApp: URL_APP, segredo: SEGREDO });
    const segunda = await garantirWebhooks(unipile, { urlApp: URL_APP, segredo: SEGREDO });
    expect(primeira.criados).toEqual(["messaging", "users", "account_status"]);
    expect(segunda.criados).toEqual([]);
    expect(unipile.chamadasDe("criarWebhook")[0]).toMatchObject({
      url: `${URL_APP}/api/webhooks/unipile`,
      headers: { "Unipile-Auth": SEGREDO, "Content-Type": "application/json" },
    });
  });
});
