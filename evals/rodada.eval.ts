/**
 * Eval de conversas (SDR-16, §7.1). Roda com `pnpm eval`.
 *
 * Rodada: o agente (os mesmos prompts e regras da produção) responde cada caso
 * do dataset, o juiz dá nota, e o relatório sai por critério e por praça, com o
 * custo. Falha se alguma praça for reprovada ou se houver erro de execução.
 *
 * Calibração: com EVAL_REVISAO=<pasta da rodada>, lê o `revisao.json`
 * preenchido por um humano, recalcula o veredito com as notas humanas e mede a
 * concordância com o juiz. Não chama a API.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lerEnv } from "@/lib/env";
import { criarJuizClaude, criarModeloClaude } from "@/server/agente/claude";
import { VERSAO_DOS_PROMPTS } from "@/server/agente/prompts";
import { aplicarRevisao, CRITERIOS_DO_JUIZ, modeloDeRevisao, revisao } from "@/server/eval/calibracao";
import { carregarDataset } from "@/server/eval/dataset";
import { VERSAO_DO_JUIZ } from "@/server/eval/juiz";
import { montarRelatorio, relatorioEmMarkdown, type Relatorio } from "@/server/eval/relatorio";
import { rodarEval } from "@/server/eval/rodada";
import { NOMES_DOS_CRITERIOS } from "@/server/eval/rubrica";

const esforco = z.enum(["low", "medium", "high", "xhigh", "max"]);
const lista = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []));

const envDoEval = lerEnv(
  z.object({
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    IA_MODELO_CLASSIFICACAO: z.string().min(1).default("claude-haiku-4-5"),
    IA_MODELO_RASCUNHO: z.string().min(1).default("claude-sonnet-5"),
    IA_ESFORCO_RASCUNHO: esforco.default("medium"),
    EVAL_MODELO_JUIZ: z.string().min(1).default("claude-opus-5-5"),
    EVAL_ESFORCO_JUIZ: esforco.default("medium"),
    EVAL_REPETICOES: z.coerce.number().int().min(1).max(5).default(1),
    EVAL_CONCORRENCIA: z.coerce.number().int().min(1).max(16).default(4),
    /** Filtra por praça (domestico, canada, espanha) ou por id de caso. Rodada filtrada fica inconclusiva. */
    EVAL_PRACAS: lista,
    EVAL_CASOS: lista,
    EVAL_SAIDA: z.string().default(path.join("evals", "relatorios")),
    EVAL_REVISAO: z.string().optional(),
    GITHUB_STEP_SUMMARY: z.string().optional(),
  }),
);

async function publicar(pasta: string, relatorio: Relatorio, markdown: string) {
  await mkdir(pasta, { recursive: true });
  await writeFile(path.join(pasta, "relatorio.json"), `${JSON.stringify(relatorio, null, 2)}\n`);
  await writeFile(path.join(pasta, "relatorio.md"), markdown);
  const resumo = envDoEval().GITHUB_STEP_SUMMARY;
  if (resumo) await appendFile(resumo, `${markdown}\n`);
  console.log(`\n${markdown}\nRelatório em ${pasta}`);
}

const env = envDoEval();

describe.runIf(!env.EVAL_REVISAO)("eval de conversas (§7.1)", () => {
  it("roda o agente contra o dataset e gera o relatório", async () => {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn("ANTHROPIC_API_KEY ausente: eval não rodou.");
      return;
    }
    const todos = await carregarDataset();
    const casos = todos.filter(
      (c) =>
        (env.EVAL_PRACAS.length === 0 || env.EVAL_PRACAS.includes(c.praca)) &&
        (env.EVAL_CASOS.length === 0 || env.EVAL_CASOS.includes(c.id)),
    );
    expect(casos.length, "nenhum caso depois dos filtros").toBeGreaterThan(0);

    const modelo = criarModeloClaude({
      apiKey: env.ANTHROPIC_API_KEY,
      modeloClassificacao: env.IA_MODELO_CLASSIFICACAO,
      modeloRascunho: env.IA_MODELO_RASCUNHO,
      esforcoRascunho: env.IA_ESFORCO_RASCUNHO,
    });
    const juiz = criarJuizClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.EVAL_MODELO_JUIZ, esforco: env.EVAL_ESFORCO_JUIZ });

    const inicio = new Date();
    const execucoes = await rodarEval(casos, {
      modelo,
      juiz,
      repeticoes: env.EVAL_REPETICOES,
      concorrencia: env.EVAL_CONCORRENCIA,
      aoConcluir: (e, feitas, total) =>
        console.log(`[${feitas}/${total}] ${e.caso} ${e.acao ?? "erro"}${e.erro ? `: ${e.erro}` : ""}`),
    });
    const relatorio = montarRelatorio({
      execucoes,
      versaoDosPrompts: VERSAO_DOS_PROMPTS,
      versaoDoJuiz: VERSAO_DO_JUIZ,
      modelos: { classificacao: env.IA_MODELO_CLASSIFICACAO, rascunho: env.IA_MODELO_RASCUNHO, juiz: env.EVAL_MODELO_JUIZ },
      repeticoes: env.EVAL_REPETICOES,
      agora: new Date(),
    });

    const carimbo = inicio.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    const pasta = path.join(env.EVAL_SAIDA, `${carimbo}-${VERSAO_DOS_PROMPTS}`);
    await publicar(pasta, relatorio, relatorioEmMarkdown(relatorio));
    await writeFile(path.join(pasta, "revisao.json"), `${JSON.stringify(modeloDeRevisao(execucoes), null, 2)}\n`);

    expect(execucoes.filter((e) => e.erro || e.erroDoJuiz).map((e) => `${e.caso}: ${e.erro ?? e.erroDoJuiz}`)).toEqual([]);
    expect(relatorio.veredito, relatorio.pracas.flatMap((p) => p.motivos).join("; ")).not.toBe("reprovado");
  });
});

describe.runIf(!!env.EVAL_REVISAO)("calibração do juiz pela revisão humana (§7.1)", () => {
  it("aplica a revisão e mede a concordância", async () => {
    const pasta = env.EVAL_REVISAO!;
    const original = JSON.parse(await readFile(path.join(pasta, "relatorio.json"), "utf8")) as Relatorio;
    const dados = revisao.parse(JSON.parse(await readFile(path.join(pasta, "revisao.json"), "utf8")));
    const { relatorio, concordancia } = aplicarRevisao(original, dados, new Date());

    const linhas = [
      "## Concordância juiz × revisão humana",
      "",
      "| Critério | Revisadas | Concordância |",
      "|---|---|---|",
      ...CRITERIOS_DO_JUIZ.map((c) => {
        const { revisadas, taxa } = concordancia[c];
        return `| ${NOMES_DOS_CRITERIOS[c]} | ${revisadas} | ${taxa === null ? "—" : `${(taxa * 100).toFixed(0)}%`} |`;
      }),
      "",
    ];
    const markdown = relatorioEmMarkdown(relatorio).replace("\n## Por critério", `\n${linhas.join("\n")}\n## Por critério`);
    await publicar(path.join(pasta, "revisado"), relatorio, markdown);
    await writeFile(path.join(pasta, "revisado", "concordancia.json"), `${JSON.stringify(concordancia, null, 2)}\n`);
  });
});
