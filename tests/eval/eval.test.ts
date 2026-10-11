import { describe, expect, it } from "vitest";
import type { Desfecho } from "@/server/agente/decidir";
import type { Resposta } from "@/server/agente/modelo";
import { aplicarRevisao, modeloDeRevisao, revisao } from "@/server/eval/calibracao";
import { custoDaChamada, precoDoModelo } from "@/server/eval/custo";
import { carregarDataset, TEMAS_OBRIGATORIOS, type CasoDoEval } from "@/server/eval/dataset";
import type { Avaliacao, Juiz } from "@/server/eval/juiz";
import { CASOS_MINIMOS_POR_PRACA, montarRelatorio, relatorioEmMarkdown } from "@/server/eval/relatorio";
import { rodarEval } from "@/server/eval/rodada";
import { avaliarCaso } from "@/server/eval/rubrica";
import { ModeloFalso } from "../support/modelo-falso";

const casos = await carregarDataset();
const caso = (id: string) => casos.find((c) => c.id === id)!;

const BOA: Avaliacao = {
  promete_resultado: { violou: false, motivo: "sem promessa" },
  reuniao_cedo: { violou: false, motivo: "não fala de reunião" },
  tom: { nota: 5, motivo: "curto e oral" },
};

class JuizFalso implements Juiz {
  avaliacoes: Avaliacao[] = [];
  falhas: Error[] = [];
  chamadas: string[] = [];
  async avaliar(p: { sistema: string; entrada: string }): Promise<Resposta<Avaliacao>> {
    this.chamadas.push(p.entrada);
    const falha = this.falhas.shift();
    if (falha) throw falha;
    return {
      saida: this.avaliacoes.shift() ?? BOA,
      uso: { entrada: 2000, saida: 300, cacheLeitura: 1000, cacheEscrita: 0 },
      modelo: "claude-opus-5-5",
    };
  }
}

function rascunho(texto: string | null, acao: "responder" | "propor_reuniao" | "encerrar" = "responder", excecao: string | null = null): Desfecho {
  return {
    tipo: "rascunho",
    classificacao: { categoria: "pergunta", confianca: 0.9, sinais: { preco: false, reclamacao: false, idioma: "pt" } },
    decisao: { acao, mensagem: texto, motivo: "teste", estagio_sugerido: "03", confianca: 0.9 },
    texto,
    validacao: { ok: true, violacoes: [] },
    excecao,
  };
}

describe("dataset do eval (§7.1)", () => {
  it(`tem ${CASOS_MINIMOS_POR_PRACA}+ conversas por praça, com todas as objeções da §7.1`, () => {
    for (const praca of ["domestico", "canada", "espanha"] as const) {
      const daPraca = casos.filter((c) => c.praca === praca);
      expect(daPraca.length, praca).toBeGreaterThanOrEqual(CASOS_MINIMOS_POR_PRACA);
      const temas = new Set(daPraca.map((c) => c.tema));
      for (const tema of TEMAS_OBRIGATORIOS) expect(temas.has(tema), `${praca}: ${tema}`).toBe(true);
    }
  });

  it("toda conversa termina no prospect, e reunião só é aceitável quando o caso diz", () => {
    for (const c of casos) {
      expect(c.entrada.mensagens.at(-1)!.direcao).toBe("entrada");
      if (c.esperado.acoes.includes("propor_reuniao")) expect(c.esperado.reuniao, c.id).toBe(true);
    }
    expect(caso("br-15").esperado.reuniao).toBe(false);
  });

  it("usa o perfil do seed de cada praça", () => {
    expect(caso("br-01").entrada.perfil.nome).toBe("Arthur");
    expect(caso("es-01").entrada.perfil.idioma).toBe("es");
    expect(caso("es-01").entrada.linkDeAgenda).toBe("https://cal.com/juliano-guessless/30min");
  });
});

