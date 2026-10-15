import { lerLinhasCsv } from "./importacao";
import { chaveDaEmpresa, semAcentos } from "./texto";

/**
 * Listas de empresas (§4.11, SDR-59): nomes de empresas que a organização
 * guarda para a busca procurar pessoas só nelas. Puro: roda no navegador
 * (prévia do que vai entrar) e no servidor.
 */

// Sem teto de empresas por lista (decisão do Arthur, 14/10). Os blocos abaixo
// só cuidam do tamanho de cada envio e de cada insert.
/** Nomes por chamada do navegador ao servidor: o corpo da server action tem limite. */
export const NOMES_POR_ENVIO = 1000;
/** Empresas por insert no banco. */
export const EMPRESAS_POR_INSERT = 500;
export const MAX_NOME_DA_EMPRESA = 200;
export const MAX_NOME_DA_LISTA = 120;
/** Opções guardadas quando a procura não acha uma página só. */
export const MAX_OPCOES = 5;
/** Quantas empresas cada chamada de procura consulta no LinkedIn. */
export const PROCURAS_POR_LEVA = 20;
/** Páginas de empresa por parte da busca [verificar com conta real o limite do filtro `company`]. */
export const EMPRESAS_POR_PARTE = 10;

export type SituacaoDaEmpresa = "a_procurar" | "achada" | "escolher" | "sem_pagina";
export type OpcaoDeEmpresa = { id: string; nome: string };
export type EmpresaLida = { nome: string; chave: string };

// Nomes de coluna que trazem o nome da empresa, do mais específico para o mais genérico.
const COLUNAS_DE_EMPRESA = [
  "nomedaempresa",
  "nomeempresa",
  "empresa",
  "companyname",
  "company",
  "nomefantasia",
  "razaosocial",
  "organization",
  "organizacao",
  "accountname",
  "conta",
  "empresas",
  "companies",
  "nome",
  "name",
];

const normalizarColuna = (coluna: string) => semAcentos(coluna).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Nome limpo: sem espaço sobrando e com tamanho máximo. */
const limparNome = (nome: string) => nome.replace(/\s+/g, " ").trim().slice(0, MAX_NOME_DA_EMPRESA).trim();

function nomesDaTabela(linhas: string[][]): string[] {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return [];
  const colunas = cabecalho.map(normalizarColuna);
  const conhecida = COLUNAS_DE_EMPRESA.find((apelido) => colunas.includes(apelido));
  // Sem cabeçalho reconhecível, a primeira linha já é empresa e vale a primeira coluna.
  if (!conhecida) return linhas.map((linha) => linha[0] ?? "");
  const indice = colunas.indexOf(conhecida);
  return dados.map((linha) => linha[indice] ?? "");
}

/**
 * Nomes de empresa de um texto colado ou de um arquivo CSV/TXT. CSV, ou texto
 * com tab (colado de uma planilha), vira tabela: a coluna vem pelo nome
 * (empresa, company, razão social…), senão a primeira. O resto é um nome por
 * linha, sem a primeira linha se ela for só o título da coluna.
 */
export function lerNomesDeEmpresas(conteudo: string, arquivo?: string): string[] {
  const texto = conteudo.replace(/^﻿/, "");
  const tabela = arquivo?.toLowerCase().endsWith(".csv") || texto.includes("\t");
  const brutos = tabela
    ? nomesDaTabela(lerLinhasCsv(texto))
    : texto.split(/\r?\n/).filter((linha, indice) => !(indice === 0 && COLUNAS_DE_EMPRESA.includes(normalizarColuna(linha))));
  return brutos.map(limparNome).filter(Boolean);
}

