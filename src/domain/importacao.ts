import { chaveDaEmpresa, primeiroNome } from "./texto";

/**
 * Pessoa no formato canônico da importação. Vem de CSV, do JSON de um actor do
 * Apify ou da busca da Unipile. Roda no navegador (prévia) e no servidor
 * (validação de verdade).
 */
export type PessoaImportada = {
  providerId: string | null;
  publicIdentifier: string | null;
  urlPublica: string;
  nome: string;
  primeiroNome: string | null;
  cargo: string | null;
  empresa: string | null;
  empresaDominio: string | null;
  empresaChave: string | null;
  localizacao: string | null;
  coletadoEm: string | null;
};

export type LinhaInvalida = { linha: number; motivo: string };

// Nomes de coluna aceitos, do mais específico para o mais genérico. Cobrem o CSV
// canônico do SDR e os campos mais comuns dos actors de LinkedIn do Apify.
const ALIASES = {
  providerId: ["provider_id", "providerid", "profileid", "profile_id", "urn", "entityurn", "profileurn", "memberurn", "id"],
  url: ["url_publica", "url", "linkedinurl", "linkedin_url", "profileurl", "profile_url", "publicprofileurl", "public_profile_url", "link"],
  publicIdentifier: ["public_identifier", "publicidentifier", "username", "vanityname"],
  nome: ["nome", "fullname", "full_name", "name"],
  primeiroNome: ["primeiro_nome", "firstname", "first_name"],
  sobrenome: ["sobrenome", "lastname", "last_name"],
  cargo: ["cargo", "jobtitle", "job_title", "title", "position", "headline", "titulo"],
  empresa: ["empresa", "companyname", "company_name", "company", "currentcompany", "organization"],
  empresaDominio: ["empresa_dominio", "companydomain", "company_domain", "companywebsite", "company_website", "website"],
  localizacao: ["localizacao", "location", "addresswithcountry", "geolocation", "city"],
  coletadoEm: ["coletado_em", "scrapedat", "scraped_at", "collectedat", "timestamp"],
} as const;

type Campo = keyof typeof ALIASES;

const normalizarChave = (chave: string) => chave.toLowerCase().replace(/[\s-]/g, "");

function valorDe(objeto: Record<string, unknown>, campo: Campo): unknown {
  const porChave = new Map(Object.entries(objeto).map(([chave, valor]) => [normalizarChave(chave), valor]));
  for (const alias of ALIASES[campo]) {
    const valor = porChave.get(normalizarChave(alias));
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return undefined;
}

/** Texto de um valor que pode vir aninhado (`location.linkedinText`, `currentPosition[0].companyName`). */
function comoTexto(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === "string") return valor.trim() || null;
  if (typeof valor === "number") return String(valor);
  if (Array.isArray(valor)) return comoTexto(valor[0]);
  if (typeof valor === "object") {
    const objeto = valor as Record<string, unknown>;
    for (const chave of ["linkedinText", "text", "name", "companyName", "title", "default"]) {
      const texto = comoTexto(objeto[chave]);
      if (texto) return texto;
    }
  }
  return null;
}

/** "urn:li:fsd_profile:ACoAAB..." → "ACoAAB..."; aceita os prefixos do Classic, Sales Nav e Recruiter. */
export function extrairProviderId(valor: unknown): string | null {
  const texto = comoTexto(valor);
  if (!texto) return null;
  const achado = texto.match(/\b(AC[ow][A-Za-z0-9_-]{10,}|AE[A-Za-z0-9_-]{10,})\b/);
  return achado ? achado[1]! : null;
}

/** "https://www.linkedin.com/in/maria-souza-123/?x" → "maria-souza-123". */
export function publicIdentifierDaUrl(url: string | null): string | null {
  if (!url) return null;
  const achado = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return achado ? decodeURIComponent(achado[1]!).toLowerCase() : null;
}

function empresaAtual(objeto: Record<string, unknown>): { empresa: string | null; cargo: string | null } {
  for (const chave of ["currentPosition", "currentPositions", "current_positions", "positions", "experience", "experiences"]) {
    const lista = objeto[chave];
    const primeira = Array.isArray(lista) ? (lista[0] as Record<string, unknown> | undefined) : undefined;
    if (primeira && typeof primeira === "object") {
      return {
        empresa: comoTexto(primeira.companyName ?? primeira.company ?? primeira.company_name),
        cargo: comoTexto(primeira.title ?? primeira.position ?? primeira.role),
      };
    }
  }
  return { empresa: null, cargo: null };
}

