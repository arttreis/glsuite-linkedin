import { Temporal } from "temporal-polyfill";
import { instanteLocal } from "./calendario";

/**
 * Lançamentos (§4.21): regras puras. As datas, a fase que sai delas e a
 * leitura dos formulários do lançamento. O painel e o servidor usam as mesmas
 * funções.
 *
 * Sem `server-only`: o formulário e a régua das fases rodam no navegador.
 */

/** O nome vira a tag do lançamento, e tag vai até 40 (§4.16). */
export const MAX_NOME_DO_LANCAMENTO = 40;
export const MAX_PRODUTO_DO_LANCAMENTO = 120;
export const MAX_AULAS = 20;
export const MAX_NOME_DA_AULA = 120;
/** O que mais o SDR precisa saber (§4.21). */
export const MAX_SDR_SABE = 2000;
export const MAX_PRECO = 500;
export const MAX_PERGUNTAS = 20;
export const MAX_PERGUNTA = 200;
export const MAX_RESPOSTA = 1000;
const MAX_LINK = 2000;
/** Encerra sozinho 7 dias depois de o carrinho fechar (§4.21). */
export const DIAS_PARA_ENCERRAR = 7;

/** As datas do formulário são no horário de Brasília, como os disparos. */
export const FUSO_DO_LANCAMENTO = "America/Sao_Paulo";

export type Aula = { nome: string; quando: Date; link: string | null };
export type DatasDoLancamento = { captacaoEm: Date | null; aulas: readonly Aula[]; carrinhoAbreEm: Date | null; carrinhoFechaEm: Date | null };
export type FaseDoLancamento = "sem_datas" | "captacao" | "aulas" | "carrinho" | "encerrado";
export type StatusDoLancamento = "montando" | "no_ar" | "encerrado";
export type PerguntaFrequente = { pergunta: string; resposta: string };

export const ROTULO_DA_FASE: Record<FaseDoLancamento, string> = {
  sem_datas: "Sem datas",
  captacao: "Captação",
  aulas: "Aulas",
  carrinho: "Carrinho aberto",
  encerrado: "Carrinho fechado",
};

export const ROTULO_DO_STATUS: Record<StatusDoLancamento, string> = {
  montando: "Montando",
  no_ar: "No ar",
  encerrado: "Encerrado",
};

const ms = (data: Date) => new Date(data).getTime();
const valida = (data: unknown): data is Date => data instanceof Date && !Number.isNaN(data.getTime());

/**
 * A fase vem das datas (§4.21): captação até a primeira aula, aulas até o
 * carrinho abrir, carrinho até fechar, encerrado depois. O início de cada
 * fase é inclusivo. Sem nenhuma data, não há fase; antes da captação, já é
 * captação.
 */
export function faseDoLancamento(l: DatasDoLancamento, agora: Date): FaseDoLancamento {
  if (!l.captacaoEm && l.aulas.length === 0 && !l.carrinhoAbreEm && !l.carrinhoFechaEm) return "sem_datas";
  const t = agora.getTime();
  if (l.carrinhoFechaEm && t >= ms(l.carrinhoFechaEm)) return "encerrado";
  if (l.carrinhoAbreEm && t >= ms(l.carrinhoAbreEm)) return "carrinho";
  if (l.aulas.length > 0 && t >= ms(l.aulas[0]!.quando)) return "aulas";
  return "captacao";
}

/**
 * O que a §4.21 recusa nas datas, com o motivo, ou null. Só isso: data no
 * passado e captação depois da aula passam.
 */
export function problemaNasDatas(l: DatasDoLancamento): string | null {
  if (l.aulas.some((aula) => !aula.nome?.trim() || !valida(aula.quando))) return "Cada aula precisa de nome e data.";
  for (let i = 1; i < l.aulas.length; i++) {
    if (ms(l.aulas[i]!.quando) <= ms(l.aulas[i - 1]!.quando)) {
      return `As aulas precisam estar em ordem de data: a aula ${i + 1} está antes da aula ${i}.`;
    }
  }
  if (l.carrinhoAbreEm && l.carrinhoFechaEm && ms(l.carrinhoFechaEm) <= ms(l.carrinhoAbreEm)) {
    return "O carrinho fecha antes de abrir. Confira as duas datas.";
  }
  return null;
}

/** Quando o lançamento no ar encerra sozinho: 7 dias depois de o carrinho fechar. */
export function encerraSozinhoEm(l: Pick<DatasDoLancamento, "carrinhoFechaEm">): Date | null {
  if (!l.carrinhoFechaEm) return null;
  return new Date(ms(l.carrinhoFechaEm) + DIAS_PARA_ENCERRAR * 24 * 3_600_000);
}

