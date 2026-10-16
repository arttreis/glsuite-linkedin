import { beforeEach, describe, expect, it } from "vitest";
import { instanteLocal } from "@/domain/calendario";
import type { PedidoDeBusca, RascunhoDaBusca } from "@/domain/conversa-da-busca";
import type { Resposta } from "@/server/agente/modelo";
import { ErroDoModelo } from "@/server/agente/modelo";
import { comOperador } from "@/server/db/operador";
import { comecarAAbordar } from "@/server/publicos/abordagem";
import { situacaoDaBusca } from "@/server/publicos/busca";
import { conversarSobreABusca } from "@/server/publicos/conversa-da-busca";
import type { InterpretadorDeBusca } from "@/server/publicos/interpretador-de-busca";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { SP } from "../support/despacho";
import { ativarPerfil, criarOperador, criarPublico, idDaOrganizacaoGuessless, idDoPerfil } from "../support/fixtures";
import { UnipileFalso } from "../support/unipile-falso";

const QUARTA = instanteLocal("2026-10-07", "10:00", SP);
const BRASIL = { id: "106057199", nome: "Brasil" };
const SP_CIDADE = { id: "105871508", nome: "São Paulo, São Paulo, Brasil" };
const SP_ESTADO = { id: "104746682", nome: "São Paulo, Brasil" };
const VAREJO = { id: "27", nome: "Varejo" };

/** O modelo roteirizado: devolve os pedidos na ordem e guarda o que recebeu. */
class InterpretadorFalso implements InterpretadorDeBusca {
  pedidos: PedidoDeBusca[] = [];
  entradas: string[] = [];
  falha: Error | null = null;

  async interpretar(p: { sistema: string; entrada: string }): Promise<Resposta<PedidoDeBusca>> {
    this.entradas.push(p.entrada);
    if (this.falha) throw this.falha;
    return { saida: this.pedidos.shift()!, uso: { entrada: 1000, saida: 200, cacheLeitura: 0, cacheEscrita: 0 }, modelo: "claude-haiku-4-5" };
  }
}

const pedido = (parcial: Partial<PedidoDeBusca>): PedidoDeBusca => ({
  resposta: "Feito.",
  cargos: ["Head de E-commerce", "Diretor de E-commerce"],
  palavras: "",
  regioes: [],
  setores: [],
  lista: { acao: "manter", nome: "", empresas: [] },
  ...parcial,
});

