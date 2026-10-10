import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { avaliarPrimeirosPassos } from "@/server/onboarding/primeiros-passos";
import { proximosPassos } from "@/server/painel/proximos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import {
  ativarPerfil,
  criarCampanha,
  criarLead,
  criarOperador,
  criarPessoa,
  criarPublico,
  idDaOrganizacaoGuessless,
} from "../support/fixtures";

const AGORA = new Date("2026-10-09T13:00:00Z");

async function confirmarDossie(db: Db) {
  await db.query(
    `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
     values ($1::uuid, 'https://guessless.com.br/', 'pronta', '{}'::jsonb, '{}'::jsonb, now())`,
    [await idDaOrganizacaoGuessless(db)],
  );
}

/** Campanha de público na conta do Arthur, direto no banco. */
async function campanhaDoPublico(db: Db, publicoId: string, status = "rascunho") {
  const campanha = await criarCampanha(db, { perfil: "arthur", status: status as "rascunho" });
  await db.query("update public.campanhas set publico_id = $2::uuid where id = $1::uuid", [campanha, publicoId]);
  return campanha;
}

describe("primeiros passos: a jornada do Kakou (SDR-30)", () => {
  let banco: BancoDeTeste;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    operador = await criarOperador(banco.db, { perfis: ["arthur"] });
  });

  const avaliar = (id = operador) => avaliarPrimeirosPassos(banco.db, id, AGORA);
  const feitos = async (id = operador) => (await avaliar(id)).passos.filter((p) => p.feito).map((p) => p.id);

  it("organização sem dossiê confirmado cai no passo 1, e o painel fica bloqueado", async () => {
    const resultado = await avaliar();
    expect(resultado.concluido).toBe(false);
    expect(resultado.passos.map((p) => p.id)).toEqual(["dossie", "publico", "conta", "leads", "ativar"]);
    expect(resultado.passos.find((p) => !p.feito)).toMatchObject({ id: "dossie", href: "/oferta" });
  });

  it("avança pela jornada e libera com a abordagem rodando", async () => {
    await confirmarDossie(banco.db);
    expect(await feitos()).toEqual(["dossie"]);

    const publico = await criarPublico(banco.db);
    expect(await feitos()).toEqual(["dossie", "publico"]);
    // Os próximos passos levam ao público escolhido.
    expect((await avaliar()).passos.find((p) => p.id === "conta")!.href).toBe(`/publicos/${publico}?aba=leads`);

    const campanha = await campanhaDoPublico(banco.db, publico);
    expect(await feitos()).toEqual(["dossie", "publico"]);
    await ativarPerfil(banco.db, "arthur");
    expect(await feitos()).toEqual(["dossie", "publico", "conta"]);
    expect((await avaliar()).passos.find((p) => p.id === "ativar")!.href).toBe(`/campanhas/${campanha}`);

    const lead = await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });
    await banco.db.query("update public.leads set estado = 'na_fila' where id = $1::uuid", [lead]);
    expect(await feitos()).toEqual(["dossie", "publico", "conta", "leads"]);

    await banco.db.query("update public.campanhas set status = 'ativa' where id = $1::uuid", [campanha]);
    expect(await avaliar()).toEqual({ concluido: true, passos: [] });
  });

  it("depois de liberado, o bloqueio não volta mesmo com a campanha pausada", async () => {
    await ativarPerfil(banco.db, "arthur");
    const campanha = await criarCampanha(banco.db, { status: "ativa" });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha, estado: "na_fila" });
    expect((await avaliar()).concluido).toBe(true);

    await banco.db.query("update public.campanhas set status = 'pausada' where id = $1::uuid", [campanha]);
    expect((await avaliar()).concluido).toBe(true);
  });

  it("operador que já tinha campanha pronta não volta para a jornada, mesmo sem dossiê", async () => {
    await banco.db.query("update public.operadores set primeira_campanha_em = $2 where id = $1::uuid", [operador, AGORA]);
    expect(await avaliar()).toEqual({ concluido: true, passos: [] });
  });

  it("conta de outro perfil não conta para o operador; o admin vale para qualquer perfil", async () => {
    await confirmarDossie(banco.db);
    const publico = await criarPublico(banco.db);
    await ativarPerfil(banco.db, "juliano");
    const doJuliano = await criarCampanha(banco.db, { perfil: "juliano", status: "rascunho" });
    await banco.db.query("update public.campanhas set publico_id = $2::uuid where id = $1::uuid", [doJuliano, publico]);
    expect(await feitos()).toEqual(["dossie", "publico"]);

    const admin = await criarOperador(banco.db, { papel: "admin" });
    expect(await feitos(admin)).toEqual(["dossie", "publico", "conta"]);
  });

  it("depois de liberado, o Início lista o que espera alguém, só dos perfis do operador", async () => {
    await ativarPerfil(banco.db, "arthur");
    const campanha = await criarCampanha(banco.db);
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha });
    const outra = await criarCampanha(banco.db, { perfil: "juliano" });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "juliano" }), campanhaId: outra });

    const itens = await comOperador(banco.db, operador, (tx) => proximosPassos(tx, AGORA));
    expect(itens).toEqual([expect.objectContaining({ id: "triagem", quantidade: 2, href: "/triagem" })]);
  });
});
