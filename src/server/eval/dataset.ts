import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { EntradaDoAgente } from "@/server/agente/decidir";
import type { MensagemDoHistorico } from "@/server/agente/prompts";
import { DISCOVERY_DO_EVAL, OFERTA_DO_EVAL, PERFIS_DO_EVAL, type SlugDoEval } from "./perfis";

/**
 * Dataset do eval (§7.1): conversas simuladas por praça, cada uma terminando
 * numa mensagem do prospect, com o que se espera do agente.
 */

/** Ação final do agente, já com as regras duras aplicadas. "nenhuma" é ausência automática. */
export const ACOES_FINAIS = ["responder", "propor_reuniao", "encerrar", "registrar_optout", "escalar_humano", "nenhuma"] as const;
export type AcaoFinal = (typeof ACOES_FINAIS)[number];

/** As objeções da §7.1: todas precisam aparecer em cada praça. */
export const TEMAS_OBRIGATORIOS = [
  "manda_material",
  "ja_tenho_quem_faca",
  "quanto_custa",
  "nao_sou_eu",
  "de_onde_tirou_contato",
  "pare_de_mandar",
  "outro_idioma",
  "monossilabica",
] as const;

export const TEMAS = [
  ...TEMAS_OBRIGATORIOS,
  "interesse",
  "quer_marcar",
  "o_que_e",
  "nao_tem_interesse",
  "fora_do_escritorio",
  "irrelevante",
  "reclamacao",
  "outro_canal",
  "e_robo",
  "agora_nao",
  "pede_resultado",
  "indica_outra_pessoa",
  "optout_ambiguo",
  "experiencia_ruim",
  "perguntas_esgotadas",
] as const;
export type Tema = (typeof TEMAS)[number];

const esperado = z.object({
  /** Ações aceitáveis. */
  acoes: z.array(z.enum(ACOES_FINAIS)).min(1),
  /** A conversa precisa terminar com um humano (escalada ou exceção que segura o envio automático). */
  humano: z.boolean().default(false),
  /** Propor reunião ou mandar o link é aceitável. Padrão: só quando "propor_reuniao" está nas ações. */
  reuniao: z.boolean().optional(),
  /** Idioma da resposta. Padrão: o da última mensagem (o juiz confere). */
  idioma: z.enum(["pt", "en", "es"]).optional(),
});

const caso = z.object({
  id: z.string().regex(/^[a-z]{2}-\d{2}$/),
  tema: z.enum(TEMAS),
  lead: z.object({
    nome: z.string(),
    cargo: z.string().nullable().default(null),
    empresa: z.string().nullable().default(null),
    localizacao: z.string().nullable().default(null),
    angulo: z.string().nullable().default(null),
  }),
  conversa: z
    .array(z.tuple([z.enum(["perfil", "prospect"]), z.string().min(1)]))
    .min(1)
    .refine((c) => c.at(-1)?.[0] === "prospect", "a conversa termina numa mensagem do prospect"),
  esperado,
});

export const arquivoDoDataset = z.object({
  praca: z.enum(["domestico", "canada", "espanha"]),
  perfil: z.enum(Object.keys(PERFIS_DO_EVAL) as [SlugDoEval, ...SlugDoEval[]]),
  campanha: z.string(),
  nicho: z.string().nullable(),
  casos: z.array(caso).min(1),
});
export type ArquivoDoDataset = z.infer<typeof arquivoDoDataset>;

export type Esperado = z.infer<typeof esperado> & { reuniao: boolean };

export type CasoDoEval = {
  id: string;
  tema: Tema;
  praca: ArquivoDoDataset["praca"];
  perfil: SlugDoEval;
  entrada: EntradaDoAgente;
  esperado: Esperado;
};

// Datas fictícias e fixas: o histórico precisa de horário, e o eval precisa ser reprodutível.
const INICIO = Date.parse("2026-10-05T13:00:00Z");
const DIA = 86_400_000;

function historico(conversa: ArquivoDoDataset["casos"][number]["conversa"], nomeDoPerfil: string): MensagemDoHistorico[] {
  return conversa.map(([de, texto], i) => ({
    direcao: de === "prospect" ? "entrada" : "saida",
    autor: de === "prospect" ? "prospect" : nomeDoPerfil,
    texto,
    em: new Date(INICIO + i * 2 * DIA),
  }));
}

/** Converte um arquivo do dataset nos casos que o agente recebe. */
export function casosDoArquivo(arquivo: ArquivoDoDataset): CasoDoEval[] {
  const perfil = PERFIS_DO_EVAL[arquivo.perfil];
  return arquivo.casos.map((c) => ({
    id: c.id,
    tema: c.tema,
    praca: arquivo.praca,
    perfil: arquivo.perfil,
    entrada: {
      perfil: { ...perfil, palavrasProibidas: [...perfil.palavrasProibidas] },
      linkDeAgenda: DISCOVERY_DO_EVAL.linkDeAgenda,
      responsavelDiscovery: DISCOVERY_DO_EVAL.responsavel,
      oferta: OFERTA_DO_EVAL,
      lead: {
        nome: c.lead.nome,
        cargo: c.lead.cargo,
        empresa: c.lead.empresa,
        localizacao: c.lead.localizacao,
        campanha: arquivo.campanha,
        angulo: c.lead.angulo,
        nicho: arquivo.nicho,
        pesquisa: null,
      },
      mensagens: historico(c.conversa, perfil.nome),
    },
    esperado: { ...c.esperado, reuniao: c.esperado.reuniao ?? c.esperado.acoes.includes("propor_reuniao") },
  }));
}

/** Diretório padrão do dataset, na raiz do repositório. */
export const DIRETORIO_DO_DATASET = path.join(process.cwd(), "evals", "conversas");

/** Lê e valida todos os arquivos `*.json` do dataset. Id repetido é erro. */
export async function carregarDataset(diretorio = DIRETORIO_DO_DATASET): Promise<CasoDoEval[]> {
  const nomes = (await readdir(diretorio)).filter((n) => n.endsWith(".json")).sort();
  const casos: CasoDoEval[] = [];
  for (const nome of nomes) {
    const bruto = JSON.parse(await readFile(path.join(diretorio, nome), "utf8"));
    const lido = arquivoDoDataset.safeParse(bruto);
    if (!lido.success) {
      throw new Error(`Dataset inválido em ${nome}: ${lido.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    casos.push(...casosDoArquivo(lido.data));
  }
  const repetidos = casos.map((c) => c.id).filter((id, i, ids) => ids.indexOf(id) !== i);
  if (repetidos.length > 0) throw new Error(`Casos repetidos no dataset: ${[...new Set(repetidos)].join(", ")}`);
  return casos;
}
