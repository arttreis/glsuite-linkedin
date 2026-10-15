import { z } from "zod";
import { buscaDoPublico, type BuscaDoPublico } from "./busca";
import { MAX_NOME_DA_LISTA } from "./lista-de-empresas";
import { semAcentos } from "./texto";

/** Tamanho da mensagem da pessoa. */
export const MAX_MENSAGEM = 1000;
/** Quantas falas da conversa (dela e do Kakou) vão junto com a mensagem nova. */
export const MAX_FALAS_NO_HISTORICO = 12;
/** Empresas de uma lista criada pela conversa; lista maior se cria em Listas de empresas. */
export const MAX_EMPRESAS_PELA_CONVERSA = 200;
/** Opções de região ou setor que a tela mostra quando o nome não basta. */
export const MAX_OPCOES_DA_DUVIDA = 5;

/**
 * O que o modelo devolve (SDR-62): a busca inteira como deve ficar depois do
 * pedido, com região, setor e lista pelo nome, e a resposta para a pessoa.
 * Quem acha o id do LinkedIn é o servidor, nunca o modelo. Sem limites no
 * schema: a saída estruturada não aceita todos, e o servidor corta depois.
 */
export const pedidoDeBusca = z.object({
  resposta: z.string(),
  cargos: z.array(z.string()),
  palavras: z.string(),
  regioes: z.array(z.string()),
  setores: z.array(z.string()),
  lista: z.object({
    acao: z.enum(["manter", "tirar", "usar", "criar"]),
    nome: z.string(),
    empresas: z.array(z.string()),
  }),
});
export type PedidoDeBusca = z.infer<typeof pedidoDeBusca>;

/** A busca como está no formulário, ainda sem salvar: pode estar sem cargo, ou com um cargo em branco. */
export const rascunhoDaBusca = buscaDoPublico.extend({ cargos: z.array(z.string().max(80)).max(10) });
export type RascunhoDaBusca = z.infer<typeof rascunhoDaBusca>;

export const falaDaConversa = z.object({ quem: z.enum(["voce", "kakou"]), texto: z.string().max(4000) });
export type FalaDaConversa = z.infer<typeof falaDaConversa>;

/** "São Paulo" e "sao paulo " são o mesmo nome. */
export function mesmoNome(a: string, b: string): boolean {
  const chave = (x: string) => semAcentos(x).toLowerCase().replace(/\s+/g, " ").trim();
  return chave(a) === chave(b);
}

/** Os cargos do pedido: sem vazio, sem repetido, até 80 caracteres cada e 10 no total. */
export function cargosDoPedido(cargos: readonly string[]): { cargos: string[]; cortados: number } {
  const unicos: string[] = [];
  for (const cargo of cargos) {
    const limpo = cargo.replaceAll('"', "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (limpo && !unicos.some((c) => mesmoNome(c, limpo))) unicos.push(limpo);
  }
  return { cargos: unicos.slice(0, 10), cortados: Math.max(0, unicos.length - 10) };
}

type Parametro = BuscaDoPublico["regioes"][number];

export type EscolhaDoParametro = { tipo: "achado"; item: Parametro } | { tipo: "duvida"; opcoes: Parametro[] } | { tipo: "nada" };

/**
 * Qual opção do LinkedIn é o lugar ou setor que a pessoa disse: a de mesmo
 * nome, se só uma tem; a única, se só veio uma; senão a pessoa escolhe.
 * "São Paulo" volta cidade, estado e região metropolitana: vira dúvida.
 */
export function escolherParametro(texto: string, opcoes: readonly Parametro[]): EscolhaDoParametro {
  if (opcoes.length === 0) return { tipo: "nada" };
  const iguais = opcoes.filter((o) => mesmoNome(o.nome, texto));
  if (iguais.length === 1) return { tipo: "achado", item: iguais[0]! };
  if (opcoes.length === 1) return { tipo: "achado", item: opcoes[0]! };
  return { tipo: "duvida", opcoes: opcoes.slice(0, MAX_OPCOES_DA_DUVIDA) };
}

/** A lista de empresas pelo nome: o nome igual, ou a única que contém o que a pessoa disse. */
export function listaPeloNome<L extends { id: string; nome: string }>(nome: string, listas: readonly L[]): L | null {
  const igual = listas.find((l) => mesmoNome(l.nome, nome));
  if (igual) return igual;
  const chave = semAcentos(nome).toLowerCase().trim();
  if (!chave) return null;
  const contem = listas.filter((l) => semAcentos(l.nome).toLowerCase().includes(chave));
  return contem.length === 1 ? contem[0]! : null;
}

/** Nome da lista que a conversa cria, no tamanho que a lista aceita. */
export function nomeDaListaDoPedido(nome: string): string {
  return nome.replace(/\s+/g, " ").trim().slice(0, MAX_NOME_DA_LISTA) || "Lista da conversa";
}

export type MudancaNaBusca = { sinal: "+" | "-"; texto: string };

/** O que mudou de uma busca para a outra, para a tela mostrar embaixo da resposta. */
export function mudancasDaBusca(antes: RascunhoDaBusca, depois: RascunhoDaBusca): MudancaNaBusca[] {
  const mudancas: MudancaNaBusca[] = [];
  const comparar = (a: readonly string[], b: readonly string[], rotulo = (x: string) => x) => {
    for (const x of b) if (!a.some((y) => mesmoNome(x, y))) mudancas.push({ sinal: "+", texto: rotulo(x) });
    for (const x of a) if (!b.some((y) => mesmoNome(x, y))) mudancas.push({ sinal: "-", texto: rotulo(x) });
  };
  comparar(antes.cargos, depois.cargos);
  comparar(
    antes.regioes.map((r) => r.nome),
    depois.regioes.map((r) => r.nome),
  );
  comparar(
    antes.setores.map((s) => s.nome),
    depois.setores.map((s) => s.nome),
  );
  const palavras = (x: string) => (x.trim() ? [x.trim()] : []);
  comparar(palavras(antes.palavras), palavras(depois.palavras), (x) => `palavras-chave "${x}"`);
  if (antes.lista?.id !== depois.lista?.id) {
    if (antes.lista) mudancas.push({ sinal: "-", texto: `lista ${antes.lista.nome}` });
    if (depois.lista) mudancas.push({ sinal: "+", texto: `lista ${depois.lista.nome}` });
  }
  return mudancas;
}
