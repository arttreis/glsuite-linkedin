import { z } from "zod";
import { ORIGENS_DO_CONTATO } from "./contatos";
import { COLUNAS_DO_PIPELINE } from "./pipeline";

/**
 * O filtro de contatos (§4.15): a lista de Contatos, a tag em massa e, depois,
 * os segmentos (§4.17) usam o mesmo filtro e o mesmo SQL, para que "todos do
 * filtro" seja exatamente o que a tela mostrou.
 */

export const CANAIS_DO_FILTRO = ["whatsapp", "linkedin"] as const;
export type CanalDoFiltro = (typeof CANAIS_DO_FILTRO)[number];

export const ROTULO_DO_CANAL_DO_FILTRO: Record<CanalDoFiltro, string> = {
  whatsapp: "podem receber pelo WhatsApp",
  linkedin: "são leads do LinkedIn",
};

export const SITUACOES = ["podem", "nao_contatar", "todos"] as const;
export type Situacao = (typeof SITUACOES)[number];

const ids = z.array(z.uuid()).max(50).default([]);

const ETAPAS = COLUNAS_DO_PIPELINE.map((coluna) => coluna.id) as [ColunaId, ...ColunaId[]];
type ColunaId = (typeof COLUNAS_DO_PIPELINE)[number]["id"];

/** Do LinkedIn (§4.17): um lead da pessoa cumpre tudo junto (etapa do Pipeline, campanha e nota). */
const esquemaDoLinkedin = z.object({
  etapas: z.array(z.enum(ETAPAS)).max(ETAPAS.length).default([]),
  campanhas: ids,
  notaMinima: z.number().int().min(0).max(100).nullable().default(null),
});

export const esquemaDoFiltro = z.object({
  texto: z.string().trim().max(100).optional(),
  tags: z.object({ todas: ids, alguma: ids, nenhuma: ids }).default({ todas: [], alguma: [], nenhuma: [] }),
  canal: z.enum(CANAIS_DO_FILTRO).optional(),
  origens: z.array(z.enum(ORIGENS_DO_CONTATO)).max(ORIGENS_DO_CONTATO.length).default([]),
  linkedin: esquemaDoLinkedin.default({ etapas: [], campanhas: [], notaMinima: null }),
  /** Entrou a partir deste dia (AAAA-MM-DD, no horário de Brasília). */
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Quem pode ser contatado (padrão), quem pediu para não ser, ou todos. */
  situacao: z.enum(SITUACOES).default("podem"),
});

export type FiltroDeContatos = z.infer<typeof esquemaDoFiltro>;

export const FILTRO_VAZIO: FiltroDeContatos = esquemaDoFiltro.parse({});

/** Lê o filtro de qualquer lugar (formulário, JSON salvo): o que não valer vira o padrão. */
export function lerFiltro(valor: unknown): FiltroDeContatos {
  const lido = esquemaDoFiltro.safeParse(valor ?? {});
  return lido.success ? lido.data : FILTRO_VAZIO;
}

/** `%` e `_` no texto da busca são texto, não curinga. */
const semCuringas = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

export type SqlDoFiltro = { condicoes: string[]; parametros: unknown[] };

/**
 * As condições do filtro sobre `public.contatos c`, em SQL parametrizado: os
 * valores vão em `parametros`, numerados a partir de `primeiro`, e nunca no
 * texto. Quem chama junta com `and` e põe a organização.
 */
export function sqlDoFiltro(filtro: FiltroDeContatos, primeiro: number): SqlDoFiltro {
  const condicoes: string[] = [];
  const parametros: unknown[] = [];
  const p = (valor: unknown) => {
    parametros.push(valor);
    return `$${primeiro + parametros.length - 1}`;
  };

  const texto = filtro.texto?.trim();
  if (texto) {
    const padrao = p(`%${semCuringas(texto)}%`);
    const digitos = texto.replace(/\D/g, "");
    const porTelefone = digitos.length >= 4 ? ` or c.telefone like ${p(`%${digitos}%`)}` : "";
    condicoes.push(
      `(c.nome ilike ${padrao} or c.empresa ilike ${padrao} or c.cargo ilike ${padrao} or c.email ilike ${padrao}${porTelefone})`,
    );
  }
  if (filtro.tags.todas.length > 0) {
    const todas = p(filtro.tags.todas);
    condicoes.push(
      `(select count(distinct ct.tag_id) from public.contato_tags ct where ct.contato_id = c.id and ct.tag_id = any(${todas}::uuid[])) = cardinality(${todas}::uuid[])`,
    );
  }
  if (filtro.tags.alguma.length > 0) {
    condicoes.push(`exists (select 1 from public.contato_tags ct where ct.contato_id = c.id and ct.tag_id = any(${p(filtro.tags.alguma)}::uuid[]))`);
  }
  if (filtro.tags.nenhuma.length > 0) {
    condicoes.push(`not exists (select 1 from public.contato_tags ct where ct.contato_id = c.id and ct.tag_id = any(${p(filtro.tags.nenhuma)}::uuid[]))`);
  }
  if (filtro.canal === "whatsapp") condicoes.push(PODE_RECEBER_PELO_WHATSAPP);
  if (filtro.canal === "linkedin") condicoes.push("c.pessoa_id is not null");
  if (filtro.origens.length > 0) condicoes.push(`c.origem = any(${p(filtro.origens)}::text[])`);
  const { etapas, campanhas, notaMinima } = filtro.linkedin;
  if (etapas.length > 0 || campanhas.length > 0 || notaMinima !== null) {
    const doLead = ["l.pessoa_id = c.pessoa_id"];
    if (etapas.length > 0) doLead.push(`l.estado = any(${p(estadosDasEtapas(etapas))}::text[])`);
    if (campanhas.length > 0) doLead.push(`l.campanha_id = any(${p(campanhas)}::uuid[])`);
    if (notaMinima !== null) doLead.push(`l.nota >= ${p(notaMinima)}::int`);
    condicoes.push(`exists (select 1 from public.leads l where ${doLead.join(" and ")})`);
  }
  if (filtro.desde) condicoes.push(`c.criado_em >= (${p(filtro.desde)}::date::timestamp at time zone 'America/Sao_Paulo')`);
  if (filtro.situacao === "podem") condicoes.push("c.nao_contatar_em is null");
  if (filtro.situacao === "nao_contatar") condicoes.push("c.nao_contatar_em is not null");
  return { condicoes, parametros };
}