describe("rubrica", () => {
  it("ação certa: fora da lista reprova; preço exige terminar com humano", () => {
    expect(avaliarCaso(caso("br-22"), rascunho("Tudo bem, obrigado pelo retorno.", "encerrar"), BOA).acao?.passou).toBe(true);
    expect(avaliarCaso(caso("br-22"), rascunho("Posso te mostrar como fazemos?"), BOA).acao?.passou).toBe(false);

    const preco = caso("br-05");
    expect(avaliarCaso(preco, rascunho("Depende do escopo."), BOA).acao?.passou).toBe(false);
    expect(avaliarCaso(preco, rascunho("Depende do escopo.", "responder", "pergunta de preço"), BOA).acao?.passou).toBe(true);
    const escalado: Desfecho = { ...(rascunho(null) as Extract<Desfecho, { tipo: "rascunho" }>), tipo: "escalar", motivo: "preço" };
    expect(avaliarCaso(preco, escalado, null).acao?.passou).toBe(true);
  });

  it("opt-out claro conta como registrar_optout e não avalia texto", () => {
    const notas = avaliarCaso(caso("br-11"), { tipo: "optout", excecao: "pedido claro de opt-out" }, null);
    expect(notas.acao?.passou).toBe(true);
    expect(notas.validador).toBeNull();
    expect(notas.tom).toBeNull();
  });

  it("percentual e link de agenda sem interesse reprovam sem depender do juiz", () => {
    const notas = avaliarCaso(caso("br-15"), rascunho("Legal. Em lojas assim a margem sobe 20% em 3 meses."), BOA);
    expect(notas.sem_promessa?.passou).toBe(false);

    const cedo = avaliarCaso(caso("br-15"), rascunho("Bora conversar? https://cal.com/juliano-guessless/30min"), BOA);
    expect(cedo.reuniao_no_tempo?.passou).toBe(false);

    const noTempo = avaliarCaso(caso("br-20"), rascunho("Fechado! Escolhe um horário: https://cal.com/juliano-guessless/30min", "propor_reuniao"), BOA);
    expect(noTempo.reuniao_no_tempo?.passou).toBe(true);
    expect(noTempo.acao?.passou).toBe(true);
  });

  it("tom passa com nota 4 ou mais; sem juiz, os critérios dele ficam sem nota", () => {
    const tres = avaliarCaso(caso("br-15"), rascunho("Entendi."), { ...BOA, tom: { nota: 3, motivo: "formal" } });
    expect(tres.tom).toMatchObject({ passou: false, nota: 0.5 });
    const semJuiz = avaliarCaso(caso("br-15"), rascunho("Entendi."), null);
    expect(semJuiz.tom).toBeNull();
    expect(semJuiz.sem_promessa).toBeNull();
    expect(semJuiz.validador?.passou).toBe(true);
  });
});

describe("custo", () => {
  it("usa a tabela de preços, aceita id com data e separa o cache", () => {
    expect(precoDoModelo("claude-haiku-4-5-20251001")).toEqual({ entrada: 1, saida: 5 });
    expect(precoDoModelo("claude-sonnet-5-5")).toEqual({ entrada: 2, saida: 10 });
    expect(precoDoModelo("modelo-desconhecido")).toBeNull();
    // 1M de entrada no Sonnet 5 (US$ 2) + 1M de saída (US$ 10) + 1M lido do cache (US$ 0,20) + 1M escrito (US$ 2,50).
    expect(
      custoDaChamada("claude-sonnet-5", { entrada: 1_000_000, saida: 1_000_000, cacheLeitura: 1_000_000, cacheEscrita: 1_000_000 }),
    ).toBeCloseTo(14.7, 6);
  });
});

