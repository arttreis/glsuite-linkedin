import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { comOperador } from "@/server/db/operador";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { rodarBusca, salvarBusca, situacaoDaBusca } from "@/server/publicos/busca";
import type { FiltrosDaBusca, ResultadoDeBusca } from "@/server/unipile/cliente";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP } from "../support/despacho";
import {
  ativarPerfil,
  criarCampanha,
  criarLead,
  criarOperador,
  criarPessoa,
  criarPublico,
  idDaOrganizacaoGuessless,
  idDoPerfil,
} from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const QUARTA = instanteLocal("2026-10-07", "10:00", SP);
const SABADO = instanteLocal("2026-10-10", "10:00", SP);
const QUARTA_DE_MADRUGADA = instanteLocal("2026-10-07", "06:00", SP);
const BRASIL = { id: "106057199", nome: "Brasil" };

let sequencia = 0;
function pessoa(providerId = `ACoBusca${String(++sequencia).padStart(8, "0")}`): ResultadoDeBusca {
  return {
    providerId,
    nome: "Maria Souza",
    primeiroNome: "Maria",
    sobrenome: "Souza",
    titulo: "Head de E-commerce na Acme",
    localizacao: "São Paulo",
    publicIdentifier: providerId.toLowerCase(),
    urlPublica: `https://www.linkedin.com/in/${providerId.toLowerCase()}`,
    empresaAtual: `Empresa ${providerId}`,
    cargoAtual: "Head de E-commerce",
  };
}
const pagina = (n: number) => Array.from({ length: n }, () => pessoa());

