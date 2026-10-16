import { z } from "zod";
import type { Db } from "@/server/db/tipos";

/** Parâmetros globais (tabela `configuracoes`), validados na leitura. */
export const ESQUEMAS_DE_CONFIGURACAO = {
  cooldown_empresa_dias: z.number().int().min(0),
  sla_horas_uteis: z.number().positive(),
  convite_expira_dias: z.number().int().positive(),
  pausa_pos_t4_dias: z.number().int().positive(),
  reenvio: z.object({ max_tentativas: z.number().int().positive(), backoff_minutos: z.number().positive() }),
  guardas: z.object({
    aceite_minimo: z.number().min(0).max(1),
    aceite_prazo_dias_uteis: z.number().int().positive(),
    aceite_amostra_minima: z.number().int().positive(),
    aceite_janela_dias_uteis: z.number().int().positive(),
    queda_brusca: z.object({ ativa: z.boolean(), fator: z.number().min(0).max(1), amostra_minima: z.number().int().positive() }),
    erros_limite: z.object({ quantidade: z.number().int().positive(), janela_horas: z.number().positive() }),
  }),
  responsavel_discovery: z.string(),
  alerta_admin_email: z.email().nullable(),
  template_exemplo: z.object({ first_name: z.string(), company: z.string() }),
  leitura_minima_toques: z.number().int().positive(),
  gate_automatico: z.object({
    limiar_edicao: z.number().min(0).max(1),
    dias_em_aprovacao: z.number().int().positive(),
    amostra_minima_aprovacao: z.number().int().min(0),
    limiar_erro: z.number().min(0).max(1),
    janela_erro_dias: z.number().int().positive(),
    amostra_minima_erro: z.number().int().positive(),
  }),
  conta_estavel_minutos: z.number().int().min(0),
  oferta_vigente: z.string(),
  agente: z.object({
    limiar_optout: z.number().min(0).max(1),
    limiar_confianca: z.number().min(0).max(1),
    atraso_minutos: z.tuple([z.number().min(0), z.number().min(0)]),
  }),
  travas: z.object({ dpa_espanha: z.boolean() }),
  pesquisa: z.object({
    max_por_dia: z.number().int().min(0),
    proporcao_personalizada: z.number().min(0).max(1),
  }),
  busca: z.object({ max_perfis_por_dia: z.number().int().min(0) }),
  rd_station: z.object({
    ativo: z.boolean(),
    pipeline_id: z.string().nullable(),
    etapas: z.object({
      "01": z.string().nullable(),
      "02": z.string().nullable(),
      "03": z.string().nullable(),
      "04": z.string().nullable(),
      "05": z.string().nullable(),
    }),
    campos: z.object({
      nicho: z.string().nullable(),
      fonte: z.string().nullable(),
      praca: z.string().nullable(),
      originador: z.string().nullable(),
      angulo: z.string().nullable(),
      dono_conversa: z.string().nullable(),
      data_reuniao: z.string().nullable(),
    }),
    valores: z.object({ fonte: z.string(), praca: z.string() }),
    usuarios: z.record(z.string(), z.string()),
    deal_source_id: z.string().nullable(),
  }),
} as const;

export type ChaveDeConfiguracao = keyof typeof ESQUEMAS_DE_CONFIGURACAO;
export type Configuracao<K extends ChaveDeConfiguracao> = z.infer<(typeof ESQUEMAS_DE_CONFIGURACAO)[K]>;

export async function lerConfiguracao<K extends ChaveDeConfiguracao>(db: Db, chave: K): Promise<Configuracao<K>> {
  const [linha] = await db.query<{ valor: unknown }>("select valor from public.configuracoes where chave = $1", [chave]);
  if (!linha) throw new Error(`Configuração ausente: ${chave}`);
  return ESQUEMAS_DE_CONFIGURACAO[chave].parse(linha.valor) as Configuracao<K>;
}
