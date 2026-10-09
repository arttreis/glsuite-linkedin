import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import { avaliarPrimeirosPassos } from "@/server/onboarding/primeiros-passos";
import { proximosPassos } from "@/server/painel/proximos";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa } from "../support/fixtures";

const AGORA = new Date("2026-10-09T13:00:00Z");

describe("primeiros passos obrigatórios (SDR-19)", () => {
  let banco: BancoDeTeste;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    operador = await criarOperador(banco.db, { perfis: ["arthur"] });
  });

  const feitos = async (id = operador) =>
    (await avaliarPrimeirosPassos(banco.db, id, AGORA)).passos.filter((p) => p.feito).map((p) => p.id);

  it("sem nada feito, todos os passos estão pendentes e o painel fica bloqueado", async () => {
    const resultado = await avaliarPrimeirosPassos(banco.db, operador, AGORA);
    expect(resultado.concluido).toBe(false);
    expect(resultado.passos.map((p) => p.id)).toEqual([
      "conectar",
      "ativar_perfil",
      "criar_campanha",
      "importar",
      "triar",
      "ativar_campanha",
    ]);
    expect(await feitos()).toEqual([]);
  });

  it("perfil que o operador não opera não conta", async () => {
    await ativarPerfil(banco.db, "juliano");
    await criarCampanha(banco.db, { perfil: "juliano", status: "ativa" });
    expect(await feitos()).toEqual([]);
  });

  it("avança passo a passo e libera com campanha ativa, perfil ativo e um lead aprovado", async () => {
    await ativarPerfil(banco.db, "arthur");
    const campanha = await criarCampanha(banco.db, { status: "rascunho" });
    const pessoa = await criarPessoa(banco.db);
    const lead = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha });
    expect(await feitos()).toEqual(["conectar", "ativar_perfil", "criar_campanha", "importar"]);

    await banco.db.query("update public.leads set estado = 'na_fila' where id = $1::uuid", [lead]);
    expect(await feitos()).toEqual(["conectar", "ativar_perfil", "criar_campanha", "importar", "triar"]);

    await banco.db.query("update public.campanhas set status = 'ativa' where id = $1::uuid", [campanha]);
    expect(await avaliarPrimeirosPassos(banco.db, operador, AGORA)).toEqual({ concluido: true, passos: [] });
  });

  it("depois de liberado, o bloqueio não volta mesmo com a campanha pausada", async () => {
    await ativarPerfil(banco.db, "arthur");
    const campanha = await criarCampanha(banco.db, { status: "ativa" });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db), campanhaId: campanha, estado: "na_fila" });
    expect((await avaliarPrimeirosPassos(banco.db, operador, AGORA)).concluido).toBe(true);

    await banco.db.query("update public.campanhas set status = 'pausada' where id = $1::uuid", [campanha]);
    expect((await avaliarPrimeirosPassos(banco.db, operador, AGORA)).concluido).toBe(true);
  });

  it("o admin vale para qualquer perfil", async () => {
    const admin = await criarOperador(banco.db, { papel: "admin" });
    await ativarPerfil(banco.db, "juliano");
    const campanha = await criarCampanha(banco.db, { perfil: "juliano", status: "ativa" });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { dono: "juliano" }), campanhaId: campanha, estado: "na_fila" });
    expect((await avaliarPrimeirosPassos(banco.db, admin, AGORA)).concluido).toBe(true);
    expect((await avaliarPrimeirosPassos(banco.db, operador, AGORA)).concluido).toBe(false);
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