describe("busca a partir do público (SDR-27)", () => {
  let banco: BancoDeTeste;
  let operador: string;
  let campanhaId: string;
  let unipile: UnipileFalso;

  const salvar = (busca: object, agora = QUARTA) =>
    comOperador(banco.db, operador, (tx) => salvarBusca(tx, { campanhaId, busca, operadorId: operador, agora }));
  const situacao = (agora = QUARTA) => comOperador(banco.db, operador, (tx) => situacaoDaBusca(tx, campanhaId, agora));
  const rodar = (agora = QUARTA, quantidade = 100) =>
    rodarBusca({ db: banco.db, unipile }, { campanhaId, quantidade, operadorId: operador, agora });
  const buscaSalva = async () =>
    (await banco.db.query<{ busca: { cursor: string | null; esgotada: boolean } }>("select busca from public.campanhas where id = $1::uuid", [campanhaId]))[0]!
      .busca;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    const publicoId = await criarPublico(banco.db, { cargos: ["Head de E-commerce", "Diretor de E-commerce"] });
    const criada = await comOperador(banco.db, operador, async (tx) =>
      comecarAAbordar(tx, { publicoId, perfilId: await idDoPerfil(tx, "arthur"), operadorId: operador, agora: QUARTA }),
    );
    campanhaId = (criada as { campanhaId: string }).campanhaId;
  });

  it("monta a busca com os cargos do público e roda pela conta da campanha, até a triagem", async () => {
    const inicial = await situacao();
    expect(inicial).toMatchObject({ salva: false, saldoHoje: 100, tetoDoDia: 100 });
    expect(inicial!.busca.cargos).toEqual(["Head de E-commerce", "Diretor de E-commerce"]);

    await salvar({ ...inicial!.busca, regioes: [BRASIL] });
    unipile.resultadosDeBusca = pagina(3);
    const resultado = await rodar();

    expect(resultado).toMatchObject({ ok: true, resultados: 3, resumo: { novos: 3 } });
    expect(unipile.chamadasDe("buscarPessoas")[0]).toEqual({
      accountId: "acc-arthur",
      busca: { filtros: { cargo: '"Head de E-commerce" OR "Diretor de E-commerce"', palavras: "", regioes: ["106057199"], setores: [] } },
      cursor: undefined,
    });
    const leads = await banco.db.query<{ estado: string; fonte: string }>(
      `select l.estado, pe.fonte from public.leads l join public.pessoas pe on pe.id = l.pessoa_id where l.campanha_id = $1::uuid`,
      [campanhaId],
    );
    expect(leads).toHaveLength(3);
    expect(leads.every((l) => l.estado === "triagem" && l.fonte === "unipile_busca")).toBe(true);
    expect((await situacao())!.saldoHoje).toBe(97);
  });

  it("sem região, a busca não roda", async () => {
    await salvar((await situacao())!.busca);
    expect(await rodar()).toEqual({ ok: false, erro: "Escolha pelo menos uma região ou uma lista de empresas: sem isso, a busca pega o mundo todo." });
    expect(unipile.chamadasDe("buscarPessoas")).toEqual([]);
  });

  it("não roda fora da janela da conta: fim de semana e madrugada", async () => {
    await salvar({ ...(await situacao())!.busca, regioes: [BRASIL] });
    for (const agora of [SABADO, QUARTA_DE_MADRUGADA]) {
      expect(await rodar(agora)).toMatchObject({ ok: false, erro: expect.stringContaining("Fora do horário da conta") });
    }
    expect(unipile.chamadasDe("buscarPessoas")).toEqual([]);
  });

  it("não passa do teto do dia, e a próxima busca continua de onde parou", async () => {
    await banco.db.query(`update public.configuracoes set valor = '{"max_resultados_dia": 15}' where chave = 'busca'`);
    await salvar({ ...(await situacao())!.busca, regioes: [BRASIL] });
    unipile.paginasDeBusca = [pagina(10), pagina(10), pagina(10)];

    expect(await rodar()).toMatchObject({ ok: true, resultados: 15 });
    // A segunda página veio pela metade: a próxima busca recomeça nela.
    expect(await buscaSalva()).toMatchObject({ cursor: "pagina-1", esgotada: false });

    expect(await rodar()).toEqual({ ok: false, erro: "A conta já buscou 15 pessoas hoje, o teto do dia." });
    expect(unipile.chamadasDe("buscarPessoas")).toHaveLength(2);
  });

  it("erro de limite do LinkedIn suspende só a busca do perfil até o próximo dia útil e avisa o dono", async () => {
    await salvar({ ...(await situacao())!.busca, regioes: [BRASIL] });
    unipile.falharProxima("buscarPessoas", new ErroUnipile({ status: 429, tipo: "too_many_requests", titulo: "Too many requests" }));

    expect(await rodar()).toEqual({
      ok: false,
      erro: "O LinkedIn limitou as buscas desta conta. A busca volta no próximo dia útil; os envios seguem.",
    });
    const [perfil] = await banco.db.query<{ status: string; busca_suspensa_ate: Date }>(
      "select status, busca_suspensa_ate from public.perfis where slug = 'arthur'",
    );
    expect(perfil!.status).toBe("ativo");
    expect(perfil!.busca_suspensa_ate).toEqual(instanteLocal("2026-10-08", "09:00", SP));
    const alertas = await banco.db.query<{ tipo: string }>("select tipo from public.alertas");
    expect(alertas.map((a) => a.tipo)).toEqual(["busca_suspensa"]);
    expect(await rodar()).toMatchObject({ ok: false, erro: expect.stringContaining("suspensa") });
  });

  it("opt-out e pessoa de outro dono nunca entram", async () => {
    await salvar({ ...(await situacao())!.busca, regioes: [BRASIL] });
    await banco.db.query("insert into public.optouts (provider_id, texto_pedido) values ('ACoOptout0000099', 'pare')");
    const doJuliano = await criarPessoa(banco.db, { dono: "juliano", providerId: "ACoDoJuliano0001" });
    await criarLead(banco.db, { pessoaId: doJuliano, campanhaId: await criarCampanha(banco.db, { perfil: "juliano" }), estado: "convite_enviado" });
    unipile.resultadosDeBusca = [pessoa("ACoOptout0000099"), pessoa("ACoDoJuliano0001"), pessoa()];

    expect(await rodar()).toMatchObject({ ok: true, resultados: 3, resumo: { novos: 1, optouts: 1, bloqueados: 1 } });
    const [optout] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.pessoas where provider_id = 'ACoOptout0000099'");
    expect(optout!.n).toBe(0);
  });

  it("busca esgotada não gasta o teto; mudar o filtro recomeça do início", async () => {
    const busca = { ...(await situacao())!.busca, regioes: [BRASIL] };
    await salvar(busca);
    unipile.paginasDeBusca = [pagina(4)];

    expect(await rodar()).toMatchObject({ ok: true, resultados: 4 });
    expect(await buscaSalva()).toMatchObject({ cursor: null, esgotada: true });
    expect(await rodar()).toMatchObject({ ok: false, erro: expect.stringContaining("já trouxe todo mundo") });

    await salvar({ ...busca, cargos: ["CEO"] });
    expect(await buscaSalva()).toMatchObject({ cursor: null, esgotada: false });
  });
});

