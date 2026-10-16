import { lerLinhasCsv } from "./importacao";
import { primeiroNome, semAcentos } from "./texto";

/**
 * Contatos e tags (§4.15 e §4.16): regras puras, que rodam no navegador (a
 * importação lê a planilha antes de enviar) e no servidor.
 */

export const ORIGENS_DO_CONTATO = ["linkedin", "importacao", "telegram", "whatsapp"] as const;
export type OrigemDoContato = (typeof ORIGENS_DO_CONTATO)[number];

export const ROTULO_DA_ORIGEM: Record<OrigemDoContato, string> = {
  linkedin: "LinkedIn",
  importacao: "Importação",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

/** Linhas por importação (§4.15). */
export const MAX_LINHAS_POR_IMPORTACAO = 5000;
/** O navegador manda as linhas em partes: o corpo da server action tem limite. */
export const LINHAS_POR_ENVIO = 1000;
export const MAX_NOME_DO_CONTATO = 200;
const MAX_CAMPO = 200;

// --- Telefone ------------------------------------------------------------------

export type TelefoneLido = { ok: true; telefone: string } | { ok: false; motivo: string };

/**
 * Telefone no formato internacional (E.164, `+5511999998888`). Número com DDD
 * e sem DDI é do Brasil e ganha +55. Celular brasileiro antigo, de 8 dígitos
 * começando em 6 a 9, ganha o 9 da frente, como todo celular desde 2016.
 */
export function normalizarTelefone(valor: string | null | undefined): TelefoneLido {
  const bruto = (valor ?? "").trim();
  if (!bruto) return { ok: false, motivo: "sem telefone" };
  const internacional = bruto.startsWith("+") || bruto.startsWith("00");
  let digitos = bruto.replace(/\D/g, "");
  if (bruto.startsWith("00")) digitos = digitos.slice(2);
  // Zero de operadora ou de interurbano na frente do DDD ("0 11 ...", "011 ...").
  if (!internacional) digitos = digitos.replace(/^0+/, "");

  if (!internacional && (digitos.length === 10 || digitos.length === 11)) digitos = `55${digitos}`;
  if (digitos.startsWith("55")) return telefoneDoBrasil(digitos.slice(2));
  if (!internacional) return { ok: false, motivo: "telefone sem DDD ou com dígitos a mais" };
  if (digitos.length < 8 || digitos.length > 15 || digitos.startsWith("0")) return { ok: false, motivo: "telefone internacional inválido" };
  return { ok: true, telefone: `+${digitos}` };
}

function telefoneDoBrasil(nacional: string): TelefoneLido {
  const ddd = nacional.slice(0, 2);
  let numero = nacional.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return { ok: false, motivo: "DDD inválido" };
  if (numero.length === 8 && /^[6-9]/.test(numero)) numero = `9${numero}`;
  const celular = numero.length === 9 && numero.startsWith("9");
  const fixo = numero.length === 8 && /^[2-5]/.test(numero);
  if (!celular && !fixo) return { ok: false, motivo: "número brasileiro com dígitos a mais ou a menos" };
  return { ok: true, telefone: `+55${ddd}${numero}` };
}

/** `+5511999998888` como as pessoas leem: +55 11 99999-8888. */
export function telefoneLegivel(telefone: string): string {
  const br = telefone.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  if (br) return `+55 ${br[1]} ${br[2]}-${br[3]}`;
  return telefone;
}

// --- Tags ----------------------------------------------------------------------

export const MAX_NOME_DA_TAG = 40;
export const MAX_TAGS_POR_ORGANIZACAO = 200;

export const CORES_DAS_TAGS = ["cinza", "verde", "azul", "roxo", "amarelo", "laranja", "vermelho", "rosa"] as const;
export type CorDaTag = (typeof CORES_DAS_TAGS)[number];

export function ehCorDaTag(valor: unknown): valor is CorDaTag {
  return typeof valor === "string" && (CORES_DAS_TAGS as readonly string[]).includes(valor);
}

/** O nome como fica guardado: sem espaço sobrando, até 40 caracteres. Vazio é null. */
export function nomeDaTag(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const nome = valor.replace(/\s+/g, " ").trim().slice(0, MAX_NOME_DA_TAG).trim();
  return nome || null;
}

/** "Clientes VIP" e "clientes vip" são a mesma tag (§4.16): a chave ignora caixa e acento. */
export function chaveDaTag(nome: string): string {
  return semAcentos(nome).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Tags de uma célula da planilha: separadas por vírgula ou ponto e vírgula, uma vez cada. */
export function lerTags(valor: string | null | undefined): string[] {
  const vistas = new Set<string>();
  const tags: string[] = [];
  for (const parte of (valor ?? "").split(/[,;|]/)) {
    const nome = nomeDaTag(parte);
    if (!nome || vistas.has(chaveDaTag(nome))) continue;
    vistas.add(chaveDaTag(nome));
    tags.push(nome);
  }
  return tags;
}

// --- Planilha de contatos --------------------------------------------------------

export type ContatoImportado = {
  linha: number;
  nome: string;
  primeiroNome: string | null;
  telefone: string | null;
  email: string | null;
  empresa: string | null;
  cargo: string | null;
  tags: string[];
};

export type LinhaRecusada = { linha: number; motivo: string };

export type PlanilhaLida = {
  contatos: ContatoImportado[];
  recusadas: LinhaRecusada[];
  /** Que coluna da planilha virou cada campo, para a tela mostrar. */
  colunas: Partial<Record<CampoDaPlanilha, string>>;
  /** Linhas além do teto, que não entram nesta importação. */
  alemDoTeto: number;
};

type CampoDaPlanilha = "nome" | "telefone" | "email" | "empresa" | "cargo" | "tags";

// Apelidos de cada campo, do mais específico para o mais genérico. Normalizados: sem acento, só letras e números.
const APELIDOS: Record<CampoDaPlanilha, string[]> = {
  nome: ["nomecompleto", "nomedocontato", "nome", "name", "fullname", "contato", "cliente", "pessoa"],
  telefone: ["whatsapp", "celular", "telefone", "telefonecelular", "fone", "tel", "phone", "mobile", "phonenumber", "numero"],
  email: ["email", "emaildocontato", "mail", "correioeletronico"],
  empresa: ["empresa", "nomedaempresa", "company", "companyname", "organizacao", "organization", "razaosocial", "nomefantasia"],
  cargo: ["cargo", "funcao", "title", "jobtitle", "position", "ocupacao"],
  tags: ["tags", "tag", "etiquetas", "etiqueta", "marcadores", "grupos", "grupo", "segmento"],
};

const normalizarColuna = (coluna: string) => semAcentos(coluna).toLowerCase().replace(/[^a-z0-9]/g, "");

const limpar = (valor: string | undefined, maximo = MAX_CAMPO) => {
  const texto = (valor ?? "").replace(/\s+/g, " ").trim().slice(0, maximo).trim();
  return texto || null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Acha a coluna de cada campo pelo nome do cabeçalho. Sem nome nem telefone, não há cabeçalho reconhecível. */
function colunasDoCabecalho(cabecalho: string[]): Partial<Record<CampoDaPlanilha, number>> {
  const normalizadas = cabecalho.map(normalizarColuna);
  const indices: Partial<Record<CampoDaPlanilha, number>> = {};
  const usadas = new Set<number>();
  for (const campo of Object.keys(APELIDOS) as CampoDaPlanilha[]) {
    for (const apelido of APELIDOS[campo]) {
      const indice = normalizadas.findIndex((coluna, i) => coluna === apelido && !usadas.has(i));
      if (indice >= 0) {
        indices[campo] = indice;
        usadas.add(indice);
        break;
      }
    }
  }
  return indices;
}

/**
 * Lê a planilha de contatos (§4.15): CSV, ou texto colado de uma planilha
 * (com tab). A primeira linha é o cabeçalho, e as colunas vêm pelo nome
 * (nome, telefone, celular, whatsapp, e-mail, empresa, cargo, tags). Cada
 * linha precisa de telefone ou de e-mail; sem nome, o nome é o telefone ou o
 * e-mail. Telefone que não forma número válido recusa a linha, com o motivo.
 */
export function lerPlanilhaDeContatos(conteudo: string): PlanilhaLida {
  const linhas = lerLinhasCsv(conteudo.replace(/^﻿/, ""));
  const [cabecalho, ...dados] = linhas;
  const vazia: PlanilhaLida = { contatos: [], recusadas: [], colunas: {}, alemDoTeto: 0 };
  if (!cabecalho) return vazia;
  const indices = colunasDoCabecalho(cabecalho);
  if (indices.telefone === undefined && indices.email === undefined) {
    return { ...vazia, recusadas: [{ linha: 1, motivo: "Nenhuma coluna de telefone ou e-mail no cabeçalho." }] };
  }
  const colunas = Object.fromEntries(
    Object.entries(indices).map(([campo, indice]) => [campo, cabecalho[indice!]!.trim()]),
  ) as PlanilhaLida["colunas"];

  const contatos: ContatoImportado[] = [];
  const recusadas: LinhaRecusada[] = [];
  const valor = (linha: string[], campo: CampoDaPlanilha) => (indices[campo] === undefined ? undefined : linha[indices[campo]!]);

  dados.slice(0, MAX_LINHAS_POR_IMPORTACAO).forEach((linha, posicao) => {
    const numero = posicao + 2; // a linha 1 é o cabeçalho
    const brutoTelefone = limpar(valor(linha, "telefone"));
    const telefone = brutoTelefone ? normalizarTelefone(brutoTelefone) : null;
    if (telefone && !telefone.ok) {
      recusadas.push({ linha: numero, motivo: `Telefone "${brutoTelefone}": ${telefone.motivo}.` });
      return;
    }
    const brutoEmail = limpar(valor(linha, "email"))?.toLowerCase() ?? null;
    const email = brutoEmail && EMAIL.test(brutoEmail) ? brutoEmail : null;
    if (brutoEmail && !email) {
      recusadas.push({ linha: numero, motivo: `E-mail "${brutoEmail}" inválido.` });
      return;
    }
    const numeroDoTelefone = telefone?.ok ? telefone.telefone : null;
    if (!numeroDoTelefone && !email) {
      recusadas.push({ linha: numero, motivo: "Sem telefone e sem e-mail: não há como falar com ela." });
      return;
    }
    const nome = limpar(valor(linha, "nome"), MAX_NOME_DO_CONTATO) ?? (numeroDoTelefone ? telefoneLegivel(numeroDoTelefone) : email!);
    contatos.push({
      linha: numero,
      nome,
      primeiroNome: limpar(valor(linha, "nome")) ? primeiroNome(nome) : null,
      telefone: numeroDoTelefone,
      email,
      empresa: limpar(valor(linha, "empresa")),
      cargo: limpar(valor(linha, "cargo")),
      tags: lerTags(valor(linha, "tags")),
    });
  });

  return { contatos, recusadas, colunas, alemDoTeto: Math.max(0, dados.length - MAX_LINHAS_POR_IMPORTACAO) };
}

/**
 * Telefone repetido na mesma planilha entra uma vez (§4.15): a primeira linha
 * fica, e as tags das outras se somam a ela.
 */
export function contatosUnicos(contatos: readonly ContatoImportado[]): { contatos: ContatoImportado[]; repetidos: number } {
  const porChave = new Map<string, ContatoImportado>();
  const unicos: ContatoImportado[] = [];
  let repetidos = 0;
  for (const contato of contatos) {
    const chave = contato.telefone ?? `email:${contato.email}`;
    const existente = porChave.get(chave);
    if (!existente) {
      const copia = { ...contato, tags: [...contato.tags] };
      porChave.set(chave, copia);
      unicos.push(copia);
      continue;
    }
    repetidos += 1;
    for (const tag of contato.tags) {
      if (!existente.tags.some((t) => chaveDaTag(t) === chaveDaTag(tag))) existente.tags.push(tag);
    }
  }
  return { contatos: unicos, repetidos };
}
