import { beforeEach, describe, expect, it } from "vitest";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import {
  adicionarEmpresas,
  apagarLista,
  criarLista,
  escolherEmpresa,
  listarListas,
  obterLista,
  procurarEmpresas,
  removerEmpresa,
} from "@/server/listas/listas";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-14T13:00:00Z");

describe("listas de empresas (SDR-59)", () => {
  let banco: BancoDeTeste;
  let operador: string;
  let organizacaoId: string;
  let unipile: UnipileFalso;
  let esperas: number[];

  const comoOperador = <T>(fn: (tx: Db) => Promise<T>, quem = operador) => comOperador(banco.db, quem, fn);
  const criar = (nomes: string[], nome = "Administradoras judiciais") =>
    comoOperador((tx) => criarLista(tx, { organizacaoId, nome, nomes, operadorId: operador, agora: AGORA }));
  const procurar = (listaId: string) =>
    procurarEmpresas(
      { db: banco.db, unipile, esperar: async (ms) => void esperas.push(ms), sortear: () => 0.5, agora: () => AGORA },
      { listaId, operadorId: operador },
    );
  const lista = (id: string) => comoOperador((tx) => obterLista(tx, id));
  const empresa = async (listaId: string, nome: string) => (await lista(listaId))!.empresas.find((e) => e.nome === nome)!;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    esperas = [];
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    organizacaoId = await idDaOrganizacaoGuessless(banco.db);
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
  });

  it("cria a lista com os nomes como vieram; repetida pela chave entra uma vez", async () => {
    const criada = await criar(["Acme Administração Judicial Ltda.", "ACME ADMINISTRACAO JUDICIAL", "Zeta", "Beta"]);
    expect(criada).toMatchObject({ ok: true, adicionadas: 3, repetidas: 1 });

    const [resumo] = await comoOperador((tx) => listarListas(tx, organizacaoId));
    expect(resumo).toMatchObject({ nome: "Administradoras judiciais", total: 3, aProcurar: 3, achadas: 0 });
    const salva = await lista((criada as { id: string }).id);
    expect(salva!.empresas.map((e) => e.nome)).toEqual(["Acme Administração Judicial Ltda.", "Beta", "Zeta"]);
  });

  it("sem nome ou sem nenhuma empresa, a lista não nasce", async () => {
    expect(await criar([" ", "..."])).toMatchObject({ ok: false, erro: expect.stringContaining("Nenhum nome de empresa") });
    expect(await criar(["Acme"], "  ")).toMatchObject({ ok: false, erro: expect.stringContaining("nome à lista") });
    expect(await comoOperador((tx) => listarListas(tx, organizacaoId))).toEqual([]);
  });

  it("não há teto de empresas; adicionar mais conta as que já estavam como repetidas", async () => {
    const nomes = Array.from({ length: 1200 }, (_, i) => `Empresa ${i}`);
    const criada = (await criar(nomes)) as { id: string; adicionadas: number };
    expect(criada.adicionadas).toBe(1200);

    const mais = await comoOperador((tx) =>
      adicionarEmpresas(tx, { listaId: criada.id, nomes: ["Empresa 1", "empresa 2", "Nova"], agora: AGORA }),
    );
    expect(mais).toEqual({ ok: true, adicionadas: 1, repetidas: 2 });
    expect((await lista(criada.id))!.contagem.a_procurar).toBe(1201);
  });

  it("procura cada empresa no LinkedIn: achada, sem página ou para escolher, com pausa entre as consultas", async () => {
    const { id } = (await criar(["Acme", "Zeta", "Beta"])) as { id: string };
    unipile.parametrosDeBusca.set("COMPANY:Acme", [
      { id: "1035", nome: "ACME Ltda" },
      { id: "2041", nome: "Acme Consultoria" },
    ]);
    unipile.parametrosDeBusca.set("COMPANY:Beta", [
      { id: "7", nome: "Beta SP" },
      { id: "8", nome: "Beta RJ" },
    ]);

    expect(await procurar(id)).toEqual({ ok: true, procuradas: 3, faltam: 0 });
    expect(unipile.chamadasDe("listarParametrosDeBusca").map((c) => [c.accountId, c.tipo])).toEqual([
      ["acc-arthur", "COMPANY"],
      ["acc-arthur", "COMPANY"],
      ["acc-arthur", "COMPANY"],
    ]);
    expect(esperas).toEqual([2000, 2000]);
    expect(await empresa(id, "Acme")).toMatchObject({ situacao: "achada", linkedinId: "1035", linkedinNome: "ACME Ltda" });
    expect(await empresa(id, "Zeta")).toMatchObject({ situacao: "sem_pagina", linkedinId: null });
    expect(await empresa(id, "Beta")).toMatchObject({
      situacao: "escolher",
      opcoes: [
        { id: "7", nome: "Beta SP" },
        { id: "8", nome: "Beta RJ" },
      ],
    });
    // A procura não conta no teto de busca do dia.
    const [eventos] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.eventos where tipo = 'busca_feita'");
    expect(eventos!.n).toBe(0);
  });

  it("procura de 20 em 20", async () => {
    const { id } = (await criar(Array.from({ length: 25 }, (_, i) => `Empresa ${i}`))) as { id: string };
    expect(await procurar(id)).toEqual({ ok: true, procuradas: 20, faltam: 5 });
    expect(await procurar(id)).toEqual({ ok: true, procuradas: 5, faltam: 0 });
    expect(await procurar(id)).toEqual({ ok: true, procuradas: 0, faltam: 0 });
  });

  it("erro de limite do LinkedIn para a leva e avisa; o que faltou continua para procurar", async () => {
    const { id } = (await criar(["Acme", "Zeta"])) as { id: string };
    unipile.falharProxima("listarParametrosDeBusca", new ErroUnipile({ status: 429, tipo: "too_many_requests", titulo: "Too many" }));

    expect(await procurar(id)).toEqual({
      ok: false,
      erro: "O LinkedIn limitou as consultas desta conta. 0 empresas foram procuradas; faltam 2. Tente de novo mais tarde.",
    });
    expect(unipile.chamadasDe("listarParametrosDeBusca")).toHaveLength(1);
    expect((await lista(id))!.contagem.a_procurar).toBe(2);
  });

  it("sem conta do LinkedIn conectada na organização, avisa", async () => {
    const { id } = (await criar(["Acme"])) as { id: string };
    await banco.db.query("update public.perfis set status = 'pausado', motivo_pausa = 'teste', unipile_account_id = null");
    expect(await procurar(id)).toMatchObject({ ok: false, erro: expect.stringContaining("Nenhuma conta do LinkedIn conectada") });

    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    await banco.db.query("update public.perfis set unipile_status = 'CREDENTIALS'");
    expect(await procurar(id)).toMatchObject({ ok: false, erro: expect.stringContaining("Nenhuma conta do LinkedIn conectada") });
    expect(unipile.chamadasDe("listarParametrosDeBusca")).toEqual([]);
  });

  it("usa a conta da casa só se não houver outra", async () => {
    const { id } = (await criar(["Acme"])) as { id: string };
    await banco.db.query("update public.perfis set casa = true where slug = 'arthur'");
    await ativarPerfil(banco.db, "juliano", { accountId: "acc-juliano" });
    await procurar(id);
    expect(unipile.chamadasDe("listarParametrosDeBusca")[0]).toMatchObject({ accountId: "acc-juliano" });
  });

  it("o humano escolhe a página, ou nenhuma destas, e pode trocar depois", async () => {
    const { id } = (await criar(["Beta", "Gama"])) as { id: string };
    unipile.parametrosDeBusca.set("COMPANY:Beta", [
      { id: "7", nome: "Beta SP" },
      { id: "8", nome: "Beta RJ" },
    ]);
    unipile.parametrosDeBusca.set("COMPANY:Gama", [{ id: "9", nome: "Gama Holding" }]);
    await procurar(id);
    const beta = await empresa(id, "Beta");
    const gama = await empresa(id, "Gama");
    const escolher = (empresaId: string, opcaoId: string | null) =>
      comoOperador((tx) => escolherEmpresa(tx, { empresaId, opcaoId, agora: AGORA }));

    expect(await escolher(beta.id, "8")).toEqual({ ok: true });
    expect(await empresa(id, "Beta")).toMatchObject({ situacao: "achada", linkedinId: "8", linkedinNome: "Beta RJ" });
    expect(await escolher(gama.id, null)).toEqual({ ok: true });
    expect(await empresa(id, "Gama")).toMatchObject({ situacao: "sem_pagina", linkedinId: null });
    expect(await escolher(gama.id, "9")).toEqual({ ok: true });
    expect(await empresa(id, "Gama")).toMatchObject({ situacao: "achada", linkedinId: "9" });
    expect(await escolher(beta.id, "999")).toMatchObject({ ok: false });
  });

  it("tirar empresa e apagar a lista", async () => {
    const { id } = (await criar(["Acme", "Zeta"])) as { id: string };
    const acme = await empresa(id, "Acme");
    expect(await comoOperador((tx) => removerEmpresa(tx, { empresaId: acme.id, agora: AGORA }))).toEqual({ ok: true });
    expect((await lista(id))!.empresas.map((e) => e.nome)).toEqual(["Zeta"]);

    expect(await comoOperador((tx) => apagarLista(tx, { listaId: id }))).toEqual({ ok: true });
    expect(await lista(id)).toBeNull();
    const [sobra] = await banco.db.query<{ n: number }>("select count(*)::int as n from public.empresas_da_lista");
    expect(sobra!.n).toBe(0);
  });

  it("outra organização não vê nem mexe na lista", async () => {
    const { id } = (await criar(["Acme"])) as { id: string };
    const outra = await criarOrganizacao(banco.db);
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: outra });

    expect(await comoOperador((tx) => obterLista(tx, id), deFora)).toBeNull();
    expect(await comoOperador((tx) => listarListas(tx, organizacaoId), deFora)).toEqual([]);
    expect(await comoOperador((tx) => apagarLista(tx, { listaId: id }), deFora)).toMatchObject({ ok: false });
    expect(await procurarEmpresas({ db: banco.db, unipile, esperar: async () => {}, agora: () => AGORA }, { listaId: id, operadorId: deFora })).toEqual({
      ok: false,
      erro: "Lista não encontrada.",
    });
    const tentativa = comoOperador(
      (tx) => tx.query("insert into public.empresas_da_lista (lista_id, nome, chave) values ($1::uuid, 'Invasora', 'invasora')", [id]),
      deFora,
    );
    await expect(tentativa).rejects.toThrow(/row-level security/);
  });
});
