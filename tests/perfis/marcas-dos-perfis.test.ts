import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { perfilDoPrimeiroAcesso } from "@/server/acesso/vinculo";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import {
  contasParaLigar,
  desligarPerfilDaMarca,
  ERRO_DA_ULTIMA_MARCA,
  ligarPerfilAMarca,
  perfisDaMarca,
  soDaMarca,
} from "@/server/perfis/marcas-dos-perfis";
import { contaNovaDoLinkedin } from "@/server/perfis/nova-conta";
import { arquivosDeMigration, criarBancoDeTeste, criarDbPglite, type BancoDeTeste } from "../support/banco";
import { criarDuasMarcas, type DuasMarcas } from "../support/duas-marcas";
import { criarOperador, criarOrganizacao, criarPerfilNaOrganizacao, idDaOrganizacaoGuessless, SEQUENCIA_PADRAO } from "../support/fixtures";

const AGORA = new Date("2026-10-20T13:00:00Z");

/** Banco com as migrations até antes da `_marcas_dos_perfis`, para ver o backfill e a guarda. */
async function bancoAntesDaMigration() {
  const pg = await PGlite.create();
  await pg.exec(readFileSync(path.resolve(import.meta.dirname, "../sql/supabase-bootstrap.sql"), "utf8"));
  const todas = arquivosDeMigration();
  const migration = todas.find((arquivo) => arquivo.endsWith("_marcas_dos_perfis.sql"))!;
  for (const arquivo of todas.filter((a) => a < migration)) await pg.exec(readFileSync(arquivo, "utf8"));
  return { pg, db: criarDbPglite(pg), sql: readFileSync(migration, "utf8"), depois: todas.filter((a) => a > migration) };
}

describe("marcas_dos_perfis: a migration (SDR-108, §4.30)", () => {
  it("liga cada perfil que não é a casa à marca 1 da organização, sem a casa, e rodar de novo não duplica", async () => {
    const { pg, db, sql, depois } = await bancoAntesDaMigration();
    try {
      const outra = await criarOrganizacao(db, { nome: "Outra Empresa" });
      const daOutra = await criarPerfilNaOrganizacao(db, { organizacaoId: outra, slug: "da-outra" });
      // A segunda marca da outra organização é mais nova: o backfill usa a marca 1.
      await db.query("insert into public.marcas (organizacao_id, nome, criado_em) values ($1::uuid, 'Segunda', now() + interval '1 day')", [outra]);
      const casa = await criarPerfilNaOrganizacao(db, { organizacaoId: outra, slug: "casa" });
      await db.query("update public.perfis set casa = true where id = $1::uuid", [casa]);

      await pg.exec(sql);
      await pg.exec(sql);
      for (const arquivo of depois) await pg.exec(readFileSync(arquivo, "utf8"));

      const [semMarca] = await db.query<{ n: number }>(
        "select count(*)::int as n from public.perfis p where not p.casa and not exists (select 1 from public.marcas_dos_perfis mp where mp.perfil_id = p.id)",
      );
      expect(semMarca!.n).toBe(0);
      const linhas = await db.query<{ perfil_id: string; marca: string }>(
        "select mp.perfil_id, m.nome as marca from public.marcas_dos_perfis mp join public.marcas m on m.id = mp.marca_id",
      );
      expect(linhas.filter((l) => l.perfil_id === daOutra)).toEqual([{ perfil_id: daOutra, marca: "Outra Empresa" }]);
      expect(linhas.filter((l) => l.perfil_id === casa)).toEqual([]);
      const [perfis] = await db.query<{ n: number }>("select count(*)::int as n from public.perfis where not casa");
      expect(linhas).toHaveLength(perfis!.n);
    } finally {
      await pg.close();
    }
  });

  it("para com a lista quando o mesmo LinkedIn já está em dois perfis, sem contar a casa", async () => {
    const { pg, db, sql } = await bancoAntesDaMigration();
    try {
      const organizacao = await criarOrganizacao(db);
      const a = await criarPerfilNaOrganizacao(db, { organizacaoId: organizacao, slug: "a" });
      const casa = await criarPerfilNaOrganizacao(db, { organizacaoId: organizacao, slug: "casa" });
      await db.query("update public.perfis set linkedin_provider_id = 'ACoX' where id = any($1::uuid[])", [[a, casa]]);
      await db.query("update public.perfis set casa = true where id = $1::uuid", [casa]);
      await pg.exec(sql);

      await db.query("drop index public.perfis_um_linkedin");
      const b = await criarPerfilNaOrganizacao(db, { organizacaoId: organizacao, slug: "b" });
      await db.query("update public.perfis set linkedin_provider_id = 'ACoX' where id = $1::uuid", [b]);
      await expect(pg.exec(sql)).rejects.toThrow(/O mesmo LinkedIn está em mais de um perfil: ACoX \(2 perfis\)/);
    } finally {
      await pg.close();
    }
  });

  it("para antes de mexer numa tabela marcas_dos_perfis que não é do Kakou", async () => {
    const { pg, sql } = await bancoAntesDaMigration();
    try {
      await pg.exec("create table public.marcas_dos_perfis (id integer primary key)");
      await expect(pg.exec(sql)).rejects.toThrow(/public.marcas_dos_perfis já existe e não é do Kakou/);
    } finally {
      await pg.close();
    }
  });
});

