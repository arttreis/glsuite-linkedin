import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import { comOperador } from "@/server/db/operador";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { rodarBusca, salvarBusca, situacaoDaBusca } from "@/server/publicos/busca";
import type { ResultadoDeBusca } from "@/server/unipile/cliente";
import { ErroUnipile } from "@/server/unipile/erros";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP } from "../support/despacho";
import { ativarPerfil, criarCampanha, criarLead, criarOperador, criarPessoa, criarPublico, idDoPerfil } from "../support/fixtures";
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
    expect(await rodar()).toEqual({ ok: false, erro: "Escolha pelo menos uma região: sem região, a busca pega o mundo todo." });
    expect(unipile.chamadasDe("buscarPessoas")).toEqual([]);
  });

  it("roda a qualquer hora, também no fim de semana e de madrugada", async () => {
    await salvar({ ...(await situacao())!.busca, regioes: [BRASIL] });
    unipile.paginasDeBusca = [pagina(10), pagina(10), pagina(10)];
    expect(await rodar(SABADO, 10)).toMatchObject({ ok: true, resultados: 10 });
    expect(await rodar(QUARTA_DE_MADRUGADA, 10)).toMatchObject({ ok: true, resultados: 10 });
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
