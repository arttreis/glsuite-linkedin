import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { ErroDoModelo } from "@/server/agente/modelo";
import { aprovarAcao } from "@/server/aprovacao/aprovar";
import { listarFila, taxaDeEdicao } from "@/server/aprovacao/fila";
import { despachar } from "@/server/despachante/despachante";
import { calcularFunil } from "@/server/metricas/funil";
import { processarPesquisasPendentes } from "@/server/pesquisa/pesquisa";
import { sortearVariante } from "@/server/pesquisa/variante";
import { registrarAceite } from "@/server/reacoes/aceite";
import { aprovarLeads } from "@/server/triagem/triagem";
import type { PerfilLinkedIn } from "@/server/unipile/cliente";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP, simular } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa } from "../support/fixtures";
import { ModeloFalso } from "../support/modelo-falso";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = instanteLocal("2026-10-07", "10:00", SP);
const COM_TRAVESSAO = "Oi Maria — vi seu post sobre margem por canal. Bora conectar?";

const perfilDoProspect = (providerId: string, nome: string): PerfilLinkedIn => ({
  providerId,
  publicIdentifier: providerId.toLowerCase(),
  primeiroNome: nome.split(" ")[0]!,
  sobrenome: nome.split(" ").slice(1).join(" ") || null,
  titulo: "Head de E-commerce na Loja",
  localizacao: "São Paulo, Brasil",
  resumo: "Cuido do e-commerce e dos marketplaces.",
  distancia: "SECOND_DEGREE",
  ehConexao: false,
  urlPublica: `https://www.linkedin.com/in/${providerId}`,
  experiencia: [{ empresa: "Loja", empresaId: null, cargo: "Head de E-commerce", atual: true }],
});

describe("sorteio do A/B do T1", () => {
  const ids = Array.from({ length: 4000 }, () => randomUUID());

  it("é estável por lead e segue a proporção configurada", () => {
    expect(ids.map((id) => sortearVariante(id, 0.5))).toEqual(ids.map((id) => sortearVariante(id, 0.5)));
    const fracao = ids.filter((id) => sortearVariante(id, 0.3) === "personalizada").length / ids.length;
    expect(fracao).toBeGreaterThan(0.26);
    expect(fracao).toBeLessThan(0.34);
    expect(ids.every((id) => sortearVariante(id, 0) === "template")).toBe(true);
    expect(ids.every((id) => sortearVariante(id, 1) === "personalizada")).toBe(true);
  });

  it("subir a proporção só leva leads do template para o personalizado", () => {
    const antes = ids.filter((id) => sortearVariante(id, 0.3) === "personalizada");
    expect(antes.every((id) => sortearVariante(id, 0.6) === "personalizada")).toBe(true);
  });
});

