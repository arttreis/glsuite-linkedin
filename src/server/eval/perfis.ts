import type { Configuracao } from "@/server/configuracoes";
import type { EntradaDoAgente } from "@/server/agente/decidir";

/**
 * Perfis do eval: os mesmos valores do seed (migration 20260929150200), com a
 * voz padrão da praça. O eval não lê o banco, então um perfil com voz ou regras
 * próprias no painel precisa de um caso aqui para ser avaliado com elas.
 */
export const PERFIS_DO_EVAL = {
  arthur: {
    nome: "Arthur",
    praca: "domestico",
    idioma: "pt",
    voz: null,
    regras: null,
    palavrasProibidas: ["agência", "marketing", "growth", "tráfego"],
    rodape: null,
    limiteNotaConvite: 300,
  },
  juliano: {
    nome: "Juliano",
    praca: "domestico",
    idioma: "pt",
    voz: null,
    regras: null,
    palavrasProibidas: ["agência", "marketing", "growth", "tráfego"],
    rodape: null,
    limiteNotaConvite: 300,
  },
  luiz: {
    nome: "Luiz",
    praca: "canada",
    idioma: "en",
    voz: null,
    regras: null,
    palavrasProibidas: ["agency", "marketing", "growth", "traffic"],
    rodape: "or tell me to stop and I will",
    limiteNotaConvite: 300,
  },
  jp: {
    nome: "JP",
    praca: "espanha",
    idioma: "es",
    voz: null,
    regras: null,
    palavrasProibidas: ["agencia", "marketing", "growth", "tráfico"],
    rodape: null,
    limiteNotaConvite: 300,
  },
} as const satisfies Record<string, EntradaDoAgente["perfil"]>;

export type SlugDoEval = keyof typeof PERFIS_DO_EVAL;

/** Link de agenda e responsável pela discovery (decisão D1: Juliano). */
export const DISCOVERY_DO_EVAL = { responsavel: "Juliano", linkDeAgenda: "https://cal.com/juliano-guessless/30min" };

/** Oferta vigente do seed. */
export const OFERTA_DO_EVAL = "Diagnóstico gratuito de 30 minutos sobre margem por canal de venda.";

/** Limiares do agente do seed: o eval mede o agente como ele roda em produção. */
export const CONFIGURACAO_DO_EVAL: Configuracao<"agente"> = {
  limiar_optout: 0.8,
  limiar_confianca: 0.7,
  atraso_minutos: [3, 10],
};
