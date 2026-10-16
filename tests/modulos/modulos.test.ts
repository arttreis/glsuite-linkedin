import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { buscarOperadorAtivo, comOperador } from "@/server/db/operador";
import { alterarModulo, modulosDaOrganizacao, organizacoesNaPlataforma, situacaoDosModulos, usoDoMes } from "@/server/modulos/modulos";
import { aplicarMigrations, criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import {
  ativarPerfil,
  criarCampanha,
  criarLead,
  criarOperador,
  criarOrganizacao,
  criarPerfilNaOrganizacao,
  criarPessoa,
  idDaOrganizacaoGuessless,
} from "../support/fixtures";

const AGORA = new Date("2026-10-16T13:00:00Z");
const ADMIN_DA_PLATAFORMA = "arthur@guessless.com.br";

describe("módulos por organização (SDR-69, §4.14)", () => {
  let banco: BancoDeTeste;
  let guessless: string;

  const mudar = (p: { organizacaoId: string; modulo: "linkedin" | "whatsapp" | "telegram"; ativo: boolean; motivo?: string | null; agora?: Date }) =>
    alterarModulo(banco.db, {
      organizacaoId: p.organizacaoId,
      modulo: p.modulo,
      ativo: p.ativo,
      motivo: p.motivo === undefined ? "contrato de outubro" : p.motivo,
      por: ADMIN_DA_PLATAFORMA,
      agora: p.agora ?? AGORA,
    });
  const eventos = (organizacaoId: string) =>
    banco.db.query<{ tipo: string; ator: string; payload: { modulo: string; motivo: string } }>(
      "select tipo, ator, payload from public.eventos where entidade = 'organizacao' and entidade_id = $1 and tipo like 'modulo_%' order by id",
      [organizacaoId],
    );

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    guessless = await idDaOrganizacaoGuessless(banco.db);
  });

  it("a organização da GuessLess tem os três; organização nova nasce só com o SDR no LinkedIn", async () => {
    expect(await modulosDaOrganizacao(banco.db, guessless)).toEqual(["linkedin", "whatsapp", "telegram"]);
    const nova = await criarOrganizacao(banco.db);
    expect(await modulosDaOrganizacao(banco.db, nova)).toEqual(["linkedin"]);
    const situacao = await situacaoDosModulos(banco.db, nova);
    expect(situacao.map((s) => [s.modulo, s.ativo])).toEqual([
      ["linkedin", true],
      ["whatsapp", false],
      ["telegram", false],
    ]);
  });

  it("o operador carrega os módulos da organização dele, na ordem do catálogo", async () => {
    const nova = await criarOrganizacao(banco.db);
    const operador = await criarOperador(banco.db, { organizacaoId: nova, papel: "admin" });
    await mudar({ organizacaoId: nova, modulo: "telegram", ativo: true });
    expect((await buscarOperadorAtivo(banco.db, operador))!.modulos).toEqual(["linkedin", "telegram"]);
    await mudar({ organizacaoId: nova, modulo: "linkedin", ativo: false });
    expect((await buscarOperadorAtivo(banco.db, operador))!.modulos).toEqual(["telegram"]);
  });

  it("ligar grava quem, quando e o motivo; pedir o mesmo estado não muda nada nem grava evento", async () => {
    const nova = await criarOrganizacao(banco.db);
    expect(await mudar({ organizacaoId: nova, modulo: "whatsapp", ativo: true })).toEqual({ ok: true, mudou: true, contasPausadas: 0 });
    const [whatsapp] = (await situacaoDosModulos(banco.db, nova)).filter((s) => s.modulo === "whatsapp");
    expect(whatsapp).toMatchObject({ ativo: true, desde: AGORA, motivo: "contrato de outubro", alteradoPor: ADMIN_DA_PLATAFORMA });

    expect(await mudar({ organizacaoId: nova, modulo: "whatsapp", ativo: true })).toEqual({ ok: true, mudou: false, contasPausadas: 0 });
    expect(await eventos(nova)).toEqual([
      { tipo: "modulo_ligado", ator: ADMIN_DA_PLATAFORMA, payload: { modulo: "whatsapp", motivo: "contrato de outubro" } },
    ]);
  });

  it("sem motivo ou com organização que não existe, recusa", async () => {
    const nova = await criarOrganizacao(banco.db);
    expect(await mudar({ organizacaoId: nova, modulo: "whatsapp", ativo: true, motivo: null })).toMatchObject({
      ok: false,
      erro: expect.stringContaining("motivo"),
    });
    expect(await mudar({ organizacaoId: "00000000-0000-4000-8000-000000000000", modulo: "whatsapp", ativo: true })).toMatchObject({
      ok: false,
      erro: "Organização não encontrada.",
    });
    expect(await modulosDaOrganizacao(banco.db, nova)).toEqual(["linkedin"]);
  });

  it("desligar o SDR no LinkedIn pausa as contas ativas da organização, com o motivo; religar não despausa", async () => {
    // O perfil de outra organização copia a configuração do Arthur: nasce antes de o Arthur ser ativado.
    const outra = await criarOrganizacao(banco.db);
    const deFora = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: outra, slug: "de-fora" });
    const arthur = await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    const luiz = await ativarPerfil(banco.db, "luiz", { accountId: "acc-luiz" });
    await banco.db.query("update public.perfis set casa = true where id = $1::uuid", [luiz]);
    await banco.db.query(
      "update public.perfis set status = 'ativo', motivo_pausa = null, ativado_em = $2, unipile_account_id = 'acc-fora' where id = $1::uuid",
      [deFora, AGORA],
    );

    const desligado = await mudar({ organizacaoId: guessless, modulo: "linkedin", ativo: false, motivo: "cancelou" });
    expect(desligado).toEqual({ ok: true, mudou: true, contasPausadas: 1 });

    const status = await banco.db.query<{ id: string; status: string; motivo_pausa: string | null }>(
      "select id, status, motivo_pausa from public.perfis where id = any($1::uuid[])",
      [[arthur, luiz, deFora]],
    );
    expect(status.find((p) => p.id === arthur)).toMatchObject({ status: "pausado", motivo_pausa: "O módulo SDR no LinkedIn foi desligado: cancelou" });
    // A conta da casa só busca, e a de outra organização não é desta.
    expect(status.find((p) => p.id === luiz)).toMatchObject({ status: "ativo" });
    expect(status.find((p) => p.id === deFora)).toMatchObject({ status: "ativo" });
    const [alerta] = await banco.db.query<{ perfil_id: string }>("select perfil_id from public.alertas where tipo = 'perfil_pausado'");
    expect(alerta).toEqual({ perfil_id: arthur });

    expect(await mudar({ organizacaoId: guessless, modulo: "linkedin", ativo: true, motivo: "voltou" })).toEqual({
      ok: true,
      mudou: true,
      contasPausadas: 0,
    });
    const [depois] = await banco.db.query<{ status: string }>("select status from public.perfis where id = $1::uuid", [arthur]);
    expect(depois!.status).toBe("pausado");
    expect((await eventos(guessless)).map((e) => e.tipo)).toEqual(["modulo_desligado", "modulo_ligado"]);
  });

  it("o operador lê só os módulos da organização dele e não muda nenhum", async () => {
    const nova = await criarOrganizacao(banco.db);
    const deFora = await criarOperador(banco.db, { organizacaoId: nova, papel: "admin" });
    const lidos = await comOperador(banco.db, deFora, (tx) =>
      tx.query<{ organizacao_id: string; modulo: string }>("select organizacao_id, modulo from public.modulos_da_organizacao"),
    );
    expect(lidos).toEqual([{ organizacao_id: nova, modulo: "linkedin" }]);

    await expect(
      comOperador(banco.db, deFora, (tx) =>
        tx.query("insert into public.modulos_da_organizacao (organizacao_id, modulo) values ($1::uuid, 'whatsapp')", [nova]),
      ),
    ).rejects.toThrow();
    await expect(
      comOperador(banco.db, deFora, (tx) =>
        tx.query("update public.modulos_da_organizacao set ativo = false where organizacao_id = $1::uuid", [nova]),
      ),
    ).rejects.toThrow();
    expect(await modulosDaOrganizacao(banco.db, nova)).toEqual(["linkedin"]);
  });

  it("o uso do mês conta só a organização, do dia 1 no horário de Brasília até agora", async () => {
    const outra = await criarOrganizacao(banco.db);
    await criarPerfilNaOrganizacao(banco.db, { organizacaoId: outra, slug: "outra-conta" });
    const arthur = await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    const campanha = await criarCampanha(banco.db, { perfil: "arthur" });
    const lead = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha, estado: "convite_enviado" });
    const convite = (enviadaEm: string, chave: string) =>
      banco.db.query(
        `insert into public.acoes (lead_id, perfil_id, tipo, toque, origem, status, agendada_para, idempotency_key, enviada_em)
         values ($1::uuid, $2::uuid, 'convite', 'T1', 'template', 'enviada', $3::timestamptz, $4, $3::timestamptz)`,
        [lead, arthur, enviadaEm, chave],
      );
    await convite("2026-10-01T03:30:00Z", "dentro"); // 00h30 de 1º/10 em Brasília
    await convite("2026-10-01T02:30:00Z", "fora"); // 23h30 de 30/09 em Brasília
    await banco.db.query(
      "insert into public.mensagens (lead_id, perfil_id, direcao, autor, texto, em) values ($1::uuid, $2::uuid, 'saida', 'ia', 'Oi', $3), ($1::uuid, $2::uuid, 'entrada', 'prospect', 'Olá', $3)",
      [lead, arthur, "2026-10-10T12:00:00Z"],
    );

    expect(await usoDoMes(banco.db, { organizacaoId: guessless, agora: AGORA })).toEqual({
      contasDoLinkedin: 1,
      convites: 1,
      mensagensDoLinkedin: 1,
    });
    expect(await usoDoMes(banco.db, { organizacaoId: outra, agora: AGORA })).toEqual({ contasDoLinkedin: 0, convites: 0, mensagensDoLinkedin: 0 });
  });

  it("a Plataforma lista as organizações com admins, equipe, contas e os três módulos de cada uma", async () => {
    await criarOperador(banco.db, { papel: "admin", email: "midia@guessless.com.br" });
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    const nova = await criarOrganizacao(banco.db, { nome: "Acme" });

    const organizacoes = await organizacoesNaPlataforma(banco.db);
    const daGuessless = organizacoes.find((o) => o.id === guessless)!;
    expect(daGuessless).toMatchObject({ admins: ["midia@guessless.com.br"], operadores: 1, contasDoLinkedin: 1 });
    expect(daGuessless.modulos.map((m) => m.ativo)).toEqual([true, true, true]);
    const acme = organizacoes.find((o) => o.id === nova)!;
    expect(acme).toMatchObject({ nome: "Acme", admins: [], operadores: 0, contasDoLinkedin: 0, primeiroAcessoEm: null });
    expect(acme.modulos.map((m) => [m.modulo, m.ativo])).toEqual([
      ["linkedin", true],
      ["whatsapp", false],
      ["telegram", false],
    ]);
    expect(Object.keys(acme.modulos[0]!).sort()).toEqual(["alteradoEm", "alteradoPor", "ativo", "desde", "modulo", "motivo"]);
  });

  it("a migration para antes se já existe uma tabela de mesmo nome que não é do Kakou (banco dividido)", async () => {
    const pg = await PGlite.create();
    try {
      await pg.exec(readFileSync(path.resolve(import.meta.dirname, "../sql/supabase-bootstrap.sql"), "utf8"));
      await pg.exec("create table public.modulos_da_organizacao (id integer primary key, nome text)");
      await expect(aplicarMigrations(pg)).rejects.toThrow(/modulos_da_organizacao já existe e não é do Kakou/);
    } finally {
      await pg.close();
    }
  });
});
