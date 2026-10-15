import { beforeEach, describe, expect, it } from "vitest";
import type { Dossie } from "@/domain/dossie";
import type { SdrDaIa } from "@/domain/sdr";
import { ErroDoModelo } from "@/server/agente/modelo";
import { comOperador } from "@/server/db/operador";
import { garantirSdr, gerarSdr, obterSdr, salvarSdr, type GeradorDeSdr } from "@/server/sdr/sdr";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, idDaOrganizacaoGuessless } from "../support/fixtures";

const AGORA = new Date("2026-10-10T16:00:00Z");
const USO = { entrada: 3_000, saida: 800, cacheLeitura: 0, cacheEscrita: 0 };

const ANALISE: Dossie = {
  empresa: { nome: "Loja da Duda", resumo: "Moda feminina online." },
  produtos: [{ nome: "Atacado", descricao: "Venda em lote para multimarca.", para_quem: "lojas multimarca" }],
  para_quem: "Lojas multimarca de moda feminina.",
  diferenciais: ["Produção própria"],
  provas: [],
  dores: ["Estoque parado"],
  objecoes: [{ objecao: "Já tenho fornecedor", resposta: "Lote mínimo menor." }],
  tom_de_voz: "Leve.",
  idioma: "pt",
  mercado: { segmentos: [{ nome: "Multimarcas", por_que: "Precisam de peça diferente" }], alternativas: ["Brás"], gatilhos: [] },
};

const GERADO: SdrDaIa = {
  objetivo: "marcar 20 minutos com a Duda",
  voz: "Leve e próxima.",
  abertura: "Observação sobre estoque parado.",
  qualificacao: ["Tem multimarca"],
  objecoes: [{ objecao: "Já tenho fornecedor", resposta: "Lote mínimo menor." }],
  regras: ["Não falo de preço por mensagem"],
  quando_chamar_voce: ["Pedido de tabela"],
};

