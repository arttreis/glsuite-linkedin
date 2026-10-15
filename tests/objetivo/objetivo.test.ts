import { beforeEach, describe, expect, it } from "vitest";
import type { Dossie } from "@/domain/dossie";
import type { RespostasDoObjetivo, ResumoDaIa } from "@/domain/objetivo";
import type { SdrDaIa } from "@/domain/sdr";
import { estadoDoPrimeiroAcesso } from "@/server/acesso/primeiro-acesso";
import { ErroDoModelo } from "@/server/agente/modelo";
import { comOperador } from "@/server/db/operador";
import {
  confirmarObjetivo,
  objetivoConfirmado,
  objetivoDaOrganizacao,
  resumirObjetivo,
  salvarRespostas,
  sdrDesatualizado,
  type ResumidorDeObjetivo,
} from "@/server/objetivo/objetivo";
import { gerarSdr, type GeradorDeSdr } from "@/server/sdr/sdr";
import { VERSAO_DO_PROMPT_DO_SDR } from "@/server/sdr/prompts";
import { criarBancoDeTeste, type BancoDeTeste } from "../support/banco";
import { criarOperador, criarOrganizacao } from "../support/fixtures";

const AGORA = new Date("2026-10-15T15:00:00Z");
const DEPOIS = new Date("2026-10-15T16:00:00Z");
const USO = { entrada: 900, saida: 120, cacheLeitura: 0, cacheEscrita: 0 };

const ANALISE: Dossie = {
  empresa: { nome: "Loja da Duda", resumo: "Moda feminina online." },
  produtos: [
    { nome: "Atacado", descricao: "Venda em lote para multimarca.", para_quem: "lojas multimarca" },
    { nome: "Consultoria de vitrine", descricao: "Montagem de vitrine.", para_quem: "lojas" },
  ],
  para_quem: "Lojas multimarca de moda feminina.",
  diferenciais: [],
  provas: [],
  dores: [],
  objecoes: [],
  tom_de_voz: "Leve.",
  idioma: "pt",
  mercado: { segmentos: [{ nome: "Multimarcas", por_que: "Precisam de peça diferente" }], alternativas: [], gatilhos: [] },
};

const RESPOSTAS: RespostasDoObjetivo = {
  produtos: ["Atacado", "Mentoria de compras"],
  principal: "Atacado",
  acao: "qualificar",
  quem_atende: "Bia",
  duracao: 30,
  nunca: "Não oferecer desconto por mensagem",
};

const RESUMO = "O Kakou vai prospectar multimarcas para vender o atacado. O SDR vai qualificar e chamar a Bia quando o lead servir.";

const GERADO: SdrDaIa = {
  objetivo: "qualificar e passar para a Bia",
  voz: "Leve.",
  abertura: "Observação sobre estoque.",
  qualificacao: ["Tem multimarca"],
  objecoes: [],
  regras: ["Não oferecer desconto por mensagem"],
  quando_chamar_voce: ["Lead serve"],
};

function resumidorFalso(saidas: (string | Error)[] = [RESUMO]): ResumidorDeObjetivo & { chamadas: { sistema: string; entrada: string }[] } {
  const chamadas: { sistema: string; entrada: string }[] = [];
  return {
    chamadas,
    async resumir(p) {
      chamadas.push(p);
      const saida = saidas.shift() ?? RESUMO;
      if (saida instanceof Error) throw saida;
      return { saida: { resumo: saida } satisfies ResumoDaIa, uso: USO, modelo: "claude-haiku-4-5" };
    },
  };
}

function geradorFalso(): GeradorDeSdr & { chamadas: { sistema: string; entrada: string }[] } {
  const chamadas: { sistema: string; entrada: string }[] = [];
  return {
    chamadas,
    async gerar(p) {
      chamadas.push(p);
      return { saida: GERADO, uso: USO, modelo: "claude-sonnet-5" };
    },
  };
}