describe("busca pela conversa (SDR-62)", () => {
  let banco: BancoDeTeste;
  let operador: string;
  let campanhaId: string;
  let unipile: UnipileFalso;
  let interpretador: InterpretadorFalso;
  let inicial: RascunhoDaBusca;

  const conversar = (mensagem: string, busca: RascunhoDaBusca = inicial, historico: unknown = []) =>
    conversarSobreABusca({ db: banco.db, unipile, interpretador }, { campanhaId, busca, historico, mensagem, operadorId: operador, agora: QUARTA });

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    unipile = new UnipileFalso();
    interpretador = new InterpretadorFalso();
    operador = await criarOperador(banco.db, { papel: "admin", nome: "Arthur" });
    await ativarPerfil(banco.db, "arthur", { ativadoEm: "2026-10-01T11:00:00Z", accountId: "acc-arthur" });
    const publicoId = await criarPublico(banco.db, { cargos: ["Head de E-commerce", "Diretor de E-commerce"] });
    const criada = await comOperador(banco.db, operador, async (tx) =>
      comecarAAbordar(tx, { publicoId, perfilId: await idDoPerfil(tx, "arthur"), operadorId: operador, agora: QUARTA }),
    );
    campanhaId = (criada as { campanhaId: string }).campanhaId;
    inicial = (await comOperador(banco.db, operador, (tx) => situacaoDaBusca(tx, campanhaId, QUARTA)))!.busca;
  });

  it("monta a busca pelo pedido e acha região e setor no LinkedIn pela conta da campanha, sem salvar", async () => {
    unipile.parametrosDeBusca.set("LOCATION:Brasil", [BRASIL, { id: "1", nome: "Brasília, Distrito Federal, Brasil" }]);
    unipile.parametrosDeBusca.set("INDUSTRY:Varejo", [VAREJO]);
    interpretador.pedidos.push(pedido({ cargos: ["Head de E-commerce", "Diretor de E-commerce", "CMO"], regioes: ["Brasil"], setores: ["Varejo"] }));

    const resultado = await conversar("Põe CMO, no Brasil, só varejo");

    expect(resultado).toMatchObject({
      ok: true,
      resposta: "Feito.",
      busca: { cargos: ["Head de E-commerce", "Diretor de E-commerce", "CMO"], regioes: [BRASIL], setores: [VAREJO], lista: null },
      mudancas: [
        { sinal: "+", texto: "CMO" },
        { sinal: "+", texto: "Brasil" },
        { sinal: "+", texto: "Varejo" },
      ],
      duvidas: [],
      avisos: [],
      listaCriada: null,
    });
    expect(unipile.chamadasDe("listarParametrosDeBusca")).toEqual([
      { accountId: "acc-arthur", tipo: "LOCATION", texto: "Brasil" },
      { accountId: "acc-arthur", tipo: "INDUSTRY", texto: "Varejo" },
    ]);
    // A conversa não salva: quem salva e busca é a pessoa, no formulário.
    const [campanha] = await banco.db.query<{ busca: unknown }>("select busca from public.campanhas where id = $1::uuid", [campanhaId]);
    expect(campanha!.busca).toBeNull();
    const [evento] = await banco.db.query<{ payload: Record<string, unknown> }>("select payload from public.eventos where tipo = 'busca_conversada'");
    expect(evento!.payload).toMatchObject({ mudancas: 3, duvidas: 0, modelo: "claude-haiku-4-5", versao_prompt: "busca-conversada-2" });
  });

  it("o que já está na busca fica sem consultar o LinkedIn; nome com várias opções vira pergunta; nome sem opção, aviso", async () => {
    unipile.parametrosDeBusca.set("LOCATION:São Paulo", [SP_CIDADE, SP_ESTADO]);
    interpretador.pedidos.push(pedido({ regioes: ["brasil", "São Paulo", "Atlântida"] }));

    const resultado = await conversar("Também São Paulo e Atlântida", { ...inicial, regioes: [BRASIL] });

    expect(resultado).toMatchObject({
      ok: true,
      busca: { regioes: [BRASIL] },
      mudancas: [],
      duvidas: [{ tipo: "LOCATION", texto: "São Paulo", opcoes: [SP_CIDADE, SP_ESTADO] }],
      avisos: ['Não achei no LinkedIn a região "Atlântida".'],
    });
    expect(unipile.chamadasDe("listarParametrosDeBusca").map((c) => c.texto)).toEqual(["São Paulo", "Atlântida"]);
  });

  it("manda ao modelo a busca atual, as listas da organização e a conversa até aqui", async () => {
    await comOperador(banco.db, operador, async (tx) =>
      tx.query("insert into public.listas_de_empresas (organizacao_id, nome) values ($1::uuid, 'Administradoras judiciais')", [
        await idDaOrganizacaoGuessless(tx),
      ]),
    );
    interpretador.pedidos.push(pedido({}));

    await conversar("E agora?", { ...inicial, regioes: [BRASIL], cargos: ["Head de E-commerce", ""] }, [
      { quem: "voce", texto: "Heads de e-commerce no Brasil" },
      { quem: "kakou", texto: "Pronto." },
    ]);

    const entrada = interpretador.entradas[0]!;
    expect(entrada).toContain('"cargos": [\n    "Head de E-commerce"\n  ]');
    expect(entrada).toContain('"regioes": [\n    "Brasil"\n  ]');
    expect(entrada).toContain("- Administradoras judiciais (0 empresas)");
    expect(entrada).toContain("Pessoa: Heads de e-commerce no Brasil\nVocê: Pronto.");
    expect(entrada).toContain("<mensagem>\nE agora?\n</mensagem>");
  });

  it("usa uma lista da organização pelo nome, e avisa quando não acha", async () => {
    const [lista] = await comOperador(banco.db, operador, async (tx) =>
      tx.query<{ id: string }>("insert into public.listas_de_empresas (organizacao_id, nome) values ($1::uuid, 'Administradoras judiciais') returning id", [
        await idDaOrganizacaoGuessless(tx),
      ]),
    );
    interpretador.pedidos.push(pedido({ lista: { acao: "usar", nome: "administradoras", empresas: [] } }));
    interpretador.pedidos.push(pedido({ lista: { acao: "usar", nome: "Bancos", empresas: [] } }));

    const usada = await conversar("Só nas administradoras");
    expect(usada).toMatchObject({ ok: true, busca: { lista: { id: lista!.id, nome: "Administradoras judiciais" } } });

    const naoAchada = await conversar("Só nos bancos", { ...inicial, lista: { id: lista!.id, nome: "Administradoras judiciais" } });
    expect(naoAchada).toMatchObject({
      ok: true,
      busca: { lista: { id: lista!.id } },
      avisos: ['Não achei a lista de empresas "Bancos". A busca ficou com a lista que estava.'],
    });
  });

  it("cria a lista com as empresas que a pessoa deu e já põe na busca", async () => {
    interpretador.pedidos.push(
      pedido({ lista: { acao: "criar", nome: "Varejo de moda", empresas: ["Renner", "C&A", "Lojas Renner", "Riachuelo", "renner"] } }),
    );

    const resultado = await conversar("Cria uma lista com Renner, C&A, Riachuelo e busca só nelas");

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.listaCriada).toMatchObject({ nome: "Varejo de moda", empresas: 4 });
    expect(resultado.busca.lista).toEqual({ id: resultado.listaCriada!.id, nome: "Varejo de moda" });
    const empresas = await banco.db.query<{ nome: string; situacao: string }>(
      "select nome, situacao from public.empresas_da_lista where lista_id = $1::uuid order by nome",
      [resultado.listaCriada!.id],
    );
    expect(empresas.map((e) => e.nome)).toEqual(["C&A", "Lojas Renner", "Renner", "Riachuelo"]);
    expect(empresas.every((e) => e.situacao === "a_procurar")).toBe(true);
  });

  it("sem cargo no pedido e sem lista, os cargos ficam como estavam", async () => {
    interpretador.pedidos.push(pedido({ cargos: [] }));
    const resultado = await conversar("Tira todos os cargos");
    expect(resultado).toMatchObject({
      ok: true,
      busca: { cargos: ["Head de E-commerce", "Diretor de E-commerce"] },
      avisos: ["Sem lista de empresas, a busca precisa de pelo menos um cargo: os cargos ficaram como estavam."],
    });
  });

  it("com lista, sem cargo é todo mundo das empresas (SDR-121)", async () => {
    const [lista] = await comOperador(banco.db, operador, async (tx) =>
      tx.query<{ id: string }>("insert into public.listas_de_empresas (organizacao_id, nome) values ($1::uuid, 'Administradoras judiciais') returning id", [
        await idDaOrganizacaoGuessless(tx),
      ]),
    );
    interpretador.pedidos.push(pedido({ cargos: [], lista: { acao: "usar", nome: "Administradoras judiciais", empresas: [] } }));
    const resultado = await conversar("Todo mundo que trabalha nas administradoras");
    expect(resultado).toMatchObject({ ok: true, busca: { cargos: [], lista: { id: lista!.id } }, avisos: [] });
  });

  it("modelo fora do ar ou mensagem vazia não mexem em nada", async () => {
    expect(await conversar("   ")).toEqual({ ok: false, erro: "Escreva quem você quer achar." });
    interpretador.falha = new ErroDoModelo("O modelo recusou (sem categoria).");
    expect(await conversar("Diretores no Brasil")).toEqual({
      ok: false,
      erro: "Não consegui entender agora: O modelo recusou (sem categoria). Tente de novo ou mexa nos filtros abaixo.",
    });
    expect(await banco.db.query("select 1 from public.eventos where tipo = 'busca_conversada'")).toHaveLength(0);
  });

  it("sem LinkedIn conectado na conta da campanha, não conversa", async () => {
    await banco.db.query("update public.perfis set status = 'pausado', motivo_pausa = 'teste', unipile_account_id = null");
    expect(await conversar("Diretores no Brasil")).toEqual({ ok: false, erro: "A conta da campanha não tem LinkedIn conectado." });
    expect(interpretador.entradas).toHaveLength(0);
  });
});
