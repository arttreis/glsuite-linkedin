import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { estadoDoPrimeiroAcesso, garantirOperadorDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { buscarOperadorAtivo, comOperador } from "@/server/db/operador";
import { arquivosDeMigration, criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, idDaOrganizacaoGuessless, idDoPerfil } from "../support/fixtures";

const AGORA = new Date("2026-10-10T15:00:00Z");
const DOMINIOS = ["guessless.com.br"];

describe("primeiro acesso: organização nova por domínio (SDR-40)", () => {
  let banco: BancoDeTeste;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
  });

  async function usuarioNoAuth(email: string): Promise<string> {
    const id = randomUUID();
    await banco.db.query("insert into auth.users (id, email) values ($1::uuid, $2)", [id, email]);
    return id;
  }

  const contar = async (tabela: "organizacoes" | "operadores") =>
    (await banco.db.query<{ n: number }>(`select count(*)::int as n from public.${tabela}`))[0]!.n;

  const pedido = (userId: string, email: string | null) => ({ userId, email, dominios: DOMINIOS, agora: AGORA });

  it("e-mail liberado sem operador ganha organização própria e vira admin dela", async () => {
    const userId = await usuarioNoAuth("ana.souza@guessless.com.br");
    const resultado = await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "Ana.Souza@GuessLess.com.br"));
    expect(resultado).toEqual({ operadorId: userId, criouOrganizacao: true });

    const operador = await buscarOperadorAtivo(banco.db, userId);
    expect(operador).toMatchObject({
      nome: "Ana Souza",
      email: "ana.souza@guessless.com.br",
      papel: "admin",
      organizacaoNome: "Empresa de Ana Souza",
      primeiroAcessoConcluido: false,
    });
    expect(operador!.organizacaoId).not.toBe(await idDaOrganizacaoGuessless(banco.db));

    const [evento] = await banco.db.query<{ entidade_id: string; ator: string }>(
      "select entidade_id, ator from public.eventos where tipo = 'organizacao_criada'",
    );
    expect(evento).toEqual({ entidade_id: operador!.organizacaoId, ator: userId });
  });

  it("dois callbacks do mesmo usuário criam uma organização só", async () => {
    const userId = await usuarioNoAuth("bia@guessless.com.br");
    const antes = await contar("organizacoes");
    const resultados = await Promise.all([
      garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "bia@guessless.com.br")),
      garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "bia@guessless.com.br")),
    ]);
    expect(resultados.filter((r) => r?.criouOrganizacao)).toHaveLength(1);
    expect(await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "bia@guessless.com.br"))).toEqual({
      operadorId: userId,
      criouOrganizacao: false,
    });
    expect(await contar("organizacoes")).toBe(antes + 1);
  });

  it("e-mail fora dos domínios liberados não ganha nada", async () => {
    const userId = await usuarioNoAuth("alguem@gmail.com");
    const antes = await contar("organizacoes");
    expect(await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "alguem@gmail.com"))).toBeNull();
    expect(await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, null))).toBeNull();
    expect(await contar("organizacoes")).toBe(antes);
    expect(await contar("operadores")).toBe(0);
  });

  it("operador que já existe segue na organização dele", async () => {
    const userId = await criarOperador(banco.db, { email: "juliano@guessless.com.br" });
    const antes = await contar("organizacoes");
    expect(await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "juliano@guessless.com.br"))).toEqual({
      operadorId: userId,
      criouOrganizacao: false,
    });
    expect(await contar("organizacoes")).toBe(antes);
  });

  it("operador desativado não ganha organização nova", async () => {
    const userId = await criarOperador(banco.db, { email: "saiu@guessless.com.br", ativo: false });
    const antes = await contar("organizacoes");
    expect(await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "saiu@guessless.com.br"))).toBeNull();
    expect(await contar("organizacoes")).toBe(antes);
  });

  it("e-mail que já é de outro operador não vira segundo operador", async () => {
    await criarOperador(banco.db, { email: "dupla@guessless.com.br" });
    const outroUsuario = await usuarioNoAuth("dupla@guessless.com.br");
    expect(await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(outroUsuario, "dupla@guessless.com.br"))).toBeNull();
  });

  it("a organização nova não enxerga os perfis nem a oferta da GuessLess", async () => {
    await banco.db.query(
      `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
       values ($1::uuid, 'https://guessless.com.br/', 'pronta', '{}'::jsonb, '{}'::jsonb, now())`,
      [await idDaOrganizacaoGuessless(banco.db)],
    );
    const userId = await usuarioNoAuth("caio@guessless.com.br");
    await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "caio@guessless.com.br"));
    const perfis = await comOperador(banco.db, userId, (tx) => tx.query("select id from public.perfis"));
    expect(perfis).toEqual([]);
    const estado = await comOperador(banco.db, userId, (tx) => estadoDoPrimeiroAcesso(tx));
    expect(estado.atual).toBe("site");
  });

  it("o passo atual sai dos dados: site lido vai para a análise, análise confirmada vai para o SDR", async () => {
    const userId = await usuarioNoAuth("duda@guessless.com.br");
    await garantirOperadorDoPrimeiroAcesso(banco.db, pedido(userId, "duda@guessless.com.br"));
    const { organizacaoId } = (await buscarOperadorAtivo(banco.db, userId))!;
    const estado = () => comOperador(banco.db, userId, (tx) => estadoDoPrimeiroAcesso(tx));

    await banco.db.query("insert into public.ofertas (organizacao_id, url) values ($1::uuid, 'https://duda.com.br/')", [
      organizacaoId,
    ]);
    expect((await estado()).atual).toBe("analise");

    await banco.db.query(
      "update public.ofertas set dossie_confirmado = '{}'::jsonb, confirmado_em = now() where organizacao_id = $1::uuid",
      [organizacaoId],
    );
    const depois = await estado();
    expect(depois.atual).toBe("sdr");
    expect([...depois.feitos]).toEqual(["site", "analise"]);
  });

  it("a migration dá o primeiro acesso por feito a quem tem conta conectada, e roda de novo sem erro", async () => {
    const guessless = await idDaOrganizacaoGuessless(banco.db);
    await banco.db.query("update public.perfis set unipile_account_id = 'conta-arthur' where id = $1::uuid", [
      await idDoPerfil(banco.db, "arthur"),
    ]);
    const migration = arquivosDeMigration().find((arquivo) => arquivo.endsWith("_primeiro_acesso.sql"))!;
    await banco.pg.exec(readFileSync(migration, "utf8"));
    await banco.pg.exec(readFileSync(migration, "utf8"));

    const [org] = await banco.db.query<{ concluido: boolean }>(
      "select primeiro_acesso_em is not null as concluido from public.organizacoes where id = $1::uuid",
      [guessless],
    );
    expect(org!.concluido).toBe(true);
  });
});