/** Cada data do lançamento com o rótulo da tela, na ordem do calendário do lançamento. */
export function datasComRotulo(l: DatasDoLancamento): { rotulo: string; em: Date }[] {
  const datas: { rotulo: string; em: Date }[] = [];
  if (l.captacaoEm) datas.push({ rotulo: "Captação começa", em: l.captacaoEm });
  for (const aula of l.aulas) datas.push({ rotulo: `Aula: ${aula.nome}`, em: aula.quando });
  if (l.carrinhoAbreEm) datas.push({ rotulo: "Carrinho abre", em: l.carrinhoAbreEm });
  if (l.carrinhoFechaEm) datas.push({ rotulo: "Carrinho fecha", em: l.carrinhoFechaEm });
  return datas;
}

/** A primeira data que ainda não chegou, com o rótulo; null quando todas passaram. */
export function proximaData(l: DatasDoLancamento, agora: Date): { rotulo: string; em: Date } | null {
  const futuras = datasComRotulo(l).filter((data) => ms(data.em) > agora.getTime());
  if (futuras.length === 0) return null;
  return futuras.reduce((primeira, data) => (ms(data.em) < ms(primeira.em) ? data : primeira));
}

const DIAS_DA_SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const dois = (n: number) => String(n).padStart(2, "0");

/** "qua 22/10 às 20h" (ou "às 20h30"), no horário de Brasília. */
export function quandoNoLancamento(em: Date): string {
  if (!valida(new Date(em))) return "sem data";
  const local = Temporal.Instant.fromEpochMilliseconds(ms(em)).toZonedDateTimeISO(FUSO_DO_LANCAMENTO);
  const hora = local.minute === 0 ? `${local.hour}h` : `${local.hour}h${dois(local.minute)}`;
  return `${DIAS_DA_SEMANA[local.dayOfWeek - 1]} ${dois(local.day)}/${dois(local.month)} às ${hora}`;
}

/** A data como o campo `datetime-local` mostra (`AAAA-MM-DDTHH:mm`), no horário de Brasília. Sem data, vazio. */
export function paraCampoDeData(em: Date | null): string {
  if (!em || !valida(new Date(em))) return "";
  const local = Temporal.Instant.fromEpochMilliseconds(ms(em)).toZonedDateTimeISO(FUSO_DO_LANCAMENTO);
  return `${local.year}-${dois(local.month)}-${dois(local.day)}T${dois(local.hour)}:${dois(local.minute)}`;
}

// --- Leitura dos formulários ------------------------------------------------------

type Lido<T> = { ok: true; dados: T } | { ok: false; erro: string };

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);
const campo = (objeto: unknown, chave: string): unknown =>
  objeto && typeof objeto === "object" ? (objeto as Record<string, unknown>)[chave] : undefined;

/** O campo `datetime-local` (`AAAA-MM-DDTHH:mm`) no horário de Brasília. Vazio é null; o que não é data, undefined. */
function lerData(valor: unknown): Date | null | undefined {
  const bruto = texto(valor);
  if (!bruto) return null;
  const achado = bruto.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!achado) return undefined;
  try {
    return instanteLocal(achado[1]!, achado[2]!, FUSO_DO_LANCAMENTO);
  } catch {
    return undefined;
  }
}

