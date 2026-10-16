import { beforeEach, describe, expect, it } from "vitest";
import { FILTROS_INICIAIS, type FiltrosDeBusca } from "@/domain/busca";
import { buscarLeads, importarSelecionados, pessoaDaBusca, sugerirParametros } from "@/server/busca/busca";
import type { ResultadoDeBusca } from "@/server/unipile/cliente";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const AGORA = new Date("2026-10-11T14:00:00Z");
const FILTROS: FiltrosDeBusca = { ...FILTROS_INICIAIS, cargo: "Head de e-commerce" };

const resultado = (providerId: string, extra: Partial<ResultadoDeBusca> = {}): ResultadoDeBusca => ({
  providerId,
  nome: "Carla Mendes",
  primeiroNome: null,
  sobrenome: null,
  titulo: "Head de E-commerce",
  localizacao: "Curitiba, PR",
  publicIdentifier: providerId.toLowerCase(),
  urlPublica: `https://www.linkedin.com/in/${providerId.toLowerCase()}?miniProfileUrn=x`,
  empresaAtual: "Loja Sul",
  cargoAtual: "Head de E-commerce",
  distancia: "SECOND_DEGREE",
  convitePendente: false,
  ...extra,
});

const varios = (n: number) => Array.from({ length: n }, (_, i) => resultado(`ACoBusca${String(i).padStart(4, "0")}`));

