import { beforeEach, describe, expect, it } from "vitest";
import type { Dossie } from "@/domain/dossie";
import type { TextosDoFluxo } from "@/domain/fluxo-gerado";
import type { Sdr } from "@/domain/sdr";
import { estadoDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { editarTextoDaAbordagem, gerarAbordagem, obterAbordagem, permitirContato } from "@/server/abordagem/recomendada";
import { comOperador } from "@/server/db/operador";
import type { EscritorDeFluxo } from "@/server/publicos/escritor";
import { gravarVersaoDoSdr } from "@/server/sdr/sdr";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao, criarPublico } from "../support/fixtures";

const AGORA = new Date("2026-10-10T18:00:00Z");
const USO = { entrada: 3_000, saida: 600, cacheLeitura: 0, cacheEscrita: 0 };
const PROVA = "Mais de 40 lojas parceiras no atacado";

const ANALISE: Dossie = {
  empresa: { nome: "Loja da Duda", resumo: "Moda feminina online e no atacado." },
  produtos: [{ nome: "Atacado", descricao: "Lote pequeno para multimarca.", para_quem: "multimarcas" }],
  para_quem: "Lojas multimarca de moda feminina.",
  diferenciais: [],
  provas: [{ tipo: "numero", texto: PROVA, fonte_url: null }],
  dores: ["Estoque parado"],
  objecoes: [],
  tom_de_voz: "Leve.",
  idioma: "pt",
  mercado: { segmentos: [], alternativas: [], gatilhos: [] },
};

const SDR: Sdr = {
  objetivo: "marcar 20 minutos com a Duda",
  voz: "Bem informal, próxima.",
  abertura: "Uma observação sobre estoque parado depois da troca de coleção.",
  qualificacao: [],
  objecoes: [],
  regras: [],
  quando_chamar_voce: ["Pedido de tabela de atacado"],
  link_agenda: null,
};

const BONS: TextosDoFluxo = {
  convite: "Oi {{first_name}}, acompanho multimarca de moda e queria te ter por aqui.",
  mensagens: [
    "Obrigada por aceitar. Muita multimarca fica com estoque parado depois da troca de coleção.",
    "Na {{company}}, como vocês escolhem as peças da próxima estação?",
    "Fico por aqui. Se fizer sentido um dia, é só chamar.",
  ],
  motivo: "estoque parado",
};

const COM_TRAVESSAO: TextosDoFluxo = { ...BONS, mensagens: ["Obrigada por aceitar — estoque parado é comum.", ...BONS.mensagens.slice(1)] };