/** Uma empresa por chave (§4.13): "Acme Ltda." e "ACME" entram uma vez, com o nome que veio primeiro. */
export function empresasUnicas(nomes: readonly string[]): { empresas: EmpresaLida[]; repetidas: number } {
  const vistas = new Set<string>();
  const empresas: EmpresaLida[] = [];
  let repetidas = 0;
  for (const bruto of nomes) {
    const nome = limparNome(bruto);
    const chave = chaveDaEmpresa(nome);
    if (!nome || !chave) continue;
    if (vistas.has(chave)) {
      repetidas += 1;
      continue;
    }
    vistas.add(chave);
    empresas.push({ nome, chave });
  }
  return { empresas, repetidas };
}

export type ResultadoDaProcura =
  | { situacao: "sem_pagina"; opcoes: OpcaoDeEmpresa[] }
  | { situacao: "achada"; pagina: OpcaoDeEmpresa; opcoes: OpcaoDeEmpresa[] }
  | { situacao: "escolher"; opcoes: OpcaoDeEmpresa[] };

/**
 * O que a consulta de empresa do LinkedIn devolveu para um nome. Nenhuma
 * página: sem página. Exatamente uma página com a mesma chave do nome: achada.
 * Qualquer outro caso, o humano escolhe. As opções guardadas (até 5, as de
 * mesma chave primeiro) servem para escolher ou trocar depois.
 */
export function classificarProcura(nome: string, paginas: readonly OpcaoDeEmpresa[]): ResultadoDaProcura {
  if (paginas.length === 0) return { situacao: "sem_pagina", opcoes: [] };
  const chave = chaveDaEmpresa(nome);
  const unicas = paginas.filter((pagina, indice) => paginas.findIndex((p) => p.id === pagina.id) === indice);
  const mesmas = unicas.filter((pagina) => chave !== null && chaveDaEmpresa(pagina.nome) === chave);
  const opcoes = [...mesmas, ...unicas.filter((pagina) => !mesmas.includes(pagina))].slice(0, MAX_OPCOES);
  if (mesmas.length === 1) return { situacao: "achada", pagina: mesmas[0]!, opcoes };
  return { situacao: "escolher", opcoes };
}

export type EmpresaDaBusca = { nome: string; chave: string; situacao: SituacaoDaEmpresa; linkedinId: string | null };

/** Uma parte da busca com lista: páginas de empresa do LinkedIn, ou o nome de uma empresa sem página. */
export type ParteDaBusca = { empresas: string[] } | { empresa: string };

/**
 * As partes da busca com lista: as páginas achadas ou escolhidas em grupos de
 * 10 e uma parte por empresa sem página. Quem ainda não foi procurado ou
 * espera escolha fica de fora. A ordem é estável, para a assinatura só mudar
 * quando a lista muda.
 */
export function partesDaBusca(empresas: readonly EmpresaDaBusca[]): ParteDaBusca[] {
  const ids = [
    ...new Set(empresas.filter((e) => e.situacao === "achada" && e.linkedinId).map((e) => e.linkedinId!)),
  ].sort();
  const semPagina = empresas
    .filter((e) => e.situacao === "sem_pagina")
    .sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
  const partes: ParteDaBusca[] = [];
  for (let inicio = 0; inicio < ids.length; inicio += EMPRESAS_POR_PARTE) {
    partes.push({ empresas: ids.slice(inicio, inicio + EMPRESAS_POR_PARTE) });
  }
  for (const empresa of semPagina) partes.push({ empresa: empresa.nome });
  return partes;
}

/** Empresas que ainda não entram na busca: não procuradas ou esperando escolha. */
export function empresasPendentes(empresas: readonly Pick<EmpresaDaBusca, "situacao">[]): number {
  return empresas.filter((e) => e.situacao === "a_procurar" || e.situacao === "escolher").length;
}

/**
 * Assinatura das partes (FNV-1a de 32 bits, em hexadecimal): a busca guarda a
 * da lista com que rodou e, se a lista mudar, recomeça do início.
 */
export function assinaturaDasPartes(partes: readonly ParteDaBusca[]): string {
  const texto = JSON.stringify(partes);
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