function estadosDasEtapas(etapas: readonly ColunaId[]): string[] {
  return COLUNAS_DO_PIPELINE.filter((coluna) => etapas.includes(coluna.id)).flatMap((coluna) => [...coluna.estados]);
}

/** Tem telefone, autorizou o WhatsApp e não saiu dele (§4.15 e §4.19). */
export const PODE_RECEBER_PELO_WHATSAPP = "(c.telefone is not null and c.whatsapp_autorizado_em is not null and c.whatsapp_saiu_em is null)";

/** O filtro em português, para a tela e para o segmento (§4.17). `nomes`: o nome de cada tag e campanha pelo id. */
export function descreverFiltro(filtro: FiltroDeContatos, nomes: ReadonlyMap<string, string>): string {
  const lista = (idsDasTags: string[]) => idsDasTags.map((id) => nomes.get(id) ?? "(tag apagada)").join(", ");
  const partes: string[] = [];
  if (filtro.tags.todas.length > 0) partes.push(`${filtro.tags.todas.length === 1 ? "com a tag" : "com todas as tags"} ${lista(filtro.tags.todas)}`);
  if (filtro.tags.alguma.length > 0) partes.push(`${filtro.tags.alguma.length === 1 ? "com a tag" : "com pelo menos uma das tags"} ${lista(filtro.tags.alguma)}`);
  if (filtro.tags.nenhuma.length > 0) partes.push(`${filtro.tags.nenhuma.length === 1 ? "sem a tag" : "sem nenhuma das tags"} ${lista(filtro.tags.nenhuma)}`);
  if (filtro.origens.length > 0) partes.push(`que vieram de ${filtro.origens.map((o) => ROTULO_DE_ORIGEM_NO_TEXTO[o]).join(" ou ")}`);
  if (filtro.canal) partes.push(`que ${ROTULO_DO_CANAL_DO_FILTRO[filtro.canal]}`);
  const { etapas, campanhas, notaMinima } = filtro.linkedin;
  if (etapas.length > 0) {
    const rotulos = COLUNAS_DO_PIPELINE.filter((coluna) => etapas.includes(coluna.id)).map((coluna) => coluna.rotulo);
    partes.push(`que estão em ${rotulos.join(" ou ")} no Pipeline`);
  }
  if (campanhas.length > 0) partes.push(`${campanhas.length === 1 ? "da campanha" : "das campanhas"} ${campanhas.map((id) => nomes.get(id) ?? "(campanha apagada)").join(", ")}`);
  if (notaMinima !== null) partes.push(`com nota de aderência a partir de ${notaMinima}`);
  if (filtro.texto?.trim()) partes.push(`com "${filtro.texto.trim()}" no nome, na empresa, no cargo ou no contato`);
  if (filtro.desde) partes.push(`que entraram a partir de ${filtro.desde.split("-").reverse().join("/")}`);
  const inicio = filtro.situacao === "nao_contatar" ? "Contatos que pediram para não ser contatados" : filtro.situacao === "todos" ? "Todos os contatos" : "Contatos";
  if (partes.length === 0) return filtro.situacao === "podem" ? "Todos os contatos que podem ser contatados" : inicio;
  return `${inicio} ${juntar(partes)}`;
}

const ROTULO_DE_ORIGEM_NO_TEXTO: Record<(typeof ORIGENS_DO_CONTATO)[number], string> = {
  linkedin: "LinkedIn",
  importacao: "importação",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

const juntar = (partes: string[]) => (partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`);

/** O filtro de um segmento (§4.17): quem pediu para não ser contatado nunca está nele. */
export function filtroDoSegmento(valor: unknown): FiltroDeContatos {
  return { ...lerFiltro(valor), situacao: "podem" };
}

/** O filtro não tem nenhuma condição: o segmento seria a base inteira. */
export function semCondicao(filtro: FiltroDeContatos): boolean {
  const { tags, linkedin } = filtro;
  return (
    !filtro.texto?.trim() &&
    tags.todas.length + tags.alguma.length + tags.nenhuma.length === 0 &&
    !filtro.canal &&
    filtro.origens.length === 0 &&
    linkedin.etapas.length + linkedin.campanhas.length === 0 &&
    linkedin.notaMinima === null &&
    !filtro.desde
  );
}