describe("rodada e relatório", () => {
  const rodar = (lista: CasoDoEval[], modelo: ModeloFalso, juiz: JuizFalso) =>
    rodarEval(lista, { modelo, juiz, concorrencia: 3 });
  const relatorio = (execucoes: Awaited<ReturnType<typeof rodarEval>>) =>
    montarRelatorio({
      execucoes,
      versaoDosPrompts: "teste",
      versaoDoJuiz: "teste",
      modelos: { classificacao: "falso", rascunho: "falso", juiz: "claude-opus-5-5" },
      repeticoes: 1,
      agora: new Date("2026-10-01T12:00:00Z"),
    });

  it("roda cada caso pelo mesmo caminho do agente de produção, na ordem do dataset", async () => {
    const modelo = new ModeloFalso();
    const juiz = new JuizFalso();
    const lista = [caso("br-11"), caso("br-15"), caso("ca-15")];
    const execucoes = await rodar(lista, modelo, juiz);

    expect(execucoes.map((e) => e.caso)).toEqual(["br-11", "br-15", "ca-15"]);
    // "Pare de me mandar mensagem" é opt-out por regra: nenhuma chamada de modelo nem de juiz.
    expect(execucoes[0]).toMatchObject({ acao: "registrar_optout", chamadas: [] });
    expect(modelo.chamadas.filter((c) => c.etapa === "classificar")).toHaveLength(2);
    // Sem a regra de saída do Canadá (SDR-53), o texto padrão do modelo falso passa no validador.
    expect(execucoes[2]!.notas?.validador?.passou).toBe(true);
    expect(juiz.chamadas[0]).toContain("Ação decidida pelo agente: responder");
  });

  it("relatório por critério e por praça, com custo; praça com menos de 30 casos é inconclusiva", async () => {
    const execucoes = await rodar([caso("br-15"), caso("br-21")], new ModeloFalso(), new JuizFalso());
    const r = relatorio(execucoes);
    expect(r.pracas.map((p) => p.praca)).toEqual(["domestico"]);
    expect(r.pracas[0]!.criterios.acao).toMatchObject({ n: 2, acertos: 2, taxa: 1, passou: true });
    expect(r.veredito).toBe("inconclusivo");
    expect(r.pracas[0]!.motivos.join()).toContain("2 casos (mínimo 30)");
    // Modelo falso não tem preço; o juiz (Opus 5.5) tem: 2000 × 4 + 300 × 20 + 1000 × 0,4 por milhão.
    expect(r.custo.juiz).toBeCloseTo(2 * 0.0144, 8);
    expect(r.custo.semPreco).toEqual(["falso-classificacao", "falso-rascunho"]);

    const md = relatorioEmMarkdown(r);
    expect(md).toContain("| Critério | Mínimo | Brasil | Geral |");
    expect(md).toContain("Custo da rodada: US$ 0.0288");
    expect(md).toContain("Sem preço na tabela");
  });

  it("praça com 30+ casos e critério abaixo do mínimo é reprovada; erro deixa inconclusiva", async () => {
    const domestico = casos.filter((c) => c.praca === "domestico");
    const juiz = new JuizFalso();
    juiz.avaliacoes = [{ ...BOA, promete_resultado: { violou: true, motivo: "prometeu dobrar a margem" } }];
    const r = relatorio(await rodar(domestico, new ModeloFalso(), juiz));
    expect(r.pracas[0]!.criterios.sem_promessa.passou).toBe(false);
    expect(r.veredito).toBe("reprovado");
    expect(relatorioEmMarkdown(r)).toContain("prometeu dobrar a margem");

    const modelo = new ModeloFalso();
    modelo.falhas = [new Error("API fora do ar")];
    const comErro = await rodar([caso("br-15")], modelo, new JuizFalso());
    expect(comErro[0]).toMatchObject({ erro: "API fora do ar", notas: null });
    expect(relatorio(comErro).pracas[0]!.erros).toBe(1);
  });

  it("falha do juiz não derruba a execução: critérios dele sem nota e rodada inconclusiva", async () => {
    const juiz = new JuizFalso();
    juiz.falhas = [new Error("O juiz recusou (sem categoria).")];
    const [execucao] = await rodar([caso("br-15")], new ModeloFalso(), juiz);
    expect(execucao!.erroDoJuiz).toContain("recusou");
    expect(execucao!.notas?.tom).toBeNull();
    expect(execucao!.notas?.acao?.passou).toBe(true);
  });
});

describe("calibração pela revisão humana", () => {
  it("a nota humana substitui a do juiz no veredito e a concordância é medida", async () => {
    const execucoes = await rodarEval([caso("br-15"), caso("br-21")], { modelo: new ModeloFalso(), juiz: new JuizFalso() });
    const original = montarRelatorio({
      execucoes,
      versaoDosPrompts: "teste",
      versaoDoJuiz: "teste",
      modelos: { classificacao: "falso", rascunho: "falso", juiz: "claude-opus-5-5" },
      repeticoes: 1,
      agora: new Date(),
    });

    const modelo = modeloDeRevisao(execucoes);
    expect(Object.keys(modelo)).toEqual(["br-15#1", "br-21#1"]);
    expect(modelo["br-15#1"]!._texto).toBe(new ModeloFalso().decisaoPadrao.mensagem);

    const dados = revisao.parse({ ...modelo, "br-15#1": { ...modelo["br-15#1"], tom: 2, sem_promessa: true } });
    const { relatorio, concordancia } = aplicarRevisao(original, dados, new Date());
    expect(concordancia.tom).toEqual({ revisadas: 1, concordantes: 0, taxa: 0 });
    expect(concordancia.sem_promessa).toEqual({ revisadas: 1, concordantes: 1, taxa: 1 });
    expect(concordancia.reuniao_no_tempo.taxa).toBeNull();
    expect(relatorio.geral.tom).toMatchObject({ n: 2, acertos: 1 });
  });
});