function escritorFalso(...saidas: TextosDoFluxo[]): EscritorDeFluxo & { chamadas: { sistema: string; entrada: string }[] } {
  const chamadas: { sistema: string; entrada: string }[] = [];
  return {
    chamadas,
    async escrever(p) {
      chamadas.push(p);
      return { saida: saidas[Math.min(chamadas.length - 1, saidas.length - 1)]!, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

describe("abordagem recomendada e permissão (SDR-45)", () => {
  let banco: BancoDeTeste;
  let organizacao: string;
  let duda: string;

  beforeEach(async () => {
    banco = await criarBancoDeTeste();
    organizacao = await criarOrganizacao(banco.db, { nome: "Loja da Duda" });
    duda = await criarOperador(banco.db, { nome: "Duda", papel: "admin", organizacaoId: organizacao });
    await banco.db.query(
      `insert into public.ofertas (organizacao_id, url, status, dossie, dossie_confirmado, confirmado_em)
       values ($1::uuid, 'https://duda.com.br/', 'pronta', $2::jsonb, $2::jsonb, $3)`,
      [organizacao, JSON.stringify(ANALISE), AGORA],
    );
    await gravarVersaoDoSdr(banco.db, { organizacaoId: organizacao, sdr: SDR, origem: "ia", por: null, agora: AGORA });
    const publico = await criarPublico(banco.db, { organizacaoId: organizacao, status: "ativo" });
    await banco.db.query("update public.publicos set provas = $2::jsonb where id = $1::uuid", [publico, JSON.stringify([PROVA])]);
  });

  const gerar = (escritor: EscritorDeFluxo) =>
    gerarAbordagem({ db: banco.db, escritor, agora: AGORA }, { organizacaoId: organizacao, nome: "Duda", operadorId: duda });
  const comoDuda = <T,>(fn: (tx: typeof banco.db) => Promise<T>) => comOperador(banco.db, duda, fn);
  const permitir = () => comoDuda((tx) => permitirContato(tx, { organizacaoId: organizacao, operadorId: duda, agora: AGORA }));

  it("escreve o convite e as três mensagens na voz do SDR, para o público escolhido", async () => {
    const escritor = escritorFalso(BONS);
    const resultado = await gerar(escritor);

    expect(resultado).toMatchObject({ ok: true, abordagem: { textos: BONS, problemas: [], permitida: null } });
    expect(escritor.chamadas[0]!.sistema).toContain("Bem informal, próxima.");
    expect(escritor.chamadas[0]!.sistema).toContain("Como abre a conversa: Uma observação sobre estoque parado");
    expect(escritor.chamadas[0]!.sistema).toContain("em nome de Duda");
  });

  it("texto barrado ganha uma reescrita com o problema apontado", async () => {
    const escritor = escritorFalso(COM_TRAVESSAO, BONS);
    const resultado = await gerar(escritor);
    expect(escritor.chamadas).toHaveLength(2);
    expect(escritor.chamadas[1]!.entrada).toContain("T2");
    expect(resultado).toMatchObject({ ok: true, abordagem: { problemas: [] } });
  });

  it("barrado duas vezes chega marcado e não deixa permitir", async () => {
    const resultado = await gerar(escritorFalso(COM_TRAVESSAO, COM_TRAVESSAO));
    expect(resultado.ok && resultado.abordagem.problemas.map((p) => p.toque)).toEqual(["T2"]);
    expect(await permitir()).toMatchObject({ ok: false, erro: expect.stringContaining("Corrija antes de seguir: T2") });
  });

  it("número que não está nas provas do público é problema", async () => {
    const inventado: TextosDoFluxo = { ...BONS, mensagens: ["Clientes vendem 30% mais com a gente.", ...BONS.mensagens.slice(1)] };
    const resultado = await gerar(escritorFalso(inventado, inventado));
    expect(resultado.ok && resultado.abordagem.problemas).toEqual([expect.objectContaining({ toque: "T2", mensagem: expect.stringContaining("30%") })]);
  });

  it("permitir grava quem e quando, e o primeiro acesso segue para o LinkedIn", async () => {
    await gerar(escritorFalso(BONS));
    expect(await permitir()).toEqual({ ok: true });
    const abordagem = await obterAbordagem(banco.db, organizacao);
    expect(abordagem!.permitida).toEqual({ em: AGORA, por: "Duda" });
    const estado = await comoDuda((tx) => estadoDoPrimeiroAcesso(tx));
    expect(estado.feitos.has("abordagem")).toBe(true);
  });

  it("editar revalida e apaga a permissão: a pessoa permite o que vê", async () => {
    await gerar(escritorFalso(BONS));
    await permitir();
    const editar = (texto: string) =>
      comoDuda((tx) => editarTextoDaAbordagem(tx, { organizacaoId: organizacao, toque: "T3", texto, operadorId: duda, agora: AGORA }));

    const comProblema = await editar("Na {{company}} — o estoque gira?");
    expect(comProblema).toMatchObject({ ok: true, abordagem: { permitida: null, problemas: [expect.objectContaining({ toque: "T3" })] } });

    const corrigido = await editar("Na {{company}}, o estoque gira rápido?");
    expect(corrigido).toMatchObject({ ok: true, abordagem: { problemas: [] } });
    expect(corrigido.ok && corrigido.abordagem.textos.mensagens[1]).toBe("Na {{company}}, o estoque gira rápido?");
    expect(await permitir()).toEqual({ ok: true });
  });

  it("gerar de novo apaga a permissão", async () => {
    await gerar(escritorFalso(BONS));
    await permitir();
    await gerar(escritorFalso(BONS));
    expect((await obterAbordagem(banco.db, organizacao))!.permitida).toBeNull();
  });

  it("sem público escolhido não escreve", async () => {
    await banco.db.query("update public.publicos set status = 'sugerido' where organizacao_id = $1::uuid", [organizacao]);
    expect(await gerar(escritorFalso(BONS))).toEqual({ ok: false, erro: "Escolha o perfil do lead antes da abordagem." });
  });

  it("outra organização não vê nem permite", async () => {
    await gerar(escritorFalso(BONS));
    const deFora = await criarOperador(banco.db, { papel: "admin", organizacaoId: await criarOrganizacao(banco.db) });
    expect(await comOperador(banco.db, deFora, (tx) => obterAbordagem(tx, organizacao))).toBeNull();
    expect(await comOperador(banco.db, deFora, (tx) => permitirContato(tx, { organizacaoId: organizacao, operadorId: deFora, agora: AGORA }))).toMatchObject({
      ok: false,
    });
  });
});