describe("T1 personalizado (SDR-15)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let modelo: ModeloFalso;
  let operador: string;
  let sequencial = 0;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    modelo = new ModeloFalso();
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    operador = await criarOperador(banco.db, { nome: "Arthur", perfis: ["arthur"] });
  });

  const configurarPesquisa = (valor: { max_por_dia?: number; proporcao_personalizada?: number }) =>
    banco.db.query("update public.configuracoes set valor = valor || $1::jsonb where chave = 'pesquisa'", [JSON.stringify(valor)]);

  /** Lead aprovado na triagem, com perfil e um post recente na Unipile. */
  async function leadAprovado(campanhaId: string, nome = "Maria Souza") {
    sequencial += 1;
    const providerId = `ACoProspect${sequencial}`;
    const empresa = `Loja ${sequencial}`;
    const pessoaId = await criarPessoa(banco.db, { providerId, nome, empresa, empresaChave: empresa.toLowerCase() });
    const leadId = await criarLead(banco.db, { pessoaId, campanhaId });
    const resultado = await aprovarLeads(banco.db, { leadIds: [leadId], operadorId: operador, agora: AGORA });
    expect(resultado.aprovados).toEqual([leadId]);
    unipile.perfis.set(providerId, perfilDoProspect(providerId, nome));
    unipile.posts.set(providerId, [
      { id: `post-${sequencial}`, texto: "Margem por canal é o número que ninguém olha no varejo.", data: "2026-10-01" },
    ]);
    return { leadId, providerId };
  }

  type AcaoT1 = {
    id: string;
    origem: string;
    status: string;
    texto_gerado: string | null;
    motivo_revisao: string | null;
    validacao: { ok: boolean } | null;
    tentativas: number;
  };
  const t1 = async (leadId: string) =>
    (await banco.db.query<AcaoT1>(
      `select id, origem, status, texto_gerado, motivo_revisao, validacao, tentativas
         from public.acoes where lead_id = $1::uuid and toque = 'T1'`,
      [leadId],
    ))[0]!;
  const pesquisar = async (agora = AGORA) =>
    (await processarPesquisasPendentes({ db: banco.db, unipile, modelo, agora })).map((r) => r.resultado);
  const aprovar = (acaoId: string, textoEditado?: string) =>
    aprovarAcao({ db: banco.db, unipile, agora: AGORA }, { acaoId, operadorId: operador, textoEditado });
  const variante = async (leadId: string) =>
    (await banco.db.query<{ variante_copy: string }>("select variante_copy from public.leads where id = $1::uuid", [leadId]))[0]!
      .variante_copy;

  it("na aprovação da triagem, a campanha personalizada sorteia o braço e a de template fica no template", async () => {
    const personalizada = await criarCampanha(banco.db, { modoCopy: "personalizada" });
    const template = await criarCampanha(banco.db);

    const sorteados = [];
    for (let i = 0; i < 6; i += 1) sorteados.push((await leadAprovado(personalizada, `Pessoa ${i} Teste`)).leadId);
    for (const leadId of sorteados) {
      const braco = sortearVariante(leadId, 0.5);
      expect(await variante(leadId)).toBe(braco);
      expect(await t1(leadId)).toMatchObject({
        origem: braco === "personalizada" ? "ia" : "template",
        status: "pendente",
        texto_gerado: null,
      });
    }

    const { leadId } = await leadAprovado(template);
    expect(await variante(leadId)).toBe("template");
    expect((await t1(leadId)).origem).toBe("template");
  });

  it("pesquisa o prospect, escreve o T1 que passa no validador e manda para a fila; só sai depois de aprovado", async () => {
    await configurarPesquisa({ proporcao_personalizada: 1 });
    const campanha = await criarCampanha(banco.db, { modoCopy: "personalizada", angulo: "Margem invisível" });
    const { leadId, providerId } = await leadAprovado(campanha);

    // Sem texto, o despachante não manda o convite.
    await despachar({ db: banco.db, unipile, agora: AGORA, aleatorio: () => 0.5 });
    expect(unipile.chamadasDe("enviarConvite")).toHaveLength(0);

    expect(await pesquisar()).toEqual(["na_fila"]);
    expect(unipile.chamadasDe("obterPerfil")).toEqual([{ accountId: "acc-arthur", identificador: providerId, completo: true }]);
    expect(unipile.chamadasDe("listarPosts")).toEqual([{ accountId: "acc-arthur", providerId, limite: 5 }]);

    const [chamada] = modelo.chamadas;
    expect(chamada!.etapa).toBe("escreverConvite");
    expect(chamada!.sistema).toContain('"Margem invisível"');
    expect(chamada!.sistema).toContain("Oi {{first_name}}, tudo bem?");
    expect(chamada!.sistema).not.toContain("Maria");
    expect(chamada!.entrada).toContain("Margem por canal é o número que ninguém olha no varejo.");

    const acao = await t1(leadId);
    expect(acao).toMatchObject({
      status: "aguardando_aprovacao",
      origem: "ia",
      texto_gerado: modelo.conviteParaTeste.nota,
      motivo_revisao: null,
      validacao: { ok: true, violacoes: [] },
    });
    const [lead] = await banco.db.query<{ pesquisa: { titulo: string; posts: unknown[] } }>(
      "select pesquisa from public.leads where id = $1::uuid",
      [leadId],
    );
    expect(lead!.pesquisa).toMatchObject({ titulo: "Head de E-commerce na Loja", posts: [expect.any(Object)] });

    const [item] = await listarFila(banco.db);
    expect(item).toMatchObject({ acaoId: acao.id, toque: "T1", origem: "ia", gancho: modelo.conviteParaTeste.gancho, confianca: 0.85 });

    await despachar({ db: banco.db, unipile, agora: new Date(AGORA.getTime() + 30 * 60_000), aleatorio: () => 0.5 });
    expect(unipile.chamadasDe("enviarConvite")).toHaveLength(0);

    expect(await aprovar(acao.id)).toEqual({ ok: true, enviada: false });
    await despachar({ db: banco.db, unipile, agora: new Date(AGORA.getTime() + 60 * 60_000), aleatorio: () => 0.5 });
    expect(unipile.chamadasDe("enviarConvite")).toEqual([
      { accountId: "acc-arthur", providerId, mensagem: modelo.conviteParaTeste.nota },
    ]);
  });

  it("nota barrada pelo validador ganha uma reescrita com os problemas apontados", async () => {
    await configurarPesquisa({ proporcao_personalizada: 1 });
    const { leadId } = await leadAprovado(await criarCampanha(banco.db, { modoCopy: "personalizada" }));
    modelo.convites.push({ ...modelo.conviteParaTeste, nota: COM_TRAVESSAO });

    expect(await pesquisar()).toEqual(["na_fila"]);
    expect(modelo.chamadas.map((c) => c.etapa)).toEqual(["escreverConvite", "escreverConvite"]);
    expect(modelo.chamadas[1]!.entrada).toContain("barrada pelo validador");
    expect(modelo.chamadas[1]!.entrada).toContain(COM_TRAVESSAO);
    expect(modelo.chamadas[1]!.entrada).toContain("travessão");
    expect(await t1(leadId)).toMatchObject({
      status: "aguardando_aprovacao",
      texto_gerado: modelo.conviteParaTeste.nota,
      motivo_revisao: null,
    });
  });

  it("se a reescrita também é barrada, a nota vai para a fila com o motivo e só sai corrigida", async () => {
    await configurarPesquisa({ proporcao_personalizada: 1 });
    const { leadId } = await leadAprovado(await criarCampanha(banco.db, { modoCopy: "personalizada" }));
    modelo.convites.push({ ...modelo.conviteParaTeste, nota: COM_TRAVESSAO }, { ...modelo.conviteParaTeste, nota: COM_TRAVESSAO });

    await pesquisar();
    const acao = await t1(leadId);
    expect(acao).toMatchObject({ status: "aguardando_aprovacao", texto_gerado: COM_TRAVESSAO, validacao: { ok: false } });
    expect(acao.motivo_revisao).toContain("travessão");

    expect((await aprovar(acao.id)).ok).toBe(false);
    expect(await aprovar(acao.id, "Oi Maria, vi seu post sobre margem por canal. Bora conectar?")).toEqual({ ok: true, enviada: false });

    // O gate do automático mede a conversa: o T1 editado não entra na taxa de edição.
    const [taxa] = await taxaDeEdicao(banco.db, { agora: AGORA });
    expect(taxa).toMatchObject({ perfil: "Arthur", decididas: 0 });
  });

  it("a pesquisa é visita de perfil: só na janela e até o teto diário do perfil", async () => {
    await configurarPesquisa({ proporcao_personalizada: 1, max_por_dia: 2 });
    const campanha = await criarCampanha(banco.db, { modoCopy: "personalizada" });
    for (let i = 0; i < 3; i += 1) await leadAprovado(campanha, `Pessoa ${i} Teste`);

    expect(await pesquisar(instanteLocal("2026-10-07", "20:30", SP))).toEqual(["fora_da_janela", "fora_da_janela", "fora_da_janela"]);
    expect(unipile.chamadasDe("obterPerfil")).toHaveLength(0);

    expect(await pesquisar()).toEqual(["na_fila", "na_fila", "limite_do_dia"]);
    expect(unipile.chamadasDe("obterPerfil")).toHaveLength(2);

    expect(await pesquisar(instanteLocal("2026-10-08", "09:30", SP))).toEqual(["na_fila"]);
  });

  it("falha de pesquisa tenta de novo e, na terceira, o lead volta para o template (e o A/B registra)", async () => {
    await configurarPesquisa({ proporcao_personalizada: 1 });
    const { leadId, providerId } = await leadAprovado(await criarCampanha(banco.db, { modoCopy: "personalizada" }));
    for (let i = 0; i < 3; i += 1) {
      unipile.falharProxima("obterPerfil", new ErroUnipile({ status: 503, tipo: "service_unavailable", titulo: "fora do ar" }));
    }

    expect(await pesquisar()).toEqual(["erro"]);
    expect(await t1(leadId)).toMatchObject({ origem: "ia", tentativas: 1 });
    expect(await pesquisar()).toEqual(["erro"]);
    expect(await pesquisar()).toEqual(["voltou_para_template"]);
    expect(await t1(leadId)).toMatchObject({ origem: "template", status: "pendente", tentativas: 0 });
    expect(await variante(leadId)).toBe("template");

    await despachar({ db: banco.db, unipile, agora: AGORA, aleatorio: () => 0.5 });
    expect(unipile.chamadasDe("enviarConvite")).toEqual([{ accountId: "acc-arthur", providerId, mensagem: "Oi Maria, tudo bem?" }]);
  });

  it("problema de conta não gasta tentativa, e falha do modelo reaproveita a pesquisa", async () => {
    await configurarPesquisa({ proporcao_personalizada: 1 });
    const { leadId } = await leadAprovado(await criarCampanha(banco.db, { modoCopy: "personalizada" }));

    unipile.falharProxima("obterPerfil", new ErroUnipile({ status: 401, tipo: "disconnected_account", titulo: "desconectada" }));
    expect(await pesquisar()).toEqual(["conta_indisponivel"]);
    expect(await t1(leadId)).toMatchObject({ origem: "ia", status: "pendente", tentativas: 0 });

    modelo.falhas.push(new ErroDoModelo("Resposta fora do formato."));
    expect(await pesquisar()).toEqual(["erro"]);
    expect(await pesquisar()).toEqual(["na_fila"]);
    // Uma visita só: a segunda tentativa usou a pesquisa guardada no lead.
    expect(unipile.chamadasDe("obterPerfil")).toHaveLength(2);
    const [visitas] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.eventos where tipo = 'pesquisa_feita'");
    expect(visitas!.n).toBe(1);
  });

  it("a comparação de aceite template × personalizado sai nas métricas, na mesma campanha", async () => {
    const campanha = await criarCampanha(banco.db, { nome: "Varejo SP", modoCopy: "personalizada" });
    await configurarPesquisa({ proporcao_personalizada: 1 });
    const personalizados = [await leadAprovado(campanha, "Ana Lima"), await leadAprovado(campanha, "Bia Reis")];
    await configurarPesquisa({ proporcao_personalizada: 0 });
    const templates = [await leadAprovado(campanha, "Caio Melo"), await leadAprovado(campanha, "Davi Rosa")];

    expect(await pesquisar()).toEqual(["na_fila", "na_fila"]);
    for (const item of await listarFila(banco.db)) expect(await aprovar(item.acaoId)).toEqual({ ok: true, enviada: false });
    await simular(banco.db, unipile, { de: "2026-10-07", ate: "2026-10-07" });
    const convites = unipile.chamadasDe("enviarConvite");
    expect(convites).toHaveLength(4);
    expect(convites.filter((c) => c.mensagem === modelo.conviteParaTeste.nota)).toHaveLength(2);

    // Os dois personalizados aceitam; dos templates, só um.
    for (const { providerId } of [...personalizados, templates[0]!]) {
      await registrarAceite(banco.db, {
        accountId: "acc-arthur",
        providerId,
        agora: instanteLocal("2026-10-08", "11:00", SP),
        origem: "new_relation",
      });
    }

    const linhas = (await calcularFunil(banco.db)).porVariante.map((l) => [l.campanha, l.variante, l.convites, l.aceites]);
    expect(linhas).toEqual([
      ["Varejo SP", "personalizada", 2, 2],
      ["Varejo SP", "template", 2, 1],
    ]);
  });
});
