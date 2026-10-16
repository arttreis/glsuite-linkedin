import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { garantirOperadorDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { buscarOperadorAtivo, comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { marcasDoOperador, trocarDeMarca } from "@/server/marcas/marcas";
import { arquivosDeMigration, criarBancoDeTeste, criarDbPglite, type BancoDeTeste } from "../support/banco";
import { criarDuasMarcas, type DuasMarcas } from "../support/duas-marcas";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";

const AGORA = new Date("2026-10-20T13:00:00Z");

describe("marcas: a migration (SDR-105, §4.30)", () => {
  it("cada organização que já existe vira uma marca, todo operador entra nela, e rodar de novo não duplica", async () => {
    const pg = await PGlite.create();
    try {
      await pg.exec(readFileSync(path.resolve(import.meta.dirname, "../sql/supabase-bootstrap.sql"), "utf8"));
      const todas = arquivosDeMigration();
      const marcas = todas.find((arquivo) => arquivo.endsWith("_marcas.sql"))!;
      for (const arquivo of todas.filter((a) => a < marcas)) await pg.exec(readFileSync(arquivo, "utf8"));

      const db = criarDbPglite(pg);
      const outra = randomUUID();
      await db.query("insert into public.organizacoes (id, slug, nome) values ($1::uuid, 'outra', 'Outra Empresa')", [outra]);
      await criarOperador(db, { nome: "Da GuessLess", papel: "admin" });
      await criarOperador(db, { nome: "Da Outra", organizacaoId: outra });

      const sql = readFileSync(marcas, "utf8");
      await pg.exec(sql);
      await pg.exec(sql);
      for (const arquivo of todas.filter((a) => a > marcas)) await pg.exec(readFileSync(arquivo, "utf8"));

      const linhas = await db.query<{ nome: string; cor: string; status: string; tem_analise: boolean }>(
        "select nome, cor, status, analise_e_sdr_em is not null as tem_analise from public.marcas order by nome",
      );
      expect(linhas).toEqual([
        { nome: "GuessLess", cor: "verde", status: "ativa", tem_analise: true },
        { nome: "Outra Empresa", cor: "verde", status: "ativa", tem_analise: true },
      ]);
      const [semMarca] = await db.query<{ n: number }>(
        `select count(*)::int as n from public.operadores o
          where o.marca_atual_id is null
             or not exists (select 1 from public.acessos_das_marcas a where a.operador_id = o.id and a.marca_id = o.marca_atual_id)
             or not exists (select 1 from public.marcas m where m.id = o.marca_atual_id and m.organizacao_id = o.organizacao_id)`,
      );
      expect(semMarca!.n).toBe(0);
      const [acessos] = await db.query<{ n: number; operadores: number }>(
        "select count(*)::int as n, (select count(*)::int from public.operadores) as operadores from public.acessos_das_marcas",
      );
      expect(acessos!.n).toBe(acessos!.operadores);
    } finally {
      await pg.close();
    }
  });

  it("para antes de mexer numa tabela marcas que não é do Kakou", async () => {
    const pg = await PGlite.create();
    try {
      await pg.exec(readFileSync(path.resolve(import.meta.dirname, "../sql/supabase-bootstrap.sql"), "utf8"));
      const todas = arquivosDeMigration();
      const marcas = todas.find((arquivo) => arquivo.endsWith("_marcas.sql"))!;
      for (const arquivo of todas.filter((a) => a < marcas)) await pg.exec(readFileSync(arquivo, "utf8"));
      await pg.exec("create table public.marcas (id integer primary key, nome text)");
      await expect(pg.exec(readFileSync(marcas, "utf8"))).rejects.toThrow(/public.marcas já existe e não é do Kakou/);
    } finally {
      await pg.close();
    }
  });
});

describe("marcas: marca 1, acesso e marca atual (SDR-105, §4.30)", () => {
  let banco: BancoDeTeste;
  let f: DuasMarcas;

  const comoOperador = <T>(operadorId: string, sql: string, params?: unknown[]) =>
    comOperador(banco.db, operadorId, (tx) => tx.query<T>(sql, params));
  const marcaAtualDe = async (operadorId: string) =>
    (await comoOperador<{ marca: string | null }>(operadorId, "select public.marca_atual() as marca"))[0]!.marca;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    f = await criarDuasMarcas(banco.db);
  });

  it("organização nova nasce com a marca 1, e o operador novo entra nela com acesso", async () => {
    const nova = await criarOrganizacao(banco.db, { nome: "Loja Nova" });
    const [marca] = await banco.db.query<{ id: string; nome: string; cor: string }>(
      "select id, nome, cor from public.marcas where organizacao_id = $1::uuid",
      [nova],
    );
    expect(marca).toMatchObject({ nome: "Loja Nova", cor: "verde" });

    const operador = await criarOperador(banco.db, { organizacaoId: nova });
    const [linha] = await banco.db.query<{ marca_atual_id: string; acessos: string[] }>(
      `select marca_atual_id, array(select marca_id from public.acessos_das_marcas where operador_id = o.id) as acessos
         from public.operadores o where id = $1::uuid`,
      [operador],
    );
    expect(linha).toEqual({ marca_atual_id: marca!.id, acessos: [marca!.id] });
    expect(await marcaAtualDe(operador)).toBe(marca!.id);
  });

  it("o primeiro acesso de um e-mail novo cria a organização com a marca 1 e põe o admin nela", async () => {
    const userId = randomUUID();
    await banco.db.query("insert into auth.users (id, email) values ($1::uuid, 'ana@guessless.com.br')", [userId]);
    await garantirOperadorDoPrimeiroAcesso(banco.db, { userId, email: "ana@guessless.com.br", dominios: ["guessless.com.br"], agora: AGORA });
    const operador = (await buscarOperadorAtivo(banco.db, userId))!;
    expect(operador.marcas.map((m) => m.nome)).toEqual(["Empresa de Ana"]);
    expect(operador).toMatchObject({ marcaId: operador.marcas[0]!.id, marcaNome: "Empresa de Ana", marcaCor: "verde" });
  });

  it("o operador só da A, com a marca atual forçada para a B, fica sem marca atual e só vê a A", async () => {
    await banco.db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [f.operadorA, f.marcaB]);
    expect(await marcaAtualDe(f.operadorA)).toBeNull();
    const vistas = await comoOperador<{ id: string }>(f.operadorA, "select id from public.marcas");
    expect(vistas).toEqual([{ id: f.marcaA }]);
  });

  it("marca_atual() devolve a marca atual para quem tem acesso e null para quem perdeu", async () => {
    expect(await marcaAtualDe(f.operadorA)).toBe(f.marcaA);
    await banco.db.query("delete from public.acessos_das_marcas where operador_id = $1::uuid", [f.operadorA]);
    expect(await marcaAtualDe(f.operadorA)).toBeNull();
  });

  it("o admin vê as duas marcas; o admin de outra organização não vê a A, nem apontando para ela", async () => {
    const vistas = await comoOperador<{ nome: string }>(f.admin, "select nome from public.marcas order by nome");
    expect(vistas.map((m) => m.nome)).toEqual(["Alfa", "Beta"]);
    expect(await marcaAtualDe(f.admin)).toBe(f.marcaA);

    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: await idDaOrganizacaoGuessless(banco.db) });
    await banco.db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [deFora, f.marcaA]);
    const [linha] = await comoOperador<{ pode: boolean; atual: string | null }>(
      deFora,
      "select public.pode_ver_marca($1::uuid) as pode, public.marca_atual() as atual",
      [f.marcaA],
    );
    expect(linha).toEqual({ pode: false, atual: null });
    const daAgencia = await comoOperador<{ id: string }>(deFora, "select id from public.marcas where organizacao_id = $1::uuid", [f.organizacaoId]);
    expect(daAgencia).toEqual([]);
  });

  it("cada um lê os próprios acessos; só o admin dá acesso, e só na organização dele", async () => {
    const meus = await comoOperador<{ marca_id: string }>(f.operadorA, "select marca_id from public.acessos_das_marcas");
    expect(meus).toEqual([{ marca_id: f.marcaA }]);
    await expect(
      comoOperador(f.operadorA, "insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid)", [f.operadorA, f.marcaB]),
    ).rejects.toThrow();

    await comoOperador(f.admin, "insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid)", [f.operadorA, f.marcaB]);
    expect((await marcasDoOperador(banco.db, f.operadorA)).map((m) => m.nome)).toEqual(["Alfa", "Beta"]);

    const deFora = await criarOperador(banco.db);
    await expect(
      comoOperador(f.admin, "insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid)", [deFora, f.marcaA]),
    ).rejects.toThrow();
  });

  it("o admin muda nome e cor; o operador não", async () => {
    await comoOperador(f.admin, "update public.marcas set nome = 'Alfa Moda', cor = 'rosa' where id = $1::uuid", [f.marcaA]);
    const editadas = await comoOperador(f.operadorA, "update public.marcas set nome = 'Outra' where id = $1::uuid returning id", [f.marcaA]);
    expect(editadas).toEqual([]);
    const [marca] = await banco.db.query("select nome, cor from public.marcas where id = $1::uuid", [f.marcaA]);
    expect(marca).toEqual({ nome: "Alfa Moda", cor: "rosa" });
  });

  describe("preencher_marca()", () => {
    beforeEach(async () => {
      await banco.pg.exec(`
        create table public.coisas_de_teste (
          id serial primary key,
          organizacao_id uuid not null references public.organizacoes (id),
          marca_id uuid references public.marcas (id)
        );
        create trigger coisas_de_teste_marca before insert on public.coisas_de_teste
          for each row execute function public.preencher_marca();
        grant select, insert on public.coisas_de_teste to authenticated;
        grant usage on sequence public.coisas_de_teste_id_seq to authenticated;
      `);
    });
    const inserir = (db: Db, organizacaoId: string) =>
      db.query<{ marca_id: string }>("insert into public.coisas_de_teste (organizacao_id) values ($1::uuid) returning marca_id", [organizacaoId]);

    it("com operador, preenche com a marca atual", async () => {
      await banco.db.query("insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid)", [f.operadorA, f.marcaB]);
      await banco.db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [f.operadorA, f.marcaB]);
      const [linha] = await comOperador(banco.db, f.operadorA, (tx) => inserir(tx, f.organizacaoId));
      expect(linha!.marca_id).toBe(f.marcaB);
    });

    it("sem operador e com uma marca, preenche com a única", async () => {
      const guessless = await idDaOrganizacaoGuessless(banco.db);
      const [unica] = await banco.db.query<{ id: string }>("select id from public.marcas where organizacao_id = $1::uuid", [guessless]);
      const [linha] = await inserir(banco.db, guessless);
      expect(linha!.marca_id).toBe(unica!.id);
    });

    it("sem operador e com duas marcas, recusa com 'Informe a marca'", async () => {
      await expect(inserir(banco.db, f.organizacaoId)).rejects.toThrow(/Informe a marca: a organização tem 2 marcas/);
    });

    it("com operador de outra organização, não usa a marca atual dele", async () => {
      const guessless = await idDaOrganizacaoGuessless(banco.db);
      const [unica] = await banco.db.query<{ id: string }>("select id from public.marcas where organizacao_id = $1::uuid", [guessless]);
      // A marca atual do operador é a Alfa, de outra organização: vale a única da GuessLess.
      const [linha] = await comOperador(banco.db, f.operadorA, (tx) => inserir(tx, guessless));
      expect(linha!.marca_id).toBe(unica!.id);
    });
  });

  describe("trocarDeMarca", () => {
    const eventos = () =>
      banco.db.query<{ entidade_id: string; ator: string; payload: { de: string; para: string } }>(
        "select entidade_id, ator, payload from public.eventos where tipo = 'marca_trocada' order by id",
      );
    const atualNoBanco = async (operadorId: string) =>
      (await banco.db.query<{ m: string | null }>("select marca_atual_id as m from public.operadores where id = $1::uuid", [operadorId]))[0]!.m;

    it("com acesso, troca, muda marca_atual_id e grava o evento", async () => {
      const resultado = await trocarDeMarca(banco.db, { operadorId: f.admin, marcaId: f.marcaB, agora: AGORA });
      expect(resultado).toMatchObject({ ok: true, marca: { id: f.marcaB, nome: "Beta", cor: "azul", inicial: "B" } });
      expect(await atualNoBanco(f.admin)).toBe(f.marcaB);
      expect(await eventos()).toEqual([{ entidade_id: f.admin, ator: f.admin, payload: { de: f.marcaA, para: f.marcaB } }]);
    });

    it("sem acesso à marca, recusa e não muda nada", async () => {
      expect(await trocarDeMarca(banco.db, { operadorId: f.operadorA, marcaId: f.marcaB, agora: AGORA })).toEqual({
        ok: false,
        erro: "Você não tem acesso a essa marca.",
      });
      expect(await atualNoBanco(f.operadorA)).toBe(f.marcaA);
      expect(await eventos()).toEqual([]);
    });

    it("marca de outra organização, recusa mesmo para o admin", async () => {
      const guessless = await idDaOrganizacaoGuessless(banco.db);
      const [deFora] = await banco.db.query<{ id: string }>("select id from public.marcas where organizacao_id = $1::uuid", [guessless]);
      expect(await trocarDeMarca(banco.db, { operadorId: f.admin, marcaId: deFora!.id, agora: AGORA })).toEqual({
        ok: false,
        erro: "Você não tem acesso a essa marca.",
      });
      expect(await atualNoBanco(f.admin)).toBe(f.marcaA);
    });

    it("com o kill switch, recusa", async () => {
      await banco.db.query("update public.configuracoes set valor = jsonb_set(valor, '{ativo}', 'false') where chave = 'marcas'");
      expect(await trocarDeMarca(banco.db, { operadorId: f.admin, marcaId: f.marcaB, agora: AGORA })).toEqual({
        ok: false,
        erro: "A troca de marca está desligada.",
      });
      expect(await atualNoBanco(f.admin)).toBe(f.marcaA);
    });
  });

  describe("buscarOperadorAtivo", () => {
    it("traz a marca atual e as marcas que o operador vê, por nome", async () => {
      expect(await buscarOperadorAtivo(banco.db, f.admin)).toMatchObject({
        marcaId: f.marcaA,
        marcaNome: "Alfa",
        marcaCor: "verde",
        marcas: [
          { id: f.marcaA, nome: "Alfa", cor: "verde", inicial: "A", status: "ativa" },
          { id: f.marcaB, nome: "Beta", cor: "azul", inicial: "B", status: "ativa" },
        ],
      });
      expect((await buscarOperadorAtivo(banco.db, f.operadorA))!.marcas.map((m) => m.id)).toEqual([f.marcaA]);
    });

    it("com a marca atual numa marca sem acesso, cai na primeira com acesso e corrige o banco", async () => {
      await banco.db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [f.operadorA, f.marcaB]);
      expect(await buscarOperadorAtivo(banco.db, f.operadorA)).toMatchObject({ marcaId: f.marcaA, marcaNome: "Alfa" });
      const [linha] = await banco.db.query<{ m: string }>("select marca_atual_id as m from public.operadores where id = $1::uuid", [f.operadorA]);
      expect(linha!.m).toBe(f.marcaA);
    });

    it("sem marca atual, cai na primeira ativa", async () => {
      await banco.db.query("update public.marcas set status = 'pausada' where id = $1::uuid", [f.marcaA]);
      await banco.db.query("update public.operadores set marca_atual_id = null where id = $1::uuid", [f.admin]);
      expect(await buscarOperadorAtivo(banco.db, f.admin)).toMatchObject({ marcaId: f.marcaB });
    });

    it("sem acesso a nenhuma marca, devolve o operador com marcas vazia", async () => {
      await banco.db.query("delete from public.acessos_das_marcas where operador_id = $1::uuid", [f.operadorA]);
      expect(await buscarOperadorAtivo(banco.db, f.operadorA)).toMatchObject({ nome: "Operador da Alfa", marcas: [], marcaId: "" });
    });
  });
});
