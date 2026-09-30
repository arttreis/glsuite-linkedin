import type { Praca } from "@/domain/validador";
import type { Execucao } from "./rodada";
import { CRITERIOS, LIMIARES, NOMES_DOS_CRITERIOS, type Criterio } from "./rubrica";

/** Casos mínimos por praça para a rodada valer (§7.1: 30+ conversas por praça). */
export const CASOS_MINIMOS_POR_PRACA = 30;

export type Veredito = "aprovado" | "reprovado" | "inconclusivo";

export type ResumoDoCriterio = {
  /** Execuções em que o critério se aplica. */
  n: number;
  acertos: number;
  /** acertos / n; null sem nenhuma execução avaliada. */
  taxa: number | null;
  /** Média da nota de 0 a 1 (difere da taxa só no tom). */
  notaMedia: number | null;
  limiar: number;
  passou: boolean | null;
};

export type Custo = {
  total: number;
  agente: number;
  juiz: number;
  porExecucao: number;
  /** Modelos que não estão na tabela de preços: o custo deles ficou de fora. */
  semPreco: string[];
};

export type ResumoDaPraca = {
  praca: Praca;
  casos: number;
  execucoes: number;
  erros: number;
  errosDoJuiz: number;
  criterios: Record<Criterio, ResumoDoCriterio>;
  custo: Custo;
  veredito: Veredito;
  motivos: string[];
};

export type Relatorio = {
  geradoEm: string;
  versaoDosPrompts: string;
  versaoDoJuiz: string;
  modelos: { classificacao: string; rascunho: string; juiz: string };
  repeticoes: number;
  veredito: Veredito;
  pracas: ResumoDaPraca[];
  geral: Record<Criterio, ResumoDoCriterio>;
  custo: Custo;
  execucoes: Execucao[];
};

const ORDEM_DAS_PRACAS: Praca[] = ["domestico", "canada", "espanha"];
export const NOMES_DAS_PRACAS: Record<Praca, string> = { domestico: "Brasil", canada: "Canadá", espanha: "Espanha" };

function resumirCriterios(execucoes: readonly Execucao[]): Record<Criterio, ResumoDoCriterio> {
  const resumo = {} as Record<Criterio, ResumoDoCriterio>;
  for (const criterio of CRITERIOS) {
    const notas = execucoes.map((e) => e.notas?.[criterio]).filter((n) => n != null);
    const acertos = notas.filter((n) => n.passou).length;
    const taxa = notas.length > 0 ? acertos / notas.length : null;
    resumo[criterio] = {
      n: notas.length,
      acertos,
      taxa,
      notaMedia: notas.length > 0 ? notas.reduce((soma, n) => soma + n.nota, 0) / notas.length : null,
      limiar: LIMIARES[criterio],
      passou: taxa === null ? null : taxa >= LIMIARES[criterio],
    };
  }
  return resumo;
}

function somarCusto(execucoes: readonly Execucao[]): Custo {
  let agente = 0;
  let juiz = 0;
  const semPreco = new Set<string>();
  for (const chamada of execucoes.flatMap((e) => e.chamadas)) {
    if (chamada.custo === null) semPreco.add(chamada.modelo);
    else if (chamada.etapa === "juiz") juiz += chamada.custo;
    else agente += chamada.custo;
  }
  return {
    total: agente + juiz,
    agente,
    juiz,
    porExecucao: execucoes.length > 0 ? (agente + juiz) / execucoes.length : 0,
    semPreco: [...semPreco].sort(),
  };
}

function resumirPraca(praca: Praca, execucoes: readonly Execucao[]): ResumoDaPraca {
  const criterios = resumirCriterios(execucoes);
  const casos = new Set(execucoes.map((e) => e.caso)).size;
  const erros = execucoes.filter((e) => e.erro !== null).length;
  const errosDoJuiz = execucoes.filter((e) => e.erroDoJuiz !== null).length;

  const motivos: string[] = [];
  const reprovados = CRITERIOS.filter((c) => criterios[c].passou === false);
  for (const c of reprovados) {
    motivos.push(`${NOMES_DOS_CRITERIOS[c]}: ${pct(criterios[c].taxa)} (mínimo ${pct(LIMIARES[c])})`);
  }
  const inconclusivo: string[] = [];
  if (casos < CASOS_MINIMOS_POR_PRACA) inconclusivo.push(`${casos} casos (mínimo ${CASOS_MINIMOS_POR_PRACA})`);
  if (erros > 0) inconclusivo.push(`${erros} execução(ões) com erro do agente`);
  if (errosDoJuiz > 0) inconclusivo.push(`${errosDoJuiz} execução(ões) com erro do juiz`);
  motivos.push(...inconclusivo);

  return {
    praca,
    casos,
    execucoes: execucoes.length,
    erros,
    errosDoJuiz,
    criterios,
    custo: somarCusto(execucoes),
    // Reprovado vence inconclusivo: o que falhou já falhou, mesmo com erros no resto.
    veredito: reprovados.length > 0 ? "reprovado" : inconclusivo.length > 0 ? "inconclusivo" : "aprovado",
    motivos,
  };
}

