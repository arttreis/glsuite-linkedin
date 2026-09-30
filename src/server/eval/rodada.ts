import { decidirResposta, type Consumo, type Desfecho } from "@/server/agente/decidir";
import type { ModeloDeLinguagem, Uso } from "@/server/agente/modelo";
import { custoDaChamada } from "./custo";
import type { AcaoFinal, CasoDoEval } from "./dataset";
import { entradaDoJuiz, promptDoJuiz, type Avaliacao, type Juiz } from "./juiz";
import { CONFIGURACAO_DO_EVAL } from "./perfis";
import { acaoFinal, avaliarCaso, textoDoDesfecho, vaiParaHumano, type Notas } from "./rubrica";

export type Chamada = { etapa: "classificacao" | "rascunho" | "juiz"; modelo: string; uso: Uso; custo: number | null };

/** Uma execução de um caso: o que o agente fez, as notas e quanto custou. */
export type Execucao = {
  caso: string;
  tema: CasoDoEval["tema"];
  praca: CasoDoEval["praca"];
  perfil: CasoDoEval["perfil"];
  repeticao: number;
  categoria: string | null;
  acao: AcaoFinal | null;
  humano: boolean;
  texto: string | null;
  motivo: string | null;
  excecao: string | null;
  notas: Notas | null;
  /** Falha do agente: a execução não conta nota e deixa a rodada inconclusiva. */
  erro: string | null;
  /** Falha do juiz: os critérios dele ficam sem nota e a rodada fica inconclusiva. */
  erroDoJuiz: string | null;
  chamadas: Chamada[];
};

export type OpcoesDaRodada = {
  modelo: ModeloDeLinguagem;
  juiz: Juiz;
  repeticoes?: number;
  concorrencia?: number;
  /** Chamado a cada execução concluída (progresso no terminal). */
  aoConcluir?: (execucao: Execucao, feitas: number, total: number) => void;
};

const mensagemDeErro = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro));

function motivoDo(desfecho: Desfecho): string | null {
  if (desfecho.tipo === "escalar") return desfecho.motivo;
  if (desfecho.tipo === "optout") return desfecho.decisao?.motivo ?? desfecho.excecao ?? null;
  if (desfecho.tipo === "rascunho") return desfecho.decisao.motivo;
  return null;
}

async function executar(caso: CasoDoEval, repeticao: number, opcoes: OpcoesDaRodada): Promise<Execucao> {
  const consumo: Consumo = { modelos: {}, uso: {} };
  const base: Execucao = {
    caso: caso.id,
    tema: caso.tema,
    praca: caso.praca,
    perfil: caso.perfil,
    repeticao,
    categoria: null,
    acao: null,
    humano: false,
    texto: null,
    motivo: null,
    excecao: null,
    notas: null,
    erro: null,
    erroDoJuiz: null,
    chamadas: [],
  };
  const registrarChamadas = () => {
    for (const etapa of ["classificacao", "rascunho"] as const) {
      const modelo = consumo.modelos[etapa];
      const uso = consumo.uso[etapa];
      if (modelo && uso) base.chamadas.push({ etapa, modelo, uso, custo: custoDaChamada(modelo, uso) });
    }
  };

  let desfecho: Desfecho;
  try {
    desfecho = await decidirResposta({ entrada: caso.entrada, modelo: opcoes.modelo, configuracao: CONFIGURACAO_DO_EVAL, consumo });
  } catch (erro) {
    registrarChamadas();
    return { ...base, erro: mensagemDeErro(erro) };
  }
  registrarChamadas();

  const texto = textoDoDesfecho(desfecho);
  const acao = acaoFinal(desfecho);
  let avaliacao: Avaliacao | null = null;
  let erroDoJuiz: string | null = null;
  if (texto) {
    try {
      const julgada = await opcoes.juiz.avaliar({ sistema: promptDoJuiz(), entrada: entradaDoJuiz(caso, { acao, texto }) });
      avaliacao = julgada.saida;
      base.chamadas.push({ etapa: "juiz", modelo: julgada.modelo, uso: julgada.uso, custo: custoDaChamada(julgada.modelo, julgada.uso) });
    } catch (erro) {
      erroDoJuiz = mensagemDeErro(erro);
    }
  }

  return {
    ...base,
    categoria: "classificacao" in desfecho ? (desfecho.classificacao?.categoria ?? null) : null,
    acao,
    humano: vaiParaHumano(desfecho),
    texto,
    motivo: motivoDo(desfecho),
    excecao: desfecho.tipo === "rascunho" ? desfecho.excecao : null,
    notas: avaliarCaso(caso, desfecho, avaliacao),
    erroDoJuiz,
  };
}

/**
 * Roda o agente contra o dataset: cada caso `repeticoes` vezes, com no máximo
 * `concorrencia` execuções em paralelo. Falha de um caso não derruba a rodada.
 */
export async function rodarEval(casos: readonly CasoDoEval[], opcoes: OpcoesDaRodada): Promise<Execucao[]> {
  const repeticoes = Math.max(1, opcoes.repeticoes ?? 1);
  const fila = casos.flatMap((caso) => Array.from({ length: repeticoes }, (_, i) => ({ caso, repeticao: i + 1 })));
  const resultados: Execucao[] = new Array(fila.length);
  let proxima = 0;
  let feitas = 0;

  async function trabalhador() {
    while (proxima < fila.length) {
      const indice = proxima++;
      const { caso, repeticao } = fila[indice]!;
      resultados[indice] = await executar(caso, repeticao, opcoes);
      feitas += 1;
      opcoes.aoConcluir?.(resultados[indice], feitas, fila.length);
    }
  }

  const concorrencia = Math.max(1, Math.min(opcoes.concorrencia ?? 4, fila.length));
  await Promise.all(Array.from({ length: concorrencia }, trabalhador));
  return resultados;
}
