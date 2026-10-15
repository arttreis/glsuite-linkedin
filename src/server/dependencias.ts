import "server-only";
import { z } from "zod";
import { lerEnv } from "@/lib/env";
import { criarModeloClaude } from "@/server/agente/claude";
import type { ModeloDeLinguagem } from "@/server/agente/modelo";
import type { EnviadorDeEmail } from "@/server/alertas/alertas";
import type { AnalistaDeConcorrente } from "@/server/concorrentes/analista";
import { criarAnalistaDeConcorrenteClaude } from "@/server/concorrentes/claude";
import { criarLeitorClaude } from "@/server/oferta/claude";
import type { LeitorDeSite } from "@/server/oferta/leitor";
import { criarAvaliadorClaude } from "@/server/nota/claude";
import type { AvaliadorDeAderencia } from "@/server/nota/avaliador";
import { criarEscritorClaude, criarInterpretadorDeBuscaClaude, criarSugeridorClaude } from "@/server/publicos/claude";
import type { EscritorDeFluxo } from "@/server/publicos/escritor";
import type { InterpretadorDeBusca } from "@/server/publicos/interpretador-de-busca";
import type { SugeridorDePublicos } from "@/server/publicos/sugeridor";
import { criarAjustadorDeSdrClaude, criarGeradorDeSdrClaude } from "@/server/sdr/claude";
import type { GeradorDeSdr } from "@/server/sdr/sdr";
import type { AjustadorDeSdr } from "@/server/sdr/teste";
import { criarEnviadorResend } from "@/server/alertas/resend";
import { criarClienteUnipile, type ClienteUnipile } from "@/server/unipile/cliente";

const envUnipile = lerEnv(
  z.object({
    UNIPILE_DSN: z.string().min(1),
    UNIPILE_API_KEY: z.string().min(1),
    UNIPILE_WEBHOOK_SECRET: z.string().min(16),
  }),
);

let unipile: ClienteUnipile | undefined;

export function obterUnipile(): ClienteUnipile {
  if (!unipile) {
    const env = envUnipile();
    unipile = criarClienteUnipile({ dsn: env.UNIPILE_DSN, apiKey: env.UNIPILE_API_KEY });
  }
  return unipile;
}

/** A Unipile, ou undefined quando o ambiente não tem as chaves (quem chama segue sem ela). */
export function obterUnipileSeConfigurada(): ClienteUnipile | undefined {
  try {
    return obterUnipile();
  } catch {
    return undefined;
  }
}

/** Segredo que a Unipile manda no header `Unipile-Auth` e no callback do hosted auth. */
export function segredoDaUnipile(): string {
  return envUnipile().UNIPILE_WEBHOOK_SECRET;
}

const envAlertas = lerEnv(
  z.object({
    RESEND_API_KEY: z.string().min(1).optional(),
    ALERTA_REMETENTE: z.string().min(3).optional(),
  }),
);

let enviador: EnviadorDeEmail | null | undefined;

/** Enviador de alertas por e-mail, ou null se o Resend não estiver configurado. */
export function obterEnviadorDeEmail(): EnviadorDeEmail | null {
  if (enviador === undefined) {
    const env = envAlertas();
    enviador =
      env.RESEND_API_KEY && env.ALERTA_REMETENTE
        ? criarEnviadorResend({ apiKey: env.RESEND_API_KEY, remetente: env.ALERTA_REMETENTE })
        : null;
  }
  return enviador;
}

const envIa = lerEnv(
  z.object({
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    // Os modelos ficam em variável de ambiente; a troca é decidida pelo eval (§5).
    IA_MODELO_CLASSIFICACAO: z.string().min(1).default("claude-haiku-4-5"),
    IA_MODELO_RASCUNHO: z.string().min(1).default("claude-sonnet-5"),
    IA_ESFORCO_RASCUNHO: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  }),
);

let modelo: ModeloDeLinguagem | null | undefined;

/** Agente de conversa no Claude, ou null sem ANTHROPIC_API_KEY (as mensagens esperam na fila). */
export function obterModeloDeLinguagem(): ModeloDeLinguagem | null {
  if (modelo === undefined) {
    const env = envIa();
    modelo = env.ANTHROPIC_API_KEY
      ? criarModeloClaude({
          apiKey: env.ANTHROPIC_API_KEY,
          modeloClassificacao: env.IA_MODELO_CLASSIFICACAO,
          modeloRascunho: env.IA_MODELO_RASCUNHO,
          esforcoRascunho: env.IA_ESFORCO_RASCUNHO,
        })
      : null;
  }
  return modelo;
}

let leitorDeSite: LeitorDeSite | null | undefined;