/** Link só `https://`, como o resto dos links que o Kakou manda. Vazio é null; inválido, undefined. */
function lerLink(valor: unknown): string | null | undefined {
  const link = texto(valor);
  if (!link) return null;
  if (!/^https:\/\//i.test(link) || link.length > MAX_LINK || /\s/.test(link)) return undefined;
  try {
    new URL(link);
    return link;
  } catch {
    return undefined;
  }
}

const DATA_INVALIDA = (onde: string) => `A data de "${onde}" não é uma data. Escolha o dia e a hora de novo.`;

/**
 * O formulário do lançamento (§4.21): nome, produto e as datas. O nome vira
 * a tag, então segue a regra dela: sem espaço sobrando, de 1 a 40. Linha de
 * aula toda em branco é ignorada.
 */
export function lerDadosDoLancamento(
  entrada: unknown,
): Lido<{ nome: string; produto: string | null; datas: DatasDoLancamento }> {
  const nomeBruto = campo(entrada, "nome");
  const nome = typeof nomeBruto === "string" ? nomeBruto.replace(/\s+/g, " ").trim() : "";
  if (!nome) return { ok: false, erro: "Dê um nome ao lançamento." };
  if (nome.length > MAX_NOME_DO_LANCAMENTO) {
    return { ok: false, erro: `O nome vai até ${MAX_NOME_DO_LANCAMENTO} caracteres: ele vira a tag de quem entra no lançamento.` };
  }
  const produto = texto(campo(entrada, "produto")).replace(/\s+/g, " ");
  if (produto.length > MAX_PRODUTO_DO_LANCAMENTO) return { ok: false, erro: `O produto vai até ${MAX_PRODUTO_DO_LANCAMENTO} caracteres.` };

  const captacaoEm = lerData(campo(entrada, "captacaoEm"));
  if (captacaoEm === undefined) return { ok: false, erro: DATA_INVALIDA("Captação começa") };
  const carrinhoAbreEm = lerData(campo(entrada, "carrinhoAbreEm"));
  if (carrinhoAbreEm === undefined) return { ok: false, erro: DATA_INVALIDA("Carrinho abre") };
  const carrinhoFechaEm = lerData(campo(entrada, "carrinhoFechaEm"));
  if (carrinhoFechaEm === undefined) return { ok: false, erro: DATA_INVALIDA("Carrinho fecha") };

  const linhas = lista(campo(entrada, "aulas")).filter(
    (linha) => texto(campo(linha, "nome")) || texto(campo(linha, "quando")) || texto(campo(linha, "link")),
  );
  if (linhas.length > MAX_AULAS) return { ok: false, erro: `No máximo ${MAX_AULAS} aulas.` };
  const aulas: Aula[] = [];
  for (const linha of linhas) {
    const nomeDaAula = texto(campo(linha, "nome")).replace(/\s+/g, " ");
    const quando = lerData(campo(linha, "quando"));
    if (!nomeDaAula || !quando) return { ok: false, erro: "Cada aula precisa de nome e data." };
    if (nomeDaAula.length > MAX_NOME_DA_AULA) return { ok: false, erro: `O nome da aula vai até ${MAX_NOME_DA_AULA} caracteres.` };
    const link = lerLink(campo(linha, "link"));
    if (link === undefined) return { ok: false, erro: "O link precisa começar com https://." };
    aulas.push({ nome: nomeDaAula, quando, link });
  }

  const datas: DatasDoLancamento = { captacaoEm, aulas, carrinhoAbreEm, carrinhoFechaEm };
  const problema = problemaNasDatas(datas);
  if (problema) return { ok: false, erro: problema };
  return { ok: true, dados: { nome, produto: produto || null, datas } };
}

/**
 * A aba SDR do lançamento (§4.21 e §4.26): o preço e as condições, as
 * perguntas frequentes, o que mais o SDR sabe e o link do carrinho. Texto
 * vazio vira null; pergunta toda em branco é ignorada.
 */
export function lerSdrDoLancamento(
  entrada: unknown,
): Lido<{ preco: string | null; perguntas: PerguntaFrequente[]; sdrSabe: string | null; linkDoCarrinho: string | null }> {
  const preco = texto(campo(entrada, "preco"));
  if (preco.length > MAX_PRECO) return { ok: false, erro: `Preço e condições vão até ${MAX_PRECO} caracteres.` };

  const linhas = lista(campo(entrada, "perguntas")).filter((linha) => texto(campo(linha, "pergunta")) || texto(campo(linha, "resposta")));
  if (linhas.length > MAX_PERGUNTAS) return { ok: false, erro: `No máximo ${MAX_PERGUNTAS} perguntas.` };
  const perguntas: PerguntaFrequente[] = [];
  for (const linha of linhas) {
    const pergunta = texto(campo(linha, "pergunta"));
    const resposta = texto(campo(linha, "resposta"));
    if (!resposta) return { ok: false, erro: "Cada pergunta precisa da resposta." };
    if (!pergunta) return { ok: false, erro: "Cada resposta precisa da pergunta." };
    if (pergunta.length > MAX_PERGUNTA) return { ok: false, erro: `Cada pergunta vai até ${MAX_PERGUNTA} caracteres.` };
    if (resposta.length > MAX_RESPOSTA) return { ok: false, erro: "Cada resposta vai até 1.000 caracteres." };
    perguntas.push({ pergunta, resposta });
  }

  const sdrSabe = texto(campo(entrada, "sdrSabe"));
  if (sdrSabe.length > MAX_SDR_SABE) return { ok: false, erro: "No máximo 2.000 caracteres no que o SDR sabe." };
  const linkDoCarrinho = lerLink(campo(entrada, "linkDoCarrinho"));
  if (linkDoCarrinho === undefined) return { ok: false, erro: "O link do carrinho precisa começar com https://." };

  return { ok: true, dados: { preco: preco || null, perguntas, sdrSabe: sdrSabe || null, linkDoCarrinho } };
}
