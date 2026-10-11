import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { linhaDoTempo } from "@/domain/linha-do-tempo";
import { mudarStatusDaCampanha } from "@/server/campanhas/campanhas";
import { LIMITE_DAS_INSTRUCOES, listarCampanhas, obterCampanha, salvarInstrucoesDoSdr, salvarTextosDaCampanha } from "@/server/campanhas/painel";
import { comOperador } from "@/server/db/operador";
import { fluxoDaCampanha } from "@/server/fluxo/fluxos";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import {
  ativarPerfil,
  criarCampanha,
  criarLead,
  criarOperador,
  criarOrganizacao,
  criarPessoa,
  criarPublico,
} from "../support/fixtures";

const AGORA = new Date("2026-10-12T15:00:00Z");

describe("Campanhas (SDR-50)", () => {
  let banco: BancoDeTeste;
  let duda: string;
  let juliano: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    juliano = await ativarPerfil(banco.db, "juliano");
    duda = await criarOperador(banco.db, { nome: "Duda", perfis: ["juliano"] });
  });

  const comoDuda = <T,>(fn: (tx: typeof banco.db) => Promise<T>) => comOperador(banco.db, duda, fn);

  async function campanhaDePublico() {
    const publico = await criarPublico(banco.db, { nome: "Multimarcas do Sul" });
    const resultado = await comoDuda((tx) => comecarAAbordar(tx, { publicoId: publico, perfilId: juliano, operadorId: duda, agora: AGORA }));
    if (!resultado.ok) throw new Error(resultado.erro);
    return resultado.campanhaId;
  }

  it("a lista mostra o público, a conta, o status e os números de cada campanha", async () => {
    const campanha = await campanhaDePublico();
    const pessoa = await criarPessoa(banco.db, { dono: "juliano" });
    await criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha, estado: "na_fila" });

    const [linha] = await comoDuda((tx) => listarCampanhas(tx));
    expect(linha).toMatchObject({ id: campanha, publico: "Multimarcas do Sul", conta: "Juliano", status: "rascunho", naFila: 1, triagem: 0 });

    const deFora = await criarOperador(banco.db, { organizacaoId: await criarOrganizacao(banco.db) });
    expect(await comOperador(banco.db, deFora, (tx) => listarCampanhas(tx))).toEqual([]);
  });

  it("campanha nova nasce em rascunho, sem permissão; ativar é a permissão e grava quem e quando", async () => {
    const campanha = await campanhaDePublico();
    expect(await comoDuda((tx) => obterCampanha(tx, campanha))).toMatchObject({ status: "rascunho", permitidaEm: null });

    await comoDuda((tx) =>
      salvarTextosDaCampanha(tx, {
        campanhaId: campanha,
        textos: { T1: "Oi {{first_name}}, acompanho multimarcas.", T2: "Obrigado por aceitar.", T3: "Como a {{company}} compra hoje?", T4: "Fico por aqui." },
        operadorId: duda,
        agora: AGORA,
      }),
    );
    await mudarStatusDaCampanha(banco.db, { campanhaId: campanha, status: "ativa", operadorId: duda, agora: AGORA });
    expect(await comoDuda((tx) => obterCampanha(tx, campanha))).toMatchObject({ status: "ativa", permitidaEm: AGORA, permitidaPor: "Duda" });
  });

  it("texto da linha do tempo passa pelo validador antes de gravar", async () => {
    const campanha = await campanhaDePublico();
    const resultado = await comoDuda((tx) =>
      salvarTextosDaCampanha(tx, { campanhaId: campanha, textos: { T2: "Obrigado por aceitar — vamos?" }, operadorId: duda, agora: AGORA }),
    );
    expect(resultado).toMatchObject({ ok: false, problemas: [expect.objectContaining({ toque: "T2" })] });
  });

  it("com lead andando no fluxo, os textos novos viram uma versão nova e o lead fica na dele", async () => {
    const campanha = await criarCampanha(banco.db, { perfil: "juliano" });
    const salvar = (texto: string) =>
      comoDuda((tx) => salvarTextosDaCampanha(tx, { campanhaId: campanha, textos: { T3: texto }, operadorId: duda, agora: AGORA }));

    expect(await salvar("Como a {{company}} compra hoje?")).toEqual({ ok: true });
    const [antes] = await banco.db.query<{ fluxo_id: string }>("select fluxo_id from public.campanhas where id = $1::uuid", [campanha]);
    const pessoa = await criarPessoa(banco.db, { dono: "juliano", providerId: `ACo${randomUUID().replaceAll("-", "")}` });
    const lead = await criarLead(banco.db, { pessoaId: pessoa, campanhaId: campanha, estado: "em_sequencia" });
    await banco.db.query("update public.leads set fluxo_id = $2::uuid where id = $1::uuid", [lead, antes!.fluxo_id]);

    expect(await salvar("E na {{company}}, quem decide a compra?")).toEqual({ ok: true });
    const [depois] = await banco.db.query<{ fluxo_id: string }>("select fluxo_id from public.campanhas where id = $1::uuid", [campanha]);
    expect(depois!.fluxo_id).not.toBe(antes!.fluxo_id);
    const [doLead] = await banco.db.query<{ fluxo_id: string }>("select fluxo_id from public.leads where id = $1::uuid", [lead]);
    expect(doLead!.fluxo_id).toBe(antes!.fluxo_id);
    const atual = linhaDoTempo((await fluxoDaCampanha(banco.db, campanha))!);
    expect(atual.passos.find((p) => p.nodeId === "T3")!.texto).toBe("E na {{company}}, quem decide a compra?");
  });

  it("as instruções do SDR valem até o limite e vazio apaga", async () => {
    const campanha = await campanhaDePublico();
    const salvar = (texto: string) => comoDuda((tx) => salvarInstrucoesDoSdr(tx, { campanhaId: campanha, texto, operadorId: duda, agora: AGORA }));

    expect(await salvar("  Fale do evento de novembro.  ")).toEqual({ ok: true });
    expect((await comoDuda((tx) => obterCampanha(tx, campanha)))!.instrucoesSdr).toBe("Fale do evento de novembro.");
    expect(await salvar("x".repeat(LIMITE_DAS_INSTRUCOES + 1))).toMatchObject({ ok: false });
    expect(await salvar("   ")).toEqual({ ok: true });
    expect((await comoDuda((tx) => obterCampanha(tx, campanha)))!.instrucoesSdr).toBeNull();
  });
});