/** Leitor do site para o dossiê da oferta, ou null sem ANTHROPIC_API_KEY. */
export function obterLeitorDeSite(): LeitorDeSite | null {
  if (leitorDeSite === undefined) {
    const env = envIa();
    leitorDeSite = env.ANTHROPIC_API_KEY
      ? criarLeitorClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_RASCUNHO, esforco: env.IA_ESFORCO_RASCUNHO })
      : null;
  }
  return leitorDeSite;
}

let analistaDeConcorrente: AnalistaDeConcorrente | null | undefined;

/** Lê o site de um concorrente e compara com a oferta (SDR-68), ou null sem ANTHROPIC_API_KEY. */
export function obterAnalistaDeConcorrente(): AnalistaDeConcorrente | null {
  if (analistaDeConcorrente === undefined) {
    const env = envIa();
    analistaDeConcorrente = env.ANTHROPIC_API_KEY
      ? criarAnalistaDeConcorrenteClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_RASCUNHO, esforco: env.IA_ESFORCO_RASCUNHO })
      : null;
  }
  return analistaDeConcorrente;
}

let sugeridorDePublicos: SugeridorDePublicos | null | undefined;

/** Sugestão de públicos a partir do dossiê, ou null sem ANTHROPIC_API_KEY. */
export function obterSugeridorDePublicos(): SugeridorDePublicos | null {
  if (sugeridorDePublicos === undefined) {
    const env = envIa();
    sugeridorDePublicos = env.ANTHROPIC_API_KEY
      ? criarSugeridorClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_RASCUNHO, esforco: env.IA_ESFORCO_RASCUNHO })
      : null;
  }
  return sugeridorDePublicos;
}

let avaliador: AvaliadorDeAderencia | null | undefined;

/** Nota de aderência no modelo de classificação (Haiku, §5), ou null sem ANTHROPIC_API_KEY. */
export function obterAvaliadorDeAderencia(): AvaliadorDeAderencia | null {
  if (avaliador === undefined) {
    const env = envIa();
    avaliador = env.ANTHROPIC_API_KEY ? criarAvaliadorClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_CLASSIFICACAO }) : null;
  }
  return avaliador;
}

let interpretadorDeBusca: InterpretadorDeBusca | null | undefined;

/** A conversa da busca de leads (SDR-62) no modelo de classificação, ou null sem ANTHROPIC_API_KEY. */
export function obterInterpretadorDeBusca(): InterpretadorDeBusca | null {
  if (interpretadorDeBusca === undefined) {
    const env = envIa();
    interpretadorDeBusca = env.ANTHROPIC_API_KEY
      ? criarInterpretadorDeBuscaClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_CLASSIFICACAO })
      : null;
  }
  return interpretadorDeBusca;
}

let escritorDeFluxo: EscritorDeFluxo | null | undefined;

/** Escreve os textos do fluxo do público (§4.14), ou null sem ANTHROPIC_API_KEY. */
export function obterEscritorDeFluxo(): EscritorDeFluxo | null {
  if (escritorDeFluxo === undefined) {
    const env = envIa();
    escritorDeFluxo = env.ANTHROPIC_API_KEY
      ? criarEscritorClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_RASCUNHO, esforco: env.IA_ESFORCO_RASCUNHO })
      : null;
  }
  return escritorDeFluxo;
}

let geradorDeSdr: GeradorDeSdr | null | undefined;

/** Gera o SDR a partir da análise (§4.3), ou null sem ANTHROPIC_API_KEY. */
export function obterGeradorDeSdr(): GeradorDeSdr | null {
  if (geradorDeSdr === undefined) {
    const env = envIa();
    geradorDeSdr = env.ANTHROPIC_API_KEY
      ? criarGeradorDeSdrClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_RASCUNHO, esforco: env.IA_ESFORCO_RASCUNHO })
      : null;
  }
  return geradorDeSdr;
}

let ajustadorDeSdr: AjustadorDeSdr | null | undefined;

/** Ajusta o SDR no chat de teste (§4.3), ou null sem ANTHROPIC_API_KEY. */
export function obterAjustadorDeSdr(): AjustadorDeSdr | null {
  if (ajustadorDeSdr === undefined) {
    const env = envIa();
    ajustadorDeSdr = env.ANTHROPIC_API_KEY
      ? criarAjustadorDeSdrClaude({ apiKey: env.ANTHROPIC_API_KEY, modelo: env.IA_MODELO_RASCUNHO, esforco: env.IA_ESFORCO_RASCUNHO })
      : null;
  }
  return ajustadorDeSdr;
}

const envCron = lerEnv(z.object({ CRON_SECRET: z.string().min(16) }));

/** Segredo do tick: a Vercel Cron manda em `Authorization: Bearer`; o pg_cron também. */
export function segredoDoCron(): string {
  return envCron().CRON_SECRET;
}