export function normalizarPessoa(objeto: Record<string, unknown>, linha: number): PessoaImportada | LinhaInvalida {
  const providerId = extrairProviderId(valorDe(objeto, "providerId"));
  const urlBruta = comoTexto(valorDe(objeto, "url"));
  const publicIdentifier =
    comoTexto(valorDe(objeto, "publicIdentifier"))?.toLowerCase() ?? publicIdentifierDaUrl(urlBruta);
  const primeiro = comoTexto(valorDe(objeto, "primeiroNome"));
  const nomeCompleto =
    comoTexto(valorDe(objeto, "nome")) ??
    ([primeiro, comoTexto(valorDe(objeto, "sobrenome"))].filter(Boolean).join(" ") || null);

  if (!providerId && !publicIdentifier) return { linha, motivo: "sem provider_id nem URL do perfil" };
  if (!nomeCompleto) return { linha, motivo: "sem nome" };

  const urlPublica =
    urlBruta && /linkedin\.com\//i.test(urlBruta)
      ? urlBruta.split("?")[0]!
      : `https://www.linkedin.com/in/${publicIdentifier ?? providerId}`;

  const posicao = empresaAtual(objeto);
  const empresa = comoTexto(valorDe(objeto, "empresa")) ?? posicao.empresa;
  const empresaDominio = comoTexto(valorDe(objeto, "empresaDominio"));
  const coletado = comoTexto(valorDe(objeto, "coletadoEm"));

  return {
    providerId,
    publicIdentifier,
    urlPublica,
    nome: nomeCompleto,
    primeiroNome: primeiroNome(nomeCompleto, primeiro),
    cargo: comoTexto(valorDe(objeto, "cargo")) ?? posicao.cargo,
    empresa,
    empresaDominio,
    empresaChave: chaveDaEmpresa(empresa, empresaDominio),
    localizacao: comoTexto(valorDe(objeto, "localizacao")),
    coletadoEm: coletado && !Number.isNaN(Date.parse(coletado)) ? new Date(coletado).toISOString() : null,
  };
}

export function ehLinhaInvalida(valor: PessoaImportada | LinhaInvalida): valor is LinhaInvalida {
  return "motivo" in valor;
}

/**
 * CSV (RFC 4180) com detecção de separador: vírgula, ponto e vírgula (Excel em
 * português) ou tab. A primeira linha é o cabeçalho.
 */
export function lerCsv(conteudo: string): Record<string, string>[] {
  const texto = conteudo.replace(/^﻿/, "");
  const primeiraLinha = texto.split(/\r?\n/, 1)[0] ?? "";
  const separador = [";", "\t", ","].reduce((melhor, candidato) =>
    primeiraLinha.split(candidato).length > primeiraLinha.split(melhor).length ? candidato : melhor,
  );

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let entreAspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i]!;
    if (entreAspas) {
      if (caractere === '"' && texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (caractere === '"') {
        entreAspas = false;
      } else {
        campo += caractere;
      }
    } else if (caractere === '"') {
      entreAspas = true;
    } else if (caractere === separador) {
      linha.push(campo);
      campo = "";
    } else if (caractere === "\n" || caractere === "\r") {
      if (caractere === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += caractere;
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  const [cabecalho, ...dados] = linhas.filter((l) => l.some((valor) => valor.trim() !== ""));
  if (!cabecalho) return [];
  return dados.map((valores) =>
    Object.fromEntries(cabecalho.map((coluna, indice) => [coluna.trim(), (valores[indice] ?? "").trim()])),
  );
}

/** Aceita CSV ou JSON (lista de objetos, ou `{ items: [...] }` como exporta o Apify). */
export function lerArquivoDeImportacao(nome: string, conteudo: string): Record<string, unknown>[] {
  const pareceJson = nome.toLowerCase().endsWith(".json") || /^\s*[[{]/.test(conteudo);
  if (!pareceJson) return lerCsv(conteudo);
  const dados = JSON.parse(conteudo) as unknown;
  const lista = Array.isArray(dados) ? dados : (dados as { items?: unknown[] })?.items;
  if (!Array.isArray(lista)) throw new Error("JSON sem lista de pessoas");
  return lista.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}