describe("o objetivo da organização (SDR-67)", () => {
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
  });

  const comoDuda = <T,>(fn: (tx: typeof banco.db) => Promise<T>) => comOperador(banco.db, duda, fn);
  const estado = () => comoDuda((tx) => estadoDoPrimeiroAcesso(tx));
  const resumir = (resumidor: ResumidorDeObjetivo, respostas: unknown = RESPOSTAS, agora = AGORA) =>
    resumirObjetivo({ db: banco.db, resumidor, agora }, { organizacaoId: organizacao, respostas, operadorId: duda });
  const confirmar = (agora = AGORA) =>
    comoDuda((tx) => confirmarObjetivo(tx, { organizacaoId: organizacao, operadorId: duda, agora }));
  const situacao = () => comoDuda((tx) => objetivoDaOrganizacao(tx, organizacao));

  it("depois da análise confirmada, o passo é o objetivo", async () => {
    expect((await estado()).atual).toBe("objetivo");
  });

  it("recarregar a página mantém as respostas, e mudar uma apaga o resumo", async () => {
    expect(await comoDuda((tx) => salvarRespostas(tx, { organizacaoId: organizacao, respostas: RESPOSTAS, operadorId: duda, agora: AGORA }))).toMatchObject({
      ok: true,
    });
    expect(await situacao()).toMatchObject({ respostas: RESPOSTAS, resumo: null, confirmado: null, rascunhoPendente: true });

    await resumir(resumidorFalso());
    expect((await situacao()).resumo).toBe(RESUMO);

    // Salvar as mesmas respostas (outra ordem) mantém o resumo; mudar uma apaga.
    await comoDuda((tx) =>
      salvarRespostas(tx, { organizacaoId: organizacao, respostas: { ...RESPOSTAS, produtos: [...RESPOSTAS.produtos].reverse() }, operadorId: duda, agora: AGORA }),
    );
    expect((await situacao()).resumo).toBe(RESUMO);
    await comoDuda((tx) => salvarRespostas(tx, { organizacaoId: organizacao, respostas: { ...RESPOSTAS, duracao: 45 }, operadorId: duda, agora: AGORA }));
    expect(await situacao()).toMatchObject({ respostas: { duracao: 45 }, resumo: null });
  });

  it("resposta inválida não grava e diz o motivo", async () => {
    expect(
      await comoDuda((tx) =>
        salvarRespostas(tx, { organizacaoId: organizacao, respostas: { ...RESPOSTAS, principal: "Outro" }, operadorId: duda, agora: AGORA }),
      ),
    ).toEqual({ ok: false, erro: "Produto principal: O principal precisa estar marcado." });
    expect((await situacao()).respostas).toBeNull();
  });

  it("o resumo leva a análise e as respostas, e grava o evento", async () => {
    const resumidor = resumidorFalso();
    expect(await resumir(resumidor)).toEqual({ ok: true, resumo: RESUMO });
    const { entrada } = resumidor.chamadas[0]!;
    expect(entrada).toContain("Loja da Duda: Moda feminina online.");
    expect(entrada).toContain("Multimarcas: Precisam de peça diferente");
    expect(entrada).toContain("Produto principal: Atacado");
    expect(entrada).toContain("Também vende pelo LinkedIn: Mentoria de compras");
    expect(entrada).toContain("Nunca: Não oferecer desconto por mensagem");
    const [evento] = await banco.db.query<{ payload: { versao_prompt: string; cortado: boolean } }>(
      "select payload from public.eventos where tipo = 'objetivo_resumido'",
    );
    expect(evento!.payload).toMatchObject({ versao_prompt: "objetivo-1", cortado: false });
  });

  it("resposta da IA com campo longo não derruba o resumo: vem cortada", async () => {
    const longo = `${RESUMO} ${"Mais uma frase sobre o que o SDR faz. ".repeat(30)}`;
    const resultado = await resumir(resumidorFalso([longo]));
    expect(resultado.ok).toBe(true);
    const resumo = resultado.ok ? resultado.resumo : "";
    expect(resumo.startsWith(RESUMO)).toBe(true);
    expect(resumo.length).toBeLessThanOrEqual(600);
    expect((await situacao()).resumo).toBe(resumo);
  });

  it("resposta fora do formato vira mensagem clara, e as respostas ficam salvas", async () => {
    const resultado = await resumir(resumidorFalso([new ErroDoModelo("A IA devolveu o resumo fora do formato. Tente de novo.")]));
    expect(resultado).toEqual({ ok: false, erro: "A IA devolveu o resumo fora do formato. Tente de novo." });
    expect(await situacao()).toMatchObject({ respostas: RESPOSTAS, resumo: null });
  });

  it("sem análise confirmada, não resume nem chama a IA", async () => {
    await banco.db.query("update public.ofertas set dossie_confirmado = null where organizacao_id = $1::uuid", [organizacao]);
    const resumidor = resumidorFalso();
    expect(await resumir(resumidor)).toEqual({ ok: false, erro: "Confirme a análise do site antes do objetivo." });
    expect(resumidor.chamadas).toEqual([]);
  });

  it("confirmar sem resumo não confirma", async () => {
    await comoDuda((tx) => salvarRespostas(tx, { organizacaoId: organizacao, respostas: RESPOSTAS, operadorId: duda, agora: AGORA }));
    expect(await confirmar()).toEqual({ ok: false, erro: "Responda e veja o resumo antes de confirmar." });
    expect((await estado()).atual).toBe("objetivo");
  });

  it("confirmar grava quem e quando, e o primeiro acesso avança para o SDR", async () => {
    await resumir(resumidorFalso());
    expect(await confirmar()).toEqual({ ok: true });

    const atual = await situacao();
    expect(atual.confirmado).toEqual({ objetivo: { ...RESPOSTAS, resumo: RESUMO }, em: AGORA, por: "Duda" });
    expect(atual.rascunhoPendente).toBe(false);
    const [evento] = await banco.db.query<{ ator: string }>("select ator from public.eventos where tipo = 'objetivo_confirmado'");
    expect(evento!.ator).toBe(duda);

    const depois = await estado();
    expect(depois.atual).toBe("sdr");
    expect([...depois.feitos]).toEqual(["site", "analise", "objetivo"]);
  });

  it("mudar depois de confirmar vira rascunho: o confirmado segue valendo até confirmar de novo", async () => {
    await resumir(resumidorFalso());
    await confirmar();
    await comoDuda((tx) => salvarRespostas(tx, { organizacaoId: organizacao, respostas: { ...RESPOSTAS, duracao: 15 }, operadorId: duda, agora: DEPOIS }));
    expect((await objetivoConfirmado(banco.db, organizacao))!.objetivo.duracao).toBe(30);
    expect((await situacao()).rascunhoPendente).toBe(true);
  });

  it("o prompt do SDR leva o objetivo confirmado", async () => {
    await resumir(resumidorFalso());
    await confirmar();
    const gerador = geradorFalso();
    const gerado = await gerarSdr({ db: banco.db, gerador }, { organizacaoId: organizacao, nome: "Duda", operadorId: duda, agora: AGORA });
    expect(gerado.ok).toBe(true);

    const { sistema, entrada } = gerador.chamadas[0]!;
    expect(sistema).toContain("o objetivo que a pessoa confirmou");
    expect(sistema).toContain('O que está em "Nunca" no objetivo vira uma regra');
    expect(entrada).toContain("<objetivo_confirmado>");
    expect(entrada).toContain("Produto principal: Atacado");
    expect(entrada).toContain("qualificar o lead e passar a conversa para Bia");
    expect(entrada).toContain("Nunca: Não oferecer desconto por mensagem");
    expect(entrada).toContain(`Resumo que a pessoa validou: ${RESUMO}`);

    const [evento] = await banco.db.query<{ payload: { versao_prompt: string; com_objetivo: boolean } }>(
      "select payload from public.eventos where tipo = 'sdr_gerado'",
    );
    expect(evento!.payload).toMatchObject({ versao_prompt: VERSAO_DO_PROMPT_DO_SDR, com_objetivo: true });
    expect(VERSAO_DO_PROMPT_DO_SDR).toBe("sdr-3");
  });

  it("mudar o objetivo não gera o SDR de novo: só avisa, e gerar de novo tira o aviso", async () => {
    await resumir(resumidorFalso());
    await confirmar();
    const gerador = geradorFalso();
    const p = { organizacaoId: organizacao, nome: "Duda", operadorId: duda, agora: AGORA };
    await gerarSdr({ db: banco.db, gerador }, p);
    expect(await sdrDesatualizado(banco.db, organizacao)).toBe(false);

    await resumir(resumidorFalso(), { ...RESPOSTAS, acao: "propor_conversa" }, DEPOIS);
    await confirmar(DEPOIS);
    expect(await sdrDesatualizado(banco.db, organizacao)).toBe(true);
    expect(gerador.chamadas).toHaveLength(1);
    const [sdr] = await banco.db.query<{ versao: number }>("select versao from public.sdrs");
    expect(sdr!.versao).toBe(1);

    await gerarSdr({ db: banco.db, gerador }, { ...p, agora: DEPOIS });
    expect(await sdrDesatualizado(banco.db, organizacao)).toBe(false);
    expect(gerador.chamadas[1]!.entrada).toContain("propor uma conversa de 30 minutos com Bia");
  });

  it("sem objetivo (organização de antes do passo), o SDR sai só da análise, como antes", async () => {
    const gerador = geradorFalso();
    await gerarSdr({ db: banco.db, gerador }, { organizacaoId: organizacao, nome: "Duda", operadorId: duda, agora: AGORA });
    expect(gerador.chamadas[0]!.entrada).not.toContain("<objetivo_confirmado>");
    expect(gerador.chamadas[0]!.sistema).not.toContain("objetivo que a pessoa confirmou");
    expect(await sdrDesatualizado(banco.db, organizacao)).toBe(false);
  });

  describe("quem já estava no passo SDR ou além quando o Objetivo chegou não volta", () => {
    async function sdrMontadoAntes(aprovado: boolean) {
      await banco.db.query(
        `insert into public.sdrs (organizacao_id, sdr, aprovado_em) values ($1::uuid, $2::jsonb, $3)`,
        [organizacao, JSON.stringify({ ...GERADO, link_agenda: null }), aprovado ? AGORA : null],
      );
    }

    it("com o SDR montado, sem objetivo, segue no SDR", async () => {
      await sdrMontadoAntes(false);
      const atual = await estado();
      expect(atual.atual).toBe("sdr");
      expect(atual.feitos.has("objetivo")).toBe(true);
    });

    it("com o SDR aprovado, segue na abordagem", async () => {
      await sdrMontadoAntes(true);
      expect((await estado()).atual).toBe("abordagem");
    });

    it("o objetivo continua aberto para editar, sem regerar o SDR", async () => {
      await sdrMontadoAntes(false);
      await resumir(resumidorFalso());
      await confirmar();
      expect((await estado()).atual).toBe("sdr");
      expect(await sdrDesatualizado(banco.db, organizacao)).toBe(true);
    });
  });
});