function geradorFalso(saidas: (SdrDaIa | Error)[] = [GERADO]): GeradorDeSdr & { chamadas: { sistema: string; entrada: string }[] } {
  const chamadas: { sistema: string; entrada: string }[] = [];
  return {
    chamadas,
    async gerar(p) {
      chamadas.push(p);
      const saida = saidas.shift() ?? GERADO;
      if (saida instanceof Error) throw saida;
      return { saida, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

describe("o SDR da organização (SDR-42)", () => {
  let banco: BancoDeTeste;
  let organizacao: string;
  let admin: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacao = await criarOrganizacao(banco.db, { nome: "Loja da Duda" });
    admin = await criarOperador(banco.db, { nome: "Duda", papel: "admin", organizacaoId: organizacao });
  });

  async function confirmarAnalise(dossie: Dossie = ANALISE) {
    await banco.db.query(
      `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
       values ($1::uuid, 'https://duda.com.br/', 'pronta', $2::jsonb, $2::jsonb, $3)`,
      [organizacao, JSON.stringify(dossie), AGORA],
    );
  }

  const gerar = (gerador: GeradorDeSdr) =>
    gerarSdr({ db: banco.db, gerador }, { organizacaoId: organizacao, nome: "Duda", operadorId: admin, agora: AGORA });

  it("sem análise confirmada, não gera e não chama a IA", async () => {
    const gerador = geradorFalso();
    expect(await gerar(gerador)).toEqual({ ok: false, erro: "Confirme a análise do site antes de montar o SDR." });
    expect(gerador.chamadas).toEqual([]);
  });

  it("gera a versão 1 da análise confirmada, em nome de quem vai conversar", async () => {
    await confirmarAnalise();
    const gerador = geradorFalso();
    const resultado = await gerar(gerador);

    expect(resultado).toMatchObject({ ok: true, sdr: { versao: 1, sdr: { ...GERADO, link_agenda: null } } });
    expect(gerador.chamadas[0]!.sistema).toContain("o jeito como Duda conversa");
    expect(gerador.chamadas[0]!.entrada).toContain("Loja da Duda: Moda feminina online.");
    expect(gerador.chamadas[0]!.entrada).toContain("Multimarcas: Precisam de peça diferente");

    const [versao] = await banco.db.query<{ versao: number; origem: string }>("select versao, origem from public.sdr_versoes");
    expect(versao).toEqual({ versao: 1, origem: "ia" });
    const [evento] = await banco.db.query<{ payload: { versao: number } }>("select payload from public.eventos where tipo = 'sdr_gerado'");
    expect(evento!.payload.versao).toBe(1);
  });

  it("gerar de novo vira versão nova e mantém o link de agenda", async () => {
    await confirmarAnalise();
    await gerar(geradorFalso());
    await banco.db.query("update public.sdrs set sdr = jsonb_set(sdr, '{link_agenda}', '\"https://cal.com/duda\"')");

    const segunda = await gerar(geradorFalso([{ ...GERADO, objetivo: "outro objetivo" }]));
    expect(segunda).toMatchObject({ ok: true, sdr: { versao: 2, sdr: { objetivo: "outro objetivo", link_agenda: "https://cal.com/duda" } } });
  });

  it("falha da IA não grava nada", async () => {
    await confirmarAnalise();
    expect(await gerar(geradorFalso([new ErroDoModelo("O modelo recusou (cyber).")]))).toEqual({
      ok: false,
      erro: "O modelo recusou (cyber).",
    });
    expect(await obterSdr(banco.db, organizacao)).toBeNull();
  });

  it("garantir não gera de novo quem já tem, e sem a IA avisa", async () => {
    await confirmarAnalise();
    const p = { organizacaoId: organizacao, nome: "Duda", operadorId: admin, agora: AGORA };
    expect(await garantirSdr({ db: banco.db, gerador: null }, p)).toMatchObject({ ok: false });

    await gerar(geradorFalso());
    const gerador = geradorFalso();
    expect(await garantirSdr({ db: banco.db, gerador }, p)).toMatchObject({ ok: true, sdr: { versao: 1 } });
    expect(gerador.chamadas).toEqual([]);
  });

  it("a edição humana valida e vira versão nova; inválida é recusada com a parte do problema", async () => {
    await confirmarAnalise();
    await gerar(geradorFalso());
    const salvar = (sdr: unknown) =>
      comOperador(banco.db, admin, (tx) => salvarSdr(tx, { organizacaoId: organizacao, sdr, operadorId: admin, agora: AGORA }));

    expect(await salvar({ ...GERADO, link_agenda: "https://cal.com/duda", regras: ["Sem desconto", "  "] })).toEqual({
      ok: true,
      versao: 2,
    });
    expect((await obterSdr(banco.db, organizacao))!.sdr.regras).toEqual(["Sem desconto"]);
    expect(await salvar({ ...GERADO, objetivo: "", link_agenda: null })).toEqual({
      ok: false,
      erro: "Objetivo: não pode ficar em branco.",
    });
  });

  it("salvar só uma parte mantém o resto: a passagem para você e o editor não se desfazem (SDR-60)", async () => {
    await confirmarAnalise();
    await gerar(geradorFalso());
    const salvar = (sdr: unknown, resumo?: string) =>
      comOperador(banco.db, admin, (tx) => salvarSdr(tx, { organizacaoId: organizacao, sdr, operadorId: admin, agora: AGORA, resumo }));

    expect(await salvar({ quando_chamar_voce: ["Pedido de proposta formal"], cautela: "cauteloso" }, "Mudou a passagem.")).toEqual({ ok: true, versao: 2 });
    expect((await obterSdr(banco.db, organizacao))!.sdr).toEqual({
      ...GERADO,
      link_agenda: null,
      quando_chamar_voce: ["Pedido de proposta formal"],
      cautela: "cauteloso",
    });

    const { quando_chamar_voce: casos, ...editor } = GERADO;
    expect(casos).toHaveLength(1);
    expect(await salvar({ ...editor, voz: "Mais seca.", link_agenda: "https://cal.com/duda" })).toEqual({ ok: true, versao: 3 });
    expect((await obterSdr(banco.db, organizacao))!.sdr).toMatchObject({
      voz: "Mais seca.",
      quando_chamar_voce: ["Pedido de proposta formal"],
      cautela: "cauteloso",
    });

    expect(await salvar({ cautela: "ousado" })).toMatchObject({ ok: false, erro: expect.stringContaining("Quando ficar em dúvida") });

    // Gerar de novo da análise não mexe no que só a pessoa decide.
    await gerar(geradorFalso());
    expect((await obterSdr(banco.db, organizacao))!.sdr).toMatchObject({ link_agenda: "https://cal.com/duda", cautela: "cauteloso" });
  });

  it("outra organização não lê nem grava o SDR", async () => {
    await confirmarAnalise();
    await gerar(geradorFalso());
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: await idDaOrganizacaoGuessless(banco.db) });
    expect(await comOperador(banco.db, deFora, (tx) => obterSdr(tx, organizacao))).toBeNull();
    await expect(
      comOperador(banco.db, deFora, (tx) =>
        salvarSdr(tx, { organizacaoId: organizacao, sdr: { ...GERADO, link_agenda: null }, operadorId: deFora, agora: AGORA }),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