describe("busca de leads com filtros (§4.11)", () => {
  let banco: BancoDeTeste;
  let unipile: UnipileFalso;
  let campanha: string;
  let operador: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    await ativarPerfil(banco.db, "arthur", { accountId: "acc-arthur" });
    campanha = await criarCampanha(banco.db, { perfil: "arthur" });
    operador = await criarOperador(banco.db, { papel: "admin" });
    unipile = new UnipileFalso();
  });

  const buscar = (p: Partial<Parameters<typeof buscarLeads>[1]> = {}) =>
    buscarLeads(
      { db: banco.db, unipile },
      { campanhaId: campanha, busca: { filtros: FILTROS }, quantidade: 50, operadorId: operador, agora: AGORA, ...p },
    );

  const definirTeto = (maximo: number) =>
    banco.db.query("update public.configuracoes set valor = $1::jsonb where chave = 'busca'", [
      JSON.stringify({ max_perfis_por_dia: maximo }),
    ]);

  it("busca com a conta do perfil da campanha e não grava nenhuma pessoa", async () => {
    unipile.resultadosDeBusca = [resultado("ACoBusca0001")];

    const pagina = await buscar();

    expect(pagina.pessoas).toEqual([expect.objectContaining({ providerId: "ACoBusca0001", situacao: { tipo: "nova" } })]);
    expect(pagina.cursor).toBeNull();
    expect(unipile.chamadasDe("buscarPessoas")[0]).toMatchObject({ accountId: "acc-arthur", busca: { filtros: FILTROS } });
    const [contagem] = await banco.db.query<{ pessoas: number; leads: number }>(
      "select (select count(*) from public.pessoas)::int as pessoas, (select count(*) from public.leads)::int as leads",
    );
    expect(contagem).toEqual({ pessoas: 0, leads: 0 });
  });

  it("marca a situação de cada pessoa na base", async () => {
    const campanhaJuliano = await criarCampanha(banco.db, { perfil: "juliano" });
    await banco.db.query("insert into public.optouts (provider_id, texto_pedido) values ('ACoOptout', 'pare')");
    await criarPessoa(banco.db, { providerId: "ACoOptoutNaPessoa", optoutEm: "2026-10-01T12:00:00Z" });
    await criarLead(banco.db, { pessoaId: await criarPessoa(banco.db, { providerId: "ACoNaCampanha" }), campanhaId: campanha });
    await criarLead(banco.db, {
      pessoaId: await criarPessoa(banco.db, { providerId: "ACoDoJuliano", dono: "juliano" }),
      campanhaId: campanhaJuliano,
    });
    await criarLead(banco.db, {
      pessoaId: await criarPessoa(banco.db, { providerId: "ACoJulianoRejeitou", dono: "juliano" }),
      campanhaId: campanhaJuliano,
      estado: "rejeitado",
    });
    await criarPessoa(banco.db, { providerId: "ACoNaBase" });
    unipile.resultadosDeBusca = [
      "ACoOptout",
      "ACoOptoutNaPessoa",
      "ACoNaCampanha",
      "ACoDoJuliano",
      "ACoJulianoRejeitou",
      "ACoNaBase",
      "ACoNova",
    ].map((id) => resultado(id));

    const { pessoas } = await buscar();

    expect(Object.fromEntries(pessoas.map((p) => [p.providerId, p.situacao]))).toEqual({
      ACoOptout: { tipo: "optout" },
      ACoOptoutNaPessoa: { tipo: "optout" },
      ACoNaCampanha: { tipo: "na_campanha" },
      ACoDoJuliano: { tipo: "de_outro_perfil", perfil: "Juliano" },
      // Só rejeitou: a posse pode passar na aprovação (§4.7).
      ACoJulianoRejeitou: { tipo: "na_base" },
      ACoNaBase: { tipo: "na_base" },
      ACoNova: { tipo: "nova" },
    });
  });

  it("puxa páginas até juntar a quantidade e devolve o cursor para carregar mais", async () => {
    unipile.resultadosDeBusca = varios(25);

    const primeira = await buscar({ quantidade: 20 });
    expect(primeira.pessoas).toHaveLength(20);
    expect(primeira.cursor).toBe("20");

    const segunda = await buscar({ quantidade: 20, cursor: primeira.cursor });
    expect(segunda.pessoas).toHaveLength(5);
    expect(segunda.cursor).toBeNull();
    expect(unipile.chamadasDe("buscarPessoas").map((c) => c.cursor)).toEqual([undefined, "10", "20"]);
  });

  it("conta o teto por perfil nas últimas 24 horas e para ao chegar nele", async () => {
    await definirTeto(15);
    unipile.resultadosDeBusca = varios(25);

    const pagina = await buscar();
    // O teto é conferido antes de cada página: passa em até uma página.
    expect(pagina.pessoas).toHaveLength(20);
    expect(pagina.teto).toEqual({ usados: 20, maximo: 15 });
    expect(pagina.aviso).toMatch(/teto de 15/);
    expect(pagina.cursor).toBe("20");

    await expect(buscar({ cursor: pagina.cursor })).rejects.toThrow(/já trouxe 20 pessoas .* o teto é 15/);

    const amanha = new Date(AGORA.getTime() + 25 * 3_600_000);
    expect((await buscar({ cursor: pagina.cursor, agora: amanha })).pessoas).toHaveLength(5);

    const eventos = await banco.db.query<{ quantidade: number }>(
      "select (payload->>'quantidade')::int as quantidade from public.eventos where tipo = 'busca_linkedin' order by id",
    );
    expect(eventos.map((e) => e.quantidade)).toEqual([10, 10, 5]);
  });

  it("teto 0 desliga a busca", async () => {
    await definirTeto(0);
    await expect(buscar()).rejects.toThrow(/desligada/);
    expect(unipile.chamadasDe("buscarPessoas")).toHaveLength(0);
  });

  it("só busca com o LinkedIn do perfil conectado e saudável", async () => {
    const campanhaJuliano = await criarCampanha(banco.db, { perfil: "juliano" });
    await expect(buscar({ campanhaId: campanhaJuliano })).rejects.toThrow(/não tem LinkedIn conectado/);

    await banco.db.query("update public.perfis set unipile_status = 'CREDENTIALS' where unipile_account_id = 'acc-arthur'");
    await expect(buscar()).rejects.toThrow(/precisa ser reconectada/);
    expect(unipile.chamadasDe("buscarPessoas")).toHaveLength(0);
  });

  it("na Espanha, só busca depois do DPA assinado", async () => {
    await ativarPerfil(banco.db, "jp", { accountId: "acc-jp" });
    const campanhaJp = await criarCampanha(banco.db, { perfil: "jp" });
    unipile.resultadosDeBusca = [resultado("ACoMadrid")];

    await expect(buscar({ campanhaId: campanhaJp })).rejects.toThrow(/DPA/);

    await banco.db.query("update public.configuracoes set valor = '{\"dpa_espanha\": true}' where chave = 'travas'");
    expect((await buscar({ campanhaId: campanhaJp })).pessoas).toHaveLength(1);
  });

  it("erro do LinkedIn na primeira página vira mensagem; no meio, devolve o que já veio", async () => {
    unipile.falharProxima("buscarPessoas", new ErroUnipile({ status: 429, tipo: "too_many_requests", titulo: "limite" }));
    await expect(buscar()).rejects.toThrow(/limitou a busca/);

    unipile.resultadosDeBusca = varios(25);
    const original = unipile.buscarPessoas.bind(unipile);
    let chamadas = 0;
    unipile.buscarPessoas = async (...args) => {
      chamadas += 1;
      if (chamadas === 2) throw new ErroUnipile({ status: 503, tipo: "http_503", titulo: "fora" });
      return original(...args);
    };

    const pagina = await buscar();
    expect(pagina.pessoas).toHaveLength(10);
    expect(pagina.aviso).toMatch(/não respondeu/);
    expect(pagina.cursor).toBe("10");
  });

  it("leva só os selecionados para a triagem, com a busca como origem", async () => {
    const { resumo, importacaoId } = await importarSelecionados(
      { db: banco.db },
      {
        campanhaId: campanha,
        selecionados: [resultado("ACoEscolhida1"), resultado("ACoEscolhida2")],
        descricao: "Busca: cargo: Head de e-commerce",
        operadorId: operador,
        agora: AGORA,
      },
    );

    expect(resumo.novos).toBe(2);
    const pessoas = await banco.db.query<{ fonte: string; url_publica: string; estado: string }>(
      `select pe.fonte, pe.url_publica, l.estado
         from public.pessoas pe join public.leads l on l.pessoa_id = pe.id order by pe.provider_id`,
    );
    expect(pessoas[0]).toEqual({ fonte: "unipile_busca", url_publica: "https://www.linkedin.com/in/acoescolhida1", estado: "triagem" });
    const [importacao] = await banco.db.query<{ arquivo_nome: string }>(
      "select arquivo_nome from public.importacoes where id = $1::uuid",
      [importacaoId],
    );
    expect(importacao!.arquivo_nome).toBe("Busca: cargo: Head de e-commerce");
  });

  it("sugere local e setor com a conta do perfil; falha vira lista vazia", async () => {
    unipile.parametros.set("LOCATION", [
      { id: "105871508", titulo: "São Paulo, Brasil" },
      { id: "106057199", titulo: "Curitiba, Paraná, Brasil" },
    ]);
    const sugerir = () =>
      sugerirParametros({ db: banco.db, unipile }, { campanhaId: campanha, tipo: "LOCATION", texto: "são" });

    expect(await sugerir()).toEqual([{ id: "105871508", titulo: "São Paulo, Brasil" }]);
    expect(unipile.chamadasDe("buscarParametros")[0]).toMatchObject({ accountId: "acc-arthur", tipo: "LOCATION" });

    unipile.falharProxima("buscarParametros", new Error("fora do ar"));
    expect(await sugerir()).toEqual([]);
  });

  it("converte o resultado da busca para o formato da importação", () => {
    expect(pessoaDaBusca(resultado("ACoCarla", { primeiroNome: null }))).toMatchObject({
      providerId: "ACoCarla",
      urlPublica: "https://www.linkedin.com/in/acocarla",
      primeiroNome: "Carla",
      cargo: "Head de E-commerce",
      empresaChave: "loja sul",
    });
  });
});