describe("busca só nas empresas de uma lista (SDR-59)", () => {
  let banco: BancoDeTeste;
  let operador: string;
  let campanhaId: string;
  let unipile: UnipileFalso;
  /** Páginas de cada parte: pela lista de ids de empresa, ou `nome:` + o nome da empresa sem página. */
  let porParte: Map<string, ResultadoDeBusca[][]>;
  let chamadas: { filtros: FiltrosDaBusca; cursor: string | undefined }[];

  type Empresa = { nome: string; situacao: "a_procurar" | "achada" | "escolher" | "sem_pagina"; linkedinId?: string };
  const IDS = Array.from({ length: 12 }, (_, i) => String(1001 + i));
  const EMPRESAS: Empresa[] = [
    ...IDS.map((id) => ({ nome: `Achada ${id}`, situacao: "achada" as const, linkedinId: id })),
    { nome: "Acme Judicial", situacao: "sem_pagina" },
    { nome: "Nova", situacao: "a_procurar" },
    { nome: "Dúvida", situacao: "escolher" },
  ];
  const PRIMEIRA = IDS.slice(0, 10).join(",");
  const SEGUNDA = IDS.slice(10).join(",");

  async function criarListaNoBanco(empresas: Empresa[], nome = "Administradoras judiciais") {
    const [lista] = await banco.db.query<{ id: string }>(
      "insert into public.listas_de_empresas (organizacao_id, nome) values ($1::uuid, $2) returning id",
      [await idDaOrganizacaoGuessless(banco.db), nome],
    );
    for (const e of empresas) {
      await banco.db.query(
        "insert into public.empresas_da_lista (lista_id, nome, chave, situacao, linkedin_id) values ($1::uuid, $2, $3, $4, $5)",
        [lista!.id, e.nome, e.nome.toLowerCase(), e.situacao, e.linkedinId ?? null],
      );
    }
    return { id: lista!.id, nome };
  }

  const salvar = (busca: object) =>
    comOperador(banco.db, operador, (tx) => salvarBusca(tx, { campanhaId, busca, operadorId: operador, agora: QUARTA }));
  const situacao = () => comOperador(banco.db, operador, (tx) => situacaoDaBusca(tx, campanhaId, QUARTA));
  const rodar = (quantidade = 100) => rodarBusca({ db: banco.db, unipile }, { campanhaId, quantidade, operadorId: operador, agora: QUARTA });
  const buscaSalva = async () =>
    (
      await banco.db.query<{ busca: { parte: number; cursor: string | null; esgotada: boolean; assinatura: string | null } }>(
        "select busca from public.campanhas where id = $1::uuid",
        [campanhaId],
      )
    )[0]!.busca;
  const comLista = async (lista: { id: string; nome: string }) => salvar({ ...(await situacao())!.busca, regioes: [], lista });

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    porParte = new Map();
    chamadas = [];
    unipile.buscarPessoas = async (_accountId, busca, cursor) => {
      const { filtros } = busca as { filtros: FiltrosDaBusca };
      chamadas.push({ filtros, cursor });
      const paginas = porParte.get(filtros.empresas ? filtros.empresas.join(",") : `nome:${filtros.empresa}`) ?? [];
      const n = cursor ? Number(cursor) : 0;
      return { itens: paginas[n] ?? [], cursor: n + 1 < paginas.length ? String(n + 1) : null, total: null };
    };
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    const publicoId = await criarPublico(banco.db, { cargos: ["CEO", "Sócio"] });
    const criada = await comOperador(banco.db, operador, async (tx) =>
      comecarAAbordar(tx, { publicoId, perfilId: await idDoPerfil(tx, "arthur"), operadorId: operador, agora: QUARTA }),
    );
    campanhaId = (criada as { campanhaId: string }).campanhaId;
  });

  it("com lista, roda sem região: páginas em grupos de 10, depois o nome de cada empresa sem página, até esgotar", async () => {
    const lista = await criarListaNoBanco(EMPRESAS);
    expect(await comLista(lista)).toEqual({ ok: true });
    expect((await situacao())!.listas).toEqual([{ id: lista.id, nome: lista.nome, empresas: 15, pendentes: 2 }]);
    porParte.set(PRIMEIRA, [pagina(10), pagina(5)]);
    porParte.set(SEGUNDA, [pagina(4)]);
    porParte.set("nome:Acme Judicial", [pagina(2)]);

    expect(await rodar()).toMatchObject({ ok: true, resultados: 21, resumo: { novos: 21 } });
    expect(chamadas.map((c) => [c.filtros.empresas?.join(",") ?? `nome:${c.filtros.empresa}`, c.cursor])).toEqual([
      [PRIMEIRA, undefined],
      [PRIMEIRA, "1"],
      [SEGUNDA, undefined],
      ["nome:Acme Judicial", undefined],
    ]);
    expect(chamadas[3]!.filtros).toEqual({ cargo: '"CEO" OR "Sócio"', palavras: "", regioes: [], setores: [], empresa: "Acme Judicial" });
    // As pendentes ("Nova", "Dúvida") ficaram fora da busca.
    expect(await buscaSalva()).toMatchObject({ parte: 2, cursor: null, esgotada: true });
    expect(await rodar()).toMatchObject({ ok: false, erro: expect.stringContaining("já trouxe todo mundo") });
  });

  it("página trazida pela metade, já na parte seguinte, recomeça nela", async () => {
    await banco.db.query(`update public.configuracoes set valor = '{"max_resultados_dia": 12}' where chave = 'busca'`);
    await comLista(await criarListaNoBanco(EMPRESAS));
    porParte.set(PRIMEIRA, [pagina(10)]);
    porParte.set(SEGUNDA, [pagina(4)]);

    expect(await rodar()).toMatchObject({ ok: true, resultados: 12 });
    expect(await buscaSalva()).toMatchObject({ parte: 1, cursor: null, esgotada: false });
  });

  it("lista mudada recomeça do início da lista, mesmo esgotada; trocar a lista também", async () => {
    const lista = await criarListaNoBanco(EMPRESAS);
    await comLista(lista);
    porParte.set(PRIMEIRA, [pagina(2)]);
    porParte.set(SEGUNDA, [pagina(2)]);
    porParte.set("nome:Acme Judicial", [pagina(1)]);
    await rodar();
    expect(await buscaSalva()).toMatchObject({ esgotada: true });

    // "Dúvida" foi resolvida: entra uma parte nova, e a busca volta ao começo.
    await banco.db.query("update public.empresas_da_lista set situacao = 'sem_pagina' where nome = 'Dúvida'");
    expect((await situacao())!.busca).toMatchObject({ parte: 0, cursor: null, esgotada: false });
    chamadas = [];
    expect(await rodar(3)).toMatchObject({ ok: true, resultados: 3 });
    expect(chamadas[0]).toMatchObject({ filtros: { empresas: IDS.slice(0, 10) }, cursor: undefined });

    const outra = await criarListaNoBanco([{ nome: "Zeta", situacao: "sem_pagina" }], "Outra lista");
    await comLista(outra);
    expect(await buscaSalva()).toMatchObject({ parte: 0, cursor: null, assinatura: null, esgotada: false });
  });

  it("lista apagada: a busca não roda e pede outra lista ou tirar o filtro", async () => {
    const lista = await criarListaNoBanco(EMPRESAS);
    await comLista(lista);
    await banco.db.query("delete from public.listas_de_empresas where id = $1::uuid", [lista.id]);

    const recusa = { ok: false, erro: expect.stringContaining("foi apagada") };
    expect(await rodar()).toMatchObject(recusa);
    expect(await comLista(lista)).toMatchObject(recusa);
    expect(chamadas).toEqual([]);
  });

  it("lista só com empresas pendentes não roda", async () => {
    await comLista(
      await criarListaNoBanco([
        { nome: "Nova", situacao: "a_procurar" },
        { nome: "Dúvida", situacao: "escolher" },
      ]),
    );
    expect(await rodar()).toMatchObject({ ok: false, erro: expect.stringContaining("Nenhuma empresa da lista está pronta") });
    expect(chamadas).toEqual([]);
  });

  it("parte vazia gasta consulta: no máximo 30 páginas por rodada, e a próxima continua dali", async () => {
    const vazias = Array.from({ length: 40 }, (_, i) => ({ nome: `Vazia ${String(i).padStart(2, "0")}`, situacao: "sem_pagina" as const }));
    await comLista(await criarListaNoBanco(vazias));

    expect(await rodar()).toMatchObject({ ok: true, resultados: 0 });
    expect(chamadas).toHaveLength(30);
    expect(await buscaSalva()).toMatchObject({ parte: 30, cursor: null, esgotada: false });
  });

  it("lista de outra organização não entra no filtro", async () => {
    const [outra] = await banco.db.query<{ id: string }>("insert into public.organizacoes (slug, nome) values ('outra', 'Outra') returning id");
    const [lista] = await banco.db.query<{ id: string }>(
      "insert into public.listas_de_empresas (organizacao_id, nome) values ($1::uuid, 'Alheia') returning id",
      [outra!.id],
    );
    expect(await comLista({ id: lista!.id, nome: "Alheia" })).toMatchObject({ ok: false, erro: expect.stringContaining("foi apagada") });
  });
});