export function montarRelatorio(p: {
  execucoes: Execucao[];
  versaoDosPrompts: string;
  versaoDoJuiz: string;
  modelos: Relatorio["modelos"];
  repeticoes: number;
  agora: Date;
}): Relatorio {
  const pracas = ORDEM_DAS_PRACAS.filter((praca) => p.execucoes.some((e) => e.praca === praca)).map((praca) =>
    resumirPraca(
      praca,
      p.execucoes.filter((e) => e.praca === praca),
    ),
  );
  const vereditos = pracas.map((r) => r.veredito);
  const veredito: Veredito =
    vereditos.length === 0
      ? "inconclusivo"
      : vereditos.includes("reprovado")
        ? "reprovado"
        : vereditos.includes("inconclusivo")
          ? "inconclusivo"
          : "aprovado";
  return {
    geradoEm: p.agora.toISOString(),
    versaoDosPrompts: p.versaoDosPrompts,
    versaoDoJuiz: p.versaoDoJuiz,
    modelos: p.modelos,
    repeticoes: p.repeticoes,
    veredito,
    pracas,
    geral: resumirCriterios(p.execucoes),
    custo: somarCusto(p.execucoes),
    execucoes: p.execucoes,
  };
}

function pct(valor: number | null): string {
  return valor === null ? "—" : `${(valor * 100).toFixed(0)}%`;
}

const usd = (valor: number) => `US$ ${valor.toFixed(valor < 1 ? 4 : 2)}`;
const ROTULO: Record<Veredito, string> = { aprovado: "✅ aprovado", reprovado: "❌ reprovado", inconclusivo: "⚠️ inconclusivo" };

function celula(resumo: ResumoDoCriterio): string {
  if (resumo.taxa === null) return "—";
  const marca = resumo.passou ? "" : " ❌";
  return `${pct(resumo.taxa)} (${resumo.acertos}/${resumo.n})${marca}`;
}

const umaLinha = (texto: string) => texto.replace(/\s+/g, " ").trim();

/** Relatório em Markdown: vai para o resumo do job no CI e para o arquivo da rodada. */
export function relatorioEmMarkdown(r: Relatorio): string {
  const linhas: string[] = [];
  linhas.push(`# Eval de conversas · ${ROTULO[r.veredito]}`, "");
  linhas.push(
    `Prompts \`${r.versaoDosPrompts}\` · juiz \`${r.versaoDoJuiz}\` · classificação \`${r.modelos.classificacao}\` · rascunho \`${r.modelos.rascunho}\` · juiz \`${r.modelos.juiz}\``,
    "",
    `${r.execucoes.length} execuções (${r.repeticoes} por caso) em ${r.geradoEm.slice(0, 16).replace("T", " ")} UTC. **Custo da rodada: ${usd(r.custo.total)}** (agente ${usd(r.custo.agente)}, juiz ${usd(r.custo.juiz)}; ${usd(r.custo.porExecucao)} por execução).`,
    "",
  );
  if (r.custo.semPreco.length > 0) {
    linhas.push(`> Sem preço na tabela, fora do custo: ${r.custo.semPreco.map((m) => `\`${m}\``).join(", ")}.`, "");
  }

  linhas.push("## Por critério e por praça", "");
  const cabecalho = ["Critério", "Mínimo", ...r.pracas.map((p) => NOMES_DAS_PRACAS[p.praca]), "Geral"];
  linhas.push(`| ${cabecalho.join(" | ")} |`, `|${cabecalho.map(() => "---").join("|")}|`);
  for (const c of CRITERIOS) {
    const valores = [NOMES_DOS_CRITERIOS[c], pct(LIMIARES[c]), ...r.pracas.map((p) => celula(p.criterios[c])), celula(r.geral[c])];
    linhas.push(`| ${valores.join(" | ")} |`);
  }
  linhas.push(
    `| Nota média de tom (0 a 1) | — | ${r.pracas.map((p) => p.criterios.tom.notaMedia?.toFixed(2) ?? "—").join(" | ")} | ${r.geral.tom.notaMedia?.toFixed(2) ?? "—"} |`,
    `| Casos | ${CASOS_MINIMOS_POR_PRACA} | ${r.pracas.map((p) => p.casos).join(" | ")} | ${r.pracas.reduce((s, p) => s + p.casos, 0)} |`,
    `| Custo | — | ${r.pracas.map((p) => usd(p.custo.total)).join(" | ")} | ${usd(r.custo.total)} |`,
    `| **Veredito** | | ${r.pracas.map((p) => ROTULO[p.veredito]).join(" | ")} | ${ROTULO[r.veredito]} |`,
    "",
  );

  for (const p of r.pracas.filter((p) => p.motivos.length > 0)) {
    linhas.push(`- **${NOMES_DAS_PRACAS[p.praca]}:** ${p.motivos.join("; ")}.`);
  }
  if (r.pracas.some((p) => p.motivos.length > 0)) linhas.push("");

  const falhas = r.execucoes.filter(
    (e) => e.erro !== null || e.erroDoJuiz !== null || CRITERIOS.some((c) => e.notas?.[c]?.passou === false),
  );
  linhas.push(`## Falhas (${falhas.length})`, "");
  if (falhas.length === 0) linhas.push("Nenhuma.", "");
  for (const e of falhas) {
    const rotulo = `**${e.caso}**${r.repeticoes > 1 ? ` #${e.repeticao}` : ""} · ${e.tema} · ${e.acao ?? "sem ação"}${e.humano ? " (com humano)" : ""}`;
    linhas.push(`- ${rotulo}`);
    if (e.erro) linhas.push(`  - erro do agente: ${umaLinha(e.erro)}`);
    if (e.erroDoJuiz) linhas.push(`  - erro do juiz: ${umaLinha(e.erroDoJuiz)}`);
    for (const c of CRITERIOS) {
      const nota = e.notas?.[c];
      if (nota && !nota.passou) linhas.push(`  - ${NOMES_DOS_CRITERIOS[c]}: ${umaLinha(nota.motivo)}`);
    }
    if (e.texto) linhas.push(`  - texto: "${umaLinha(e.texto)}"`);
  }
  return `${linhas.join("\n").trimEnd()}\n`;
}
