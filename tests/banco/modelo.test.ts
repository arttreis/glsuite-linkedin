import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { aplicarMigrations, criarBancoDeTeste, criarDbPglite, type BancoDeTeste } from "../support/banco";
import { criarCampanha, criarLead, criarPessoa, idDoPerfil } from "../support/fixtures";

const BOOTSTRAP = readFileSync(path.resolve(import.meta.dirname, "../sql/supabase-bootstrap.sql"), "utf8");

async function codigoDoErro(promessa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promessa;
    return undefined;
  } catch (erro) {
    return (erro as { code?: string }).code;
  }
}

describe("migrations", () => {
  it("são idempotentes: aplicar duas vezes não falha nem duplica o seed", async () => {
    const pg = await PGlite.create();
    await pg.exec(BOOTSTRAP);
    await aplicarMigrations(pg);
    await aplicarMigrations(pg);
    const db = criarDbPglite(pg);

    const [contagem] = await db.query<Record<string, number>>(`
      select
        (select count(*) from public.perfis)::int as perfis,
        (select count(*) from public.angulos)::int as angulos,
        (select count(*) from public.configuracoes)::int as configuracoes,
        (select count(*) from pg_policies where schemaname = 'public')::int as politicas`);
    expect(contagem).toMatchObject({ perfis: 4, angulos: 6, configuracoes: 14 });
    expect(contagem!.politicas).toBeGreaterThan(20);
    await pg.close();
  });
});

describe("modelo de dados", () => {
  let banco: BancoDeTeste;
  beforeEach(async () => {
    banco = await criarBancoDeTeste();
  });

  it("provider_id é único em pessoas", async () => {
    await criarPessoa(banco.db, { providerId: "ACo123" });
    expect(await codigoDoErro(criarPessoa(banco.db, { providerId: "ACo123", dono: "juliano" }))).toBe("23505");
  });

  it("idempotency_key é único em acoes", async () => {
    const campanhaId = await criarCampanha(banco.db);
    const leadId = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId, estado: "na_fila" });
    const inserir = () =>
      banco.db.query(
        `insert into public.acoes (lead_id, perfil_id, tipo, toque, origem, agendada_para, idempotency_key)
         select id, perfil_id, 'convite', 'T1', 'template', now(), 'lead-x:T1' from public.leads where id = $1::uuid`,
        [leadId],
      );
    await inserir();
    expect(await codigoDoErro(inserir())).toBe("23505");
  });

  it("guarda URL, fonte e data da coleta de toda pessoa", async () => {
    const semFonte = banco.db.query(
      `insert into public.pessoas (provider_id, url_publica, nome, coletado_em, dono_perfil_id)
       values ('ACoX', 'https://linkedin.com/in/x', 'X', now(), $1::uuid)`,
      [await idDoPerfil(banco.db, "arthur")],
    );
    expect(await codigoDoErro(semFonte)).toBe("23502");
  });

  it("não deixa lead sair da triagem sem ângulo", async () => {
    const campanhaId = await criarCampanha(banco.db);
    const leadId = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId });
    await banco.db.query("update public.leads set angulo = null where id = $1::uuid", [leadId]);
    const promover = banco.db.query("update public.leads set estado = 'na_fila' where id = $1::uuid", [leadId]);
    expect(await codigoDoErro(promover)).toBe("23514");
  });

  it("mantém uma pessoa numa régua ativa por vez", async () => {
    const pessoaId = await criarPessoa(banco.db);
    await criarLead(banco.db, { pessoaId, campanhaId: await criarCampanha(banco.db), estado: "em_sequencia" });
    const segunda = criarLead(banco.db, { pessoaId, campanhaId: await criarCampanha(banco.db), estado: "na_fila" });
    expect(await codigoDoErro(segunda)).toBe("23505");
  });

  it("não ativa perfil sem conta conectada e data de ativação", async () => {
    const ativar = banco.db.query(
      "update public.perfis set status = 'ativo', motivo_pausa = null where slug = 'arthur'",
    );
    expect(await codigoDoErro(ativar)).toBe("23514");
  });

  it("não deixa perfil pausado sem motivo", async () => {
    const semMotivo = banco.db.query("update public.perfis set motivo_pausa = null where slug = 'jp'");
    expect(await codigoDoErro(semMotivo)).toBe("23514");
  });
});

describe("seed", () => {
  let banco: BancoDeTeste;
  beforeEach(async () => {
    banco = await criarBancoDeTeste();
  });

  it("cria os 4 perfis pausados com a configuração da §4.3", async () => {
    const perfis = await banco.db.query<{
      slug: string;
      praca: string;
      fuso: string;
      idioma: string;
      status: string;
      teto_convites_semana: number;
      modo_resposta: string;
      convites: number[];
      dms: number[];
    }>(`
      select slug, praca, fuso, idioma, status, teto_convites_semana, modo_resposta,
             array(select (r ->> 'convites_dia')::int from jsonb_array_elements(rampa) r order by (r ->> 'semana')::int) as convites,
             array(select (r ->> 'dms_dia')::int from jsonb_array_elements(rampa) r order by (r ->> 'semana')::int) as dms
        from public.perfis order by slug`);

    expect(perfis).toEqual([
      { slug: "arthur", praca: "domestico", fuso: "America/Sao_Paulo", idioma: "pt", status: "pausado",
        teto_convites_semana: 75, modo_resposta: "aprovacao", convites: [8, 12, 15], dms: [15, 20, 25] },
      { slug: "jp", praca: "espanha", fuso: "Europe/Madrid", idioma: "es", status: "pausado",
        teto_convites_semana: 30, modo_resposta: "manual", convites: [4, 5, 6], dms: [0, 0, 0] },
      { slug: "juliano", praca: "domestico", fuso: "America/Sao_Paulo", idioma: "pt", status: "pausado",
        teto_convites_semana: 100, modo_resposta: "aprovacao", convites: [8, 12, 15], dms: [15, 20, 25] },
      { slug: "luiz", praca: "canada", fuso: "America/Toronto", idioma: "en", status: "pausado",
        teto_convites_semana: 50, modo_resposta: "aprovacao", convites: [6, 8, 10], dms: [11, 13, 16] },
    ]);
  });

  it("exige o descadastro no perfil do Canadá", async () => {
    const [luiz] = await banco.db.query<{ rodape_obrigatorio: string }>(
      "select rodape_obrigatorio from public.perfis where slug = 'luiz'",
    );
    expect(luiz!.rodape_obrigatorio).toBe("or tell me to stop and I will");
  });

  it("tem os feriados do ano corrente de BR, ON e ES", async () => {
    const porPraca = await banco.db.query<{ praca: string; total: number; natal: boolean }>(`
      select praca, count(*)::int as total, bool_or(data = '2026-12-25') as natal
        from public.feriados where extract(year from data) = 2026
       group by praca order by praca`);
    expect(porPraca.map((linha) => linha.praca)).toEqual(["canada", "domestico", "espanha"]);
    for (const linha of porPraca) {
      expect(linha.total).toBeGreaterThanOrEqual(10);
      expect(linha.natal).toBe(true);
    }
  });
});
