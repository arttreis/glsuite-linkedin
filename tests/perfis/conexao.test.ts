import { beforeEach, describe, expect, it } from "vitest";
import {
  contasSemPerfil,
  destinosDaLigacao,
  garantirWebhooks,
  gerarLinkDeConexao,
  ligarContaPelaPlataforma,
  mensagemDaFalhaDoLink,
  registrarContaConectada,
} from "@/server/perfis/conexao";
import { sincronizarStatusDasContas } from "@/server/perfis/status-conta";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarOperador, criarOrganizacao, criarPerfilNaOrganizacao, idDoPerfil } from "../support/fixtures";
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
    expect(pedido).toMatchObject({ tipo: "create", nome: perfilId, sucessoUrl: `${URL_APP}/settings/linkedin?conexao=ok` });
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

  it("conta removida da Unipile conecta de novo como conta nova, não como reconexão", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await banco.db.query("update public.perfis set unipile_status = 'DELETED', status = 'pausado', motivo_pausa = 'A conta foi removida da Unipile.' where slug = 'arthur'");
    const perfilId = await idDoPerfil(banco.db, "arthur");
    await gerarLinkDeConexao({ db: banco.db, unipile, urlApp: URL_APP, segredo: SEGREDO }, { perfilId, agora: AGORA });
    const [pedido] = unipile.chamadasDe("gerarLinkDeConexao");
    expect(pedido).toMatchObject({ tipo: "create" });
    expect(pedido!.contaParaReconectar).toBeUndefined();

    // A conta nova chega pelo callback e toma o lugar da apagada; o perfil segue pausado.
    unipile.donos.set("acc-nova", { providerId: "ACoArthur", nome: "Arthur Reis", publicIdentifier: "arthur", premium: false, salesNavigator: false });
    await registrarContaConectada({ db: banco.db, unipile }, { status: "CREATION_SUCCESS", account_id: "acc-nova", name: perfilId }, AGORA);
    const [perfil] = await banco.db.query("select unipile_account_id, unipile_status, status from public.perfis where id = $1::uuid", [perfilId]);
    expect(perfil).toEqual({ unipile_account_id: "acc-nova", unipile_status: "OK", status: "pausado" });
  });

  it("link recusado vira mensagem: 401 é a chave da API, não a conta; o resto pede para tentar de novo", () => {
    expect(mensagemDaFalhaDoLink(new ErroUnipile({ status: 401, tipo: "missing_credentials", titulo: "Missing credentials" }))).toBe(
      "A Unipile recusou a chave da API (Unipile 401 missing_credentials: Missing credentials). Não é a conta do LinkedIn: peça ao admin para trocar a chave da API da Unipile.",
    );
    expect(mensagemDaFalhaDoLink(new ErroUnipile({ status: 503, tipo: "service_unavailable", titulo: "Please try again later." }))).toBe(
      "A Unipile não gerou o link de conexão (Unipile 503 service_unavailable: Please try again later.). Tente de novo em instantes.",
    );
    expect(() => mensagemDaFalhaDoLink(new Error("Perfil não encontrado"))).toThrow("Perfil não encontrado");
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

  it("conta nova leva o nome do dono no LinkedIn; reconectar a mesma conta mantém o nome editado", async () => {
    // O perfil nasce com o nome de quem vinculou, mas o LinkedIn conectado é de outra pessoa.
    const perfilId = await idDoPerfil(banco.db, "arthur");
    unipile.donos.set("acc-juliano", {
      providerId: "ACoJuliano",
      nome: "Juliano Souza",
      publicIdentifier: "juliano",
      premium: false,
      salesNavigator: false,
    });
    const deps = { db: banco.db, unipile };
    const nome = async () =>
      (await banco.db.query<{ nome: string }>("select nome from public.perfis where id = $1::uuid", [perfilId]))[0]!.nome;

    await registrarContaConectada(deps, { status: "CREATION_SUCCESS", account_id: "acc-juliano", name: perfilId }, AGORA);
    expect(await nome()).toBe("Juliano Souza");

    await banco.db.query("update public.perfis set nome = 'Juliano (comercial)' where id = $1::uuid", [perfilId]);
    await registrarContaConectada(deps, { status: "RECONNECTED", account_id: "acc-juliano", name: perfilId }, AGORA);
    expect(await nome()).toBe("Juliano (comercial)");
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

    expect(await sincronizarStatusDasContas(banco.db, unipile, AGORA)).toBe(1);

    const perfis = await banco.db.query<{ slug: string; status: string }>(
      "select slug, status from public.perfis where slug in ('arthur', 'juliano') order by slug",
    );
    expect(perfis).toEqual([
      { slug: "arthur", status: "pausado" },
      { slug: "juliano", status: "ativo" },
    ]);
  });

  it("sincronização com a chave recusada ou a Unipile fora sobe o erro em vez de dar sucesso", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await ativarPerfil(banco.db, "juliano", { accountId: "acc-juliano" });

    unipile.falharProxima("obterConta", new ErroUnipile({ status: 401, tipo: "missing_credentials", titulo: "Missing credentials" }));
    await expect(sincronizarStatusDasContas(banco.db, unipile, AGORA)).rejects.toThrow("missing_credentials");

    unipile.falharProxima("obterConta", new ErroUnipile({ status: 503, tipo: "http_503", titulo: "Service Unavailable" }));
    await expect(sincronizarStatusDasContas(banco.db, unipile, AGORA)).rejects.toThrow("503");

    unipile.falharProxima("obterConta", new ErroUnipile({ status: 0, tipo: "rede", titulo: "fetch failed" }));
    await expect(sincronizarStatusDasContas(banco.db, unipile, AGORA)).rejects.toThrow("rede");
  });

  it("recusa de uma conta só (401 invalid_credentials) pula a conta e as outras seguem", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await ativarPerfil(banco.db, "juliano", { accountId: "acc-juliano" });
    for (const id of ["acc-arthur", "acc-juliano"]) {
      unipile.contas.set(id, { id, tipo: "LINKEDIN", nome: null, status: ["CREDENTIALS"] });
    }
    unipile.falharProxima("obterConta", new ErroUnipile({ status: 401, tipo: "invalid_credentials", titulo: "Invalid credentials" }));

    // A primeira conta consultada falha e é pulada; a outra cai e é pausada.
    expect(await sincronizarStatusDasContas(banco.db, unipile, AGORA)).toBe(1);
    expect(unipile.chamadasDe("obterConta")).toHaveLength(2);
    const pausados = await banco.db.query(
      "select slug from public.perfis where slug in ('arthur', 'juliano') and status = 'pausado'",
    );
    expect(pausados).toHaveLength(1);
  });

  it("conta que a Unipile não acha mais (404) vira DELETED e pausa o perfil", async () => {
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    unipile.falharProxima("obterConta", new ErroUnipile({ status: 404, tipo: "resource_not_found", titulo: "Not found" }));

    // Só o arthur tem conta ligada nesta base, então a falha é dele.
    await sincronizarStatusDasContas(banco.db, unipile, AGORA);
    const [perfil] = await banco.db.query("select unipile_status, status from public.perfis where slug = 'arthur'");
    expect(perfil).toEqual({ unipile_status: "DELETED", status: "pausado" });
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

describe("ligar pela Plataforma uma conta que já está na Unipile (SDR-124)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  const ADMIN = "arthur@guessless.com.br";

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    unipile.contas.set("acc-ligada", { id: "acc-ligada", tipo: "LINKEDIN", nome: "Arthur Reis", status: ["OK"] });
    unipile.contas.set("acc-insta", { id: "acc-insta", tipo: "INSTAGRAM", nome: "guessless", status: ["OK"] });
    unipile.contas.set("acc-solta", {
      id: "acc-solta",
      tipo: "LINKEDIN",
      nome: "Juliano Unti",
      status: ["OK"],
      criadaEm: "2026-10-09T12:00:00.000Z",
    });
    unipile.donos.set("acc-solta", { providerId: "ACoJuliano", nome: "Juliano Unti", publicIdentifier: "juliano", premium: true, salesNavigator: false });
    // Só liga a conta, sem ativar: os perfis de teste das outras organizações copiam o do Arthur, pausado.
    await banco.db.query("update public.perfis set unipile_account_id = 'acc-ligada' where slug = 'arthur'");
  });

  it("lista só as contas do LinkedIn que nenhum perfil tem", async () => {
    expect(await contasSemPerfil({ db: banco.db, unipile })).toEqual([
      { id: "acc-solta", nome: "Juliano Unti", status: "OK", criadaEm: new Date("2026-10-09T12:00:00.000Z") },
    ]);
  });

  it("oferece os perfis sem conta ou com a conta apagada de cada organização", async () => {
    const organizacaoId = await criarOrganizacao(banco.db, { nome: "Organização X" });
    const livre = await criarPerfilNaOrganizacao(banco.db, { organizacaoId, slug: "livre-x" });
    const apagada = await criarPerfilNaOrganizacao(banco.db, { organizacaoId, slug: "apagada-x" });
    await banco.db.query("update public.perfis set unipile_account_id = 'acc-velha', unipile_status = 'DELETED' where id = $1::uuid", [apagada]);
    await criarPerfilNaOrganizacao(banco.db, { organizacaoId, slug: "ocupada-x" });
    await banco.db.query("update public.perfis set unipile_account_id = 'acc-x', unipile_status = 'OK' where slug = 'ocupada-x'");

    const destino = (await destinosDaLigacao(banco.db)).find((d) => d.organizacaoId === organizacaoId);
    expect(destino).toEqual({
      organizacaoId,
      organizacaoNome: "Organização X",
      perfis: [
        { id: apagada, nome: "apagada-x", casa: false, contaApagada: true },
        { id: livre, nome: "livre-x", casa: false, contaApagada: false },
      ],
    });
  });

  it("liga a conta solta ao perfil sem conta, registra conta_conectada com o e-mail do admin e mantém o perfil pausado", async () => {
    const organizacaoId = await criarOrganizacao(banco.db, { nome: "Organização X" });
    const perfilId = await criarPerfilNaOrganizacao(banco.db, { organizacaoId, slug: "juliano-x" });
    await banco.db.query("update public.perfis set nome = 'Juliano' where id = $1::uuid", [perfilId]);

    const resultado = await ligarContaPelaPlataforma(
      { db: banco.db, unipile },
      { accountId: "acc-solta", destino: { perfilId }, nomeDaConta: "Juliano Unti", ator: ADMIN, agora: AGORA },
    );

    expect(resultado).toEqual({
      ok: true,
      perfilId,
      mensagem: "Conta de Juliano Unti ligada ao perfil Juliano (Organização X). O perfil segue pausado.",
    });
    const [perfil] = await banco.db.query(
      `select unipile_account_id, linkedin_provider_id, tipo_conta, limite_nota_convite, unipile_status, status
         from public.perfis where id = $1::uuid`,
      [perfilId],
    );
    expect(perfil).toEqual({
      unipile_account_id: "acc-solta",
      linkedin_provider_id: "ACoJuliano",
      tipo_conta: "premium",
      limite_nota_convite: 300,
      unipile_status: "OK",
      status: "pausado",
    });
    const eventos = await banco.db.query("select tipo, ator from public.eventos where entidade_id = $1 and tipo like 'conta_%'", [perfilId]);
    expect(eventos).toEqual([{ tipo: "conta_conectada", ator: ADMIN }]);
    expect(await contasSemPerfil({ db: banco.db, unipile })).toEqual([]);
  });

  it("recusa conta já ligada a outro perfil, com o slug, sem tocar no destino", async () => {
    const organizacaoId = await criarOrganizacao(banco.db);
    const perfilId = await criarPerfilNaOrganizacao(banco.db, { organizacaoId, slug: "destino-x" });

    expect(
      await ligarContaPelaPlataforma(
        { db: banco.db, unipile },
        { accountId: "acc-ligada", destino: { perfilId }, nomeDaConta: "Arthur Reis", ator: ADMIN, agora: AGORA },
      ),
    ).toEqual({ ok: false, erro: "A conta já está ligada ao perfil arthur." });
    expect(
      await ligarContaPelaPlataforma(
        { db: banco.db, unipile },
        { accountId: "acc-ligada", destino: { organizacaoId }, nomeDaConta: "Arthur Reis", ator: ADMIN, agora: AGORA },
      ),
    ).toEqual({ ok: false, erro: "A conta já está ligada ao perfil arthur." });
    const perfis = await banco.db.query("select unipile_account_id from public.perfis where organizacao_id = $1::uuid", [organizacaoId]);
    expect(perfis).toEqual([{ unipile_account_id: null }]);
    expect(unipile.chamadasDe("obterConta")).toEqual([]);
  });

  it("recusa perfil que já tem uma conta que não foi apagada", async () => {
    const julianoId = await ativarPerfil(banco.db, "juliano", { accountId: "acc-juliano" });
    expect(
      await ligarContaPelaPlataforma(
        { db: banco.db, unipile },
        { accountId: "acc-solta", destino: { perfilId: julianoId }, nomeDaConta: "Juliano Unti", ator: ADMIN, agora: AGORA },
      ),
    ).toMatchObject({ ok: false, erro: expect.stringContaining("já tem uma conta do LinkedIn") });
  });

  it("conta nova cria o perfil pausado na organização, com quem é admin dela, e liga a conta nele", async () => {
    const organizacaoId = await criarOrganizacao(banco.db, { nome: "Organização X" });
    const adminId = await criarOperador(banco.db, { organizacaoId, papel: "admin", email: "dona@x.com" });

    const resultado = await ligarContaPelaPlataforma(
      { db: banco.db, unipile },
      { accountId: "acc-solta", destino: { organizacaoId }, nomeDaConta: "Juliano Unti", ator: ADMIN, agora: AGORA },
    );

    expect(resultado).toMatchObject({ ok: true, mensagem: "Conta de Juliano Unti ligada ao perfil Juliano Unti (Organização X). O perfil segue pausado." });
    const perfis = await banco.db.query(
      "select nome, operador_id, unipile_account_id, status from public.perfis where organizacao_id = $1::uuid",
      [organizacaoId],
    );
    expect(perfis).toEqual([{ nome: "Juliano Unti", operador_id: adminId, unipile_account_id: "acc-solta", status: "pausado" }]);
  });

  it("conta nova em organização sem ninguém ativo é recusada sem criar perfil", async () => {
    const organizacaoId = await criarOrganizacao(banco.db, { nome: "Vazia" });
    expect(
      await ligarContaPelaPlataforma(
        { db: banco.db, unipile },
        { accountId: "acc-solta", destino: { organizacaoId }, nomeDaConta: "Juliano Unti", ator: ADMIN, agora: AGORA },
      ),
    ).toEqual({ ok: false, erro: "Vazia não tem ninguém ativo na equipe para operar a conta nova." });
    expect(await banco.db.query("select id from public.perfis where organizacao_id = $1::uuid", [organizacaoId])).toEqual([]);
  });

  it("conta que não é do LinkedIn é recusada com o motivo", async () => {
    const organizacaoId = await criarOrganizacao(banco.db);
    const perfilId = await criarPerfilNaOrganizacao(banco.db, { organizacaoId, slug: "destino-y" });
    expect(
      await ligarContaPelaPlataforma(
        { db: banco.db, unipile },
        { accountId: "acc-insta", destino: { perfilId }, nomeDaConta: "guessless", ator: ADMIN, agora: AGORA },
      ),
    ).toEqual({ ok: false, erro: "A conta não foi ligada: conta INSTAGRAM não é do LinkedIn." });
  });
});