describe("marcas_dos_perfis: contas por marca (SDR-108, §4.30, D36)", () => {
  let banco: BancoDeTeste;
  let f: DuasMarcas;

  const marcasDe = async (perfilId: string) =>
    (
      await banco.db.query<{ marca_id: string }>("select marca_id from public.marcas_dos_perfis where perfil_id = $1::uuid order by marca_id", [
        perfilId,
      ])
    ).map((l) => l.marca_id);
  const comoOperador = <T>(operadorId: string, fn: (tx: Db) => Promise<T>) => comOperador(banco.db, operadorId, fn);
  const novaCampanha = async (perfilId: string, marcaId: string) => {
    const [campanha] = await banco.db.query<{ id: string }>(
      `insert into public.campanhas (perfil_id, nome, angulo, sequencia, pos_t4, status, marca_id)
       values ($1::uuid, $2, 'Margem invisível', $3::jsonb, 'conexao', 'ativa', $4::uuid) returning id`,
      [perfilId, `Campanha ${randomUUID().slice(0, 8)}`, JSON.stringify(SEQUENCIA_PADRAO), marcaId],
    );
    return campanha!.id;
  };

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    f = await criarDuasMarcas(banco.db);
    // O perfil da fixture é do operador da A: é ele quem liga e tira.
    await banco.db.query("update public.perfis set operador_id = $2::uuid, unipile_account_id = 'acc-p' where id = $1::uuid", [f.perfilId, f.operadorA]);
  });

  describe("a trigger perfis_na_marca", () => {
    it("a conta nova de Configurações entra na marca atual de quem vincula", async () => {
      await banco.db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [f.admin, f.marcaB]);
      const perfilId = await contaNovaDoLinkedin(banco.db, { organizacaoId: f.organizacaoId, operadorId: f.admin, nome: "Admin", agora: AGORA });
      expect(await marcasDe(perfilId)).toEqual([f.marcaB]);
    });

    it("pelo operador logado, entra na marca atual dele", async () => {
      await banco.db.query("update public.operadores set marca_atual_id = $2::uuid where id = $1::uuid", [f.admin, f.marcaB]);
      const [perfil] = await comoOperador(f.admin, (tx) =>
        tx.query<{ id: string }>(
          `insert into public.perfis (slug, nome, praca, fuso, idioma, rampa, teto_convites_semana, motivo_pausa, organizacao_id)
           values ('pelo-painel', 'Pelo painel', 'domestico', 'America/Sao_Paulo', 'pt', '[]', 100, 'Aguardando', $1::uuid) returning id`,
          [f.organizacaoId],
        ),
      );
      expect(await marcasDe(perfil!.id)).toEqual([f.marcaB]);
    });

    it("o primeiro acesso de uma organização de uma marca liga a conta à marca 1", async () => {
      const organizacaoId = await criarOrganizacao(banco.db, { nome: "Loja" });
      const operadorId = await criarOperador(banco.db, { organizacaoId, papel: "admin" });
      const { perfilId } = await perfilDoPrimeiroAcesso(banco.db, { organizacaoId, operadorId, nome: "Ana", idioma: "pt", agora: AGORA });
      const [marca1] = await banco.db.query<{ id: string }>("select id from public.marcas where organizacao_id = $1::uuid", [organizacaoId]);
      expect(await marcasDe(perfilId)).toEqual([marca1!.id]);
    });

    it("a casa nunca entra numa marca, nem inserida nem virando casa depois", async () => {
      const guessless = await idDaOrganizacaoGuessless(banco.db);
      const [casa] = await banco.db.query<{ id: string }>(
        `insert into public.perfis (slug, nome, praca, fuso, idioma, rampa, teto_convites_semana, motivo_pausa, organizacao_id, casa)
         values ('casa-nova', 'Casa', 'domestico', 'America/Sao_Paulo', 'pt', '[]', 100, 'Casa', $1::uuid, true) returning id`,
        [guessless],
      );
      expect(await marcasDe(casa!.id)).toEqual([]);

      const virou = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: guessless, slug: "vira-casa" });
      expect(await marcasDe(virou)).toHaveLength(1);
      await banco.db.query("update public.perfis set casa = true where id = $1::uuid", [virou]);
      expect(await marcasDe(virou)).toEqual([]);
    });
  });

  it("o índice perfis_um_linkedin impede dois perfis com o mesmo LinkedIn, fora a casa", async () => {
    const outro = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: f.organizacaoId, slug: "outro" });
    await banco.db.query("update public.perfis set linkedin_provider_id = 'ACoX' where id = $1::uuid", [f.perfilId]);
    await expect(banco.db.query("update public.perfis set linkedin_provider_id = 'ACoX' where id = $1::uuid", [outro])).rejects.toThrow(
      /perfis_um_linkedin/,
    );
    await banco.db.query("update public.perfis set casa = true, linkedin_provider_id = 'ACoX' where id = $1::uuid", [outro]);
  });

  describe("RLS", () => {
    it("o operador sem acesso à B não lê as linhas da B; o admin lê as duas", async () => {
      await banco.db.query("insert into public.marcas_dos_perfis (perfil_id, marca_id) values ($1::uuid, $2::uuid)", [f.perfilId, f.marcaB]);
      const doOperador = await comoOperador(f.operadorA, (tx) => tx.query<{ marca_id: string }>("select marca_id from public.marcas_dos_perfis"));
      expect(doOperador).toEqual([{ marca_id: f.marcaA }]);
      const doAdmin = await comoOperador(f.admin, (tx) =>
        tx.query<{ marca_id: string }>("select marca_id from public.marcas_dos_perfis where perfil_id = $1::uuid", [f.perfilId]),
      );
      expect(doAdmin).toHaveLength(2);
    });

    it("quem não é admin nem vinculou a conta não liga nem tira", async () => {
      const outroOperador = await criarOperador(banco.db, { organizacaoId: f.organizacaoId, perfilIds: [f.perfilId] });
      await banco.db.query("insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid), ($1::uuid, $3::uuid)", [
        outroOperador,
        f.marcaA,
        f.marcaB,
      ]);
      await expect(
        comoOperador(outroOperador, (tx) =>
          tx.query("insert into public.marcas_dos_perfis (perfil_id, marca_id) values ($1::uuid, $2::uuid)", [f.perfilId, f.marcaB]),
        ),
      ).rejects.toThrow();
      expect(
        await comoOperador(outroOperador, (tx) =>
          ligarPerfilAMarca(tx, { perfilId: f.perfilId, marcaId: f.marcaB, operadorId: outroOperador, agora: AGORA }),
        ),
      ).toEqual({ ok: false, erro: "Só o admin ou quem vinculou a conta muda as marcas dela." });
      expect(await marcasDe(f.perfilId)).toEqual([f.marcaA]);
    });
  });

  describe("ligarPerfilAMarca", () => {
    it("liga a conta à marca, grava o evento, e ligar de novo não muda nada", async () => {
      const ligar = () =>
        comoOperador(f.admin, (tx) => ligarPerfilAMarca(tx, { perfilId: f.perfilId, marcaId: f.marcaB, operadorId: f.admin, agora: AGORA }));
      expect(await ligar()).toEqual({ ok: true });
      expect(await ligar()).toEqual({ ok: true });
      expect((await marcasDe(f.perfilId)).sort()).toEqual([f.marcaA, f.marcaB].sort());
      const eventos = await banco.db.query("select perfil_id, payload, ator from public.eventos where tipo = 'conta_ligada_a_marca'");
      expect(eventos).toEqual([{ perfil_id: f.perfilId, payload: { marca_id: f.marcaB, origem: "usar_conectada" }, ator: f.admin }]);
    });

    it("recusa marca que o operador não vê", async () => {
      expect(
        await comoOperador(f.operadorA, (tx) =>
          ligarPerfilAMarca(tx, { perfilId: f.perfilId, marcaId: f.marcaB, operadorId: f.operadorA, agora: AGORA }),
        ),
      ).toEqual({ ok: false, erro: "Você não tem acesso a essa marca." });
    });
  });

  describe("desligarPerfilDaMarca", () => {
    beforeEach(async () => {
      // A marca da campanha chega com o SDR-107 (#97); aqui a coluna faz o papel dela.
      await banco.db.query("alter table public.campanhas add column if not exists marca_id uuid references public.marcas (id)");
      await banco.db.query("insert into public.marcas_dos_perfis (perfil_id, marca_id) values ($1::uuid, $2::uuid)", [f.perfilId, f.marcaB]);
    });

    it("tirar da B pausa só a campanha ativa da B, com o motivo; tirar da A em seguida é a última marca", async () => {
      const ca = await novaCampanha(f.perfilId, f.marcaA);
      const cb = await novaCampanha(f.perfilId, f.marcaB);
      const tirar = (marcaId: string) =>
        comoOperador(f.admin, (tx) => desligarPerfilDaMarca(tx, { perfilId: f.perfilId, marcaId, operadorId: f.admin, agora: AGORA }));

      expect(await tirar(f.marcaB)).toEqual({ ok: true, campanhasPausadas: 1 });
      const status = await banco.db.query<{ id: string; status: string }>("select id, status from public.campanhas where id = any($1::uuid[])", [
        [ca, cb],
      ]);
      expect(Object.fromEntries(status.map((c) => [c.id, c.status]))).toEqual({ [ca]: "ativa", [cb]: "pausada" });
      expect(await marcasDe(f.perfilId)).toEqual([f.marcaA]);
      const eventos = await banco.db.query<{ tipo: string; entidade_id: string; payload: unknown }>(
        "select tipo, entidade_id, payload from public.eventos where tipo in ('campanha_status', 'conta_tirada_da_marca') order by id",
      );
      expect(eventos).toEqual([
        { tipo: "campanha_status", entidade_id: cb, payload: { de: "ativa", para: "pausada", motivo: "Conta tirada da marca" } },
        { tipo: "conta_tirada_da_marca", entidade_id: f.perfilId, payload: { marca_id: f.marcaB, campanhas_pausadas: 1 } },
      ]);

      expect(await tirar(f.marcaA)).toEqual({ ok: false, erro: ERRO_DA_ULTIMA_MARCA });
      expect(await marcasDe(f.perfilId)).toEqual([f.marcaA]);
    });

    it("religar não retoma a campanha pausada", async () => {
      const cb = await novaCampanha(f.perfilId, f.marcaB);
      const pedido = { perfilId: f.perfilId, marcaId: f.marcaB, operadorId: f.operadorA, agora: AGORA };
      await banco.db.query("insert into public.acessos_das_marcas (operador_id, marca_id) values ($1::uuid, $2::uuid)", [f.operadorA, f.marcaB]);
      expect(await comoOperador(f.operadorA, (tx) => desligarPerfilDaMarca(tx, pedido))).toEqual({ ok: true, campanhasPausadas: 1 });
      expect(await comoOperador(f.operadorA, (tx) => ligarPerfilAMarca(tx, pedido))).toEqual({ ok: true });
      const [campanha] = await banco.db.query<{ status: string }>("select status from public.campanhas where id = $1::uuid", [cb]);
      expect(campanha!.status).toBe("pausada");
    });

    it("conta como última marca também a que o operador não vê", async () => {
      // O operador só da A vê uma marca da conta, mas ela está em duas: tirar da A pode.
      expect(
        await comoOperador(f.operadorA, (tx) =>
          desligarPerfilDaMarca(tx, { perfilId: f.perfilId, marcaId: f.marcaA, operadorId: f.operadorA, agora: AGORA }),
        ),
      ).toEqual({ ok: true, campanhasPausadas: 0 });
      expect(await marcasDe(f.perfilId)).toEqual([f.marcaB]);
    });
  });

  describe("perfisDaMarca e contasParaLigar", () => {
    beforeEach(async () => {
      await banco.db.query("insert into public.marcas_dos_perfis (perfil_id, marca_id) values ($1::uuid, $2::uuid)", [f.perfilId, f.marcaB]);
    });

    it("para o operador só da A, a outra marca da conta é só um número; o admin vê o nome", async () => {
      expect(await comoOperador(f.operadorA, (tx) => perfisDaMarca(tx, f.marcaA))).toEqual([
        { perfilId: f.perfilId, nome: expect.any(String), outrasMarcas: { visiveis: [], ocultas: 1 } },
      ]);
      expect(await comoOperador(f.operadorA, (tx) => perfisDaMarca(tx, f.marcaB))).toEqual([]);
      expect(await comoOperador(f.admin, (tx) => perfisDaMarca(tx, f.marcaA))).toEqual([
        { perfilId: f.perfilId, nome: expect.any(String), outrasMarcas: { visiveis: ["Beta"], ocultas: 0 } },
      ]);
    });

    it("contasParaLigar traz só as contas conectadas que o operador vê e que não estão na marca", async () => {
      const deOutro = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: f.organizacaoId, slug: "de-outro" });
      const meuNaB = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: f.organizacaoId, slug: "meu-na-b" });
      await banco.db.query("update public.perfis set unipile_account_id = 'acc-' || slug where id = any($1::uuid[])", [[deOutro, meuNaB]]);
      await banco.db.query("insert into public.marcas_dos_perfis (perfil_id, marca_id) values ($1::uuid, $3::uuid), ($2::uuid, $3::uuid)", [
        deOutro,
        meuNaB,
        f.marcaB,
      ]);
      await banco.db.query("update public.perfis set operador_id = $2::uuid where id = $1::uuid", [meuNaB, f.operadorA]);
      await banco.db.query("insert into public.operador_perfis (operador_id, perfil_id) values ($1::uuid, $2::uuid)", [f.operadorA, meuNaB]);

      // `deOutro` o operador da A não pode ver (pode_ver_perfil falso); `meuNaB` ele vê, mas não a B.
      expect(await comoOperador(f.operadorA, (tx) => contasParaLigar(tx, f.marcaA))).toEqual([
        { perfilId: meuNaB, nome: "meu-na-b", status: "pausado", marcas: [], ocultas: 1, podeLigar: true },
      ]);
      const doAdmin = await comoOperador(f.admin, (tx) => contasParaLigar(tx, f.marcaA));
      expect(doAdmin.map((c) => [c.nome, c.marcas])).toEqual([
        ["de-outro", ["Beta"]],
        ["meu-na-b", ["Beta"]],
      ]);
    });

    it("soDaMarca filtra as contas pela marca, pela conexão do sistema", async () => {
      const fora = await criarPerfilNaOrganizacao(banco.db, { organizacaoId: f.organizacaoId, slug: "fora" });
      expect(await soDaMarca(banco.db, f.marcaB, [{ id: f.perfilId }, { id: fora }])).toEqual([{ id: f.perfilId }]);
    });
  });
});
