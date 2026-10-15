import { z } from "zod";
import { normalizarUrlDoSite, type Mercado } from "./dossie";
import { explicarErroDeEdicao, limparEdicao } from "./edicao";

/** Quantos concorrentes a lista guarda. */
export const MAX_CONCORRENTES = 10;
/** Teto por organização de concorrentes lidos pela IA (§4.2): cada leitura custa. */
export const MAX_ANALISADOS = 5;
/** Páginas lidas por concorrente: a inicial e, se precisar, mais duas. */
export const MAX_PAGINAS_DO_CONCORRENTE = 3;
/** Leitura de concorrente em "lendo" há mais que isso parou no meio: pode recomeçar. */
export const LEITURA_DO_CONCORRENTE_PARADA_MS = 5 * 60 * 1000;

/**
 * De onde veio o concorrente: o site cita, a categoria implica (hipótese da
 * análise), a análise sem dizer qual dos dois (dossiê lido antes do SDR-68) ou
 * a pessoa acrescentou.
 */
export const ORIGENS_DO_CONCORRENTE = ["site", "categoria", "analise", "voce"] as const;
export type OrigemDoConcorrente = (typeof ORIGENS_DO_CONCORRENTE)[number];

export const ROTULO_DA_ORIGEM: Record<OrigemDoConcorrente, string> = {
  site: "o site cita",
  categoria: "a categoria implica",
  analise: "da análise do site",
  voce: "você acrescentou",
};

/** Um concorrente da lista (§4.2): quem disputa o cliente com a organização. */
export const concorrente = z.object({
  nome: z.string().min(1).max(80),
  descricao: z.string().max(200),
  site: z.string().max(250).nullable(),
  origem: z.enum(ORIGENS_DO_CONCORRENTE),
});
export type Concorrente = z.infer<typeof concorrente>;

export const listaDeConcorrentes = z.array(concorrente).max(MAX_CONCORRENTES);

/**
 * O que a IA devolve na análise de um concorrente. Sem limite de tamanho: o
 * formato estruturado não leva `maxLength` para a API e valida a resposta com
 * o esquema inteiro, então um campo longo derrubaria tudo. Os limites valem
 * depois, item a item (`analiseDaResposta`).
 */
export const analiseDaIa = z.object({
  o_que_vende: z.string(),
  para_quem: z.string(),
  posicionamento: z.string(),
  onde_voce_ganha: z.array(z.string()),
});
export type AnaliseDaIa = z.infer<typeof analiseDaIa>;

const MAX_TEXTO_DA_ANALISE = 300;
const MAX_GANHO = 200;
const MAX_GANHOS = 4;

/**
 * A análise de um concorrente, como fica gravada. O que vende, para quem e
 * como se posiciona saem do site dele; "onde você ganha" é hipótese do Kakou.
 * Campo que a IA não soube dizer (ou disse longo demais) fica null.
 */
export const analiseDoConcorrente = z.object({
  o_que_vende: z.string().min(1).max(MAX_TEXTO_DA_ANALISE).nullable(),
  para_quem: z.string().min(1).max(MAX_TEXTO_DA_ANALISE).nullable(),
  posicionamento: z.string().min(1).max(MAX_TEXTO_DA_ANALISE).nullable(),
  onde_voce_ganha: z.array(z.string().min(1).max(MAX_GANHO)).max(MAX_GANHOS),
});
export type AnaliseDoConcorrente = z.infer<typeof analiseDoConcorrente>;

const textoAproveitavel = (texto: string, max: number): string | null => {
  const limpo = texto.trim();
  return limpo.length > 0 && limpo.length <= max ? limpo : null;
};

/**
 * A resposta da IA validada item a item: campo vazio ou longo demais vira
 * null, ponto de "onde você ganha" longo demais sai, e o resto fica. Sem nada
 * aproveitável, null.
 */
export function analiseDaResposta(saida: AnaliseDaIa): { analise: AnaliseDoConcorrente; descartados: number } | null {
  const textos = {
    o_que_vende: textoAproveitavel(saida.o_que_vende, MAX_TEXTO_DA_ANALISE),
    para_quem: textoAproveitavel(saida.para_quem, MAX_TEXTO_DA_ANALISE),
    posicionamento: textoAproveitavel(saida.posicionamento, MAX_TEXTO_DA_ANALISE),
  };
  const ganhos = saida.onde_voce_ganha.map((ganho) => textoAproveitavel(ganho, MAX_GANHO));
  const onde_voce_ganha = ganhos.filter((ganho): ganho is string => ganho !== null).slice(0, MAX_GANHOS);
  const descartados =
    Object.entries(textos).filter(([chave, valor]) => valor === null && saida[chave as keyof typeof textos].trim().length > 0)
      .length + ganhos.filter((ganho, i) => ganho === null && saida.onde_voce_ganha[i]!.trim().length > 0).length;
  if (Object.values(textos).every((valor) => valor === null) && onde_voce_ganha.length === 0) return null;
  return { analise: { ...textos, onde_voce_ganha }, descartados };
}

/** Concorrente com a análise do site dele, quando já foi lido. */
export type ConcorrenteComAnalise = Concorrente & { analise: AnaliseDoConcorrente | null };

const MARCAS_DE_ORIGEM: { marca: RegExp; origem: OrigemDoConcorrente }[] = [
  { marca: /\s*\(o site cita\)\.?\s*$/i, origem: "site" },
  { marca: /\s*\(a categoria implica\)\.?\s*$/i, origem: "categoria" },
];

const MAX_NOME = 80;

/**
 * A lista inicial: as alternativas do Mercado (§4.2). A análise escreve cada
 * uma como "Nome: o que é (o site cita)" ou "(a categoria implica)"; o que
 * veio sem a marca, de leitura anterior ao SDR-68, fica como "da análise do
 * site", sem chutar de onde veio.
 */
export function concorrentesDaAnalise(mercado: Mercado): Concorrente[] {
  return mercado.alternativas.slice(0, MAX_CONCORRENTES).map((alternativa) => {
    let texto = alternativa.trim();
    let origem: OrigemDoConcorrente = "analise";
    for (const { marca, origem: daMarca } of MARCAS_DE_ORIGEM) {
      if (marca.test(texto)) {
        texto = texto.replace(marca, "");
        origem = daMarca;
      }
    }
    const doisPontos = texto.indexOf(":");
    if (doisPontos > 0 && doisPontos <= MAX_NOME) {
      return { nome: texto.slice(0, doisPontos).trim(), descricao: texto.slice(doisPontos + 1).trim(), site: null, origem };
    }
    if (texto.length <= MAX_NOME) return { nome: texto, descricao: "", site: null, origem };
    return { nome: `${texto.slice(0, MAX_NOME - 1).trimEnd()}…`, descricao: texto.slice(0, 200), site: null, origem };
  });
}

/** O domínio do site do concorrente, a chave da leitura; null sem site ou com endereço que não é público. */
export function dominioDoConcorrente(site: string | null): string | null {
  if (!site) return null;
  const endereco = normalizarUrlDoSite(site);
  return endereco.ok ? endereco.dominio : null;
}

const SECOES = { concorrentes: "Concorrentes" };
const CAMPOS = { nome: "nome", descricao: "o que é", site: "site" };

/**
 * A lista editada pela pessoa, pronta para gravar: limpa, validada, com o site
 * normalizado. Site que não é endereço público e nome repetido são recusados.
 */
export function validarConcorrentes(entrada: unknown): { ok: true; lista: Concorrente[] } | { ok: false; erro: string } {
  const lida = listaDeConcorrentes.safeParse(limparEdicao(entrada));
  if (!lida.success) {
    const erro = new z.ZodError(lida.error.issues.map((issue) => ({ ...issue, path: ["concorrentes", ...issue.path] })));
    return { ok: false, erro: explicarErroDeEdicao(erro, { secoes: SECOES, campos: CAMPOS }) };
  }
  const vistos = new Set<string>();
  const lista: Concorrente[] = [];
  for (const item of lida.data) {
    const chave = item.nome.toLocaleLowerCase("pt-BR");
    if (vistos.has(chave)) return { ok: false, erro: `${item.nome} aparece duas vezes na lista.` };
    vistos.add(chave);
    let site: string | null = null;
    if (item.site) {
      const endereco = normalizarUrlDoSite(item.site);
      if (!endereco.ok) return { ok: false, erro: `Site de ${item.nome}: ${endereco.erro}` };
      site = endereco.url;
    }
    lista.push({ ...item, site });
  }
  return { ok: true, lista };
}

/** A leitura do site de um concorrente, guardada pelo domínio. */
export type LeituraDoConcorrente =
  | { status: "lendo"; em: string }
  | { status: "pronta"; em: string; analise: AnaliseDoConcorrente; paginas: string[] };

/**
 * Pode ler o site deste domínio agora? Domínio já lido não gasta vaga (quem
 * chama devolve a análise que tem); leitura parada pode recomeçar na mesma
 * vaga; domínio novo só entra com menos de `MAX_ANALISADOS` lidos.
 */
export function vagaParaAnalisar(
  leituras: Readonly<Record<string, LeituraDoConcorrente>>,
  dominio: string,
  agora: Date,
): { ok: true; jaLido: AnaliseDoConcorrente | null } | { ok: false; erro: string } {
  const atual = leituras[dominio];
  if (atual?.status === "pronta") return { ok: true, jaLido: atual.analise };
  if (atual?.status === "lendo") {
    const parada = agora.getTime() - new Date(atual.em).getTime() > LEITURA_DO_CONCORRENTE_PARADA_MS;
    return parada ? { ok: true, jaLido: null } : { ok: false, erro: "Já estou lendo esse site. Espere terminar." };
  }
  if (Object.keys(leituras).length >= MAX_ANALISADOS) {
    return { ok: false, erro: `Você já analisou ${MAX_ANALISADOS} concorrentes, o máximo por empresa.` };
  }
  return { ok: true, jaLido: null };
}

const linhaDaAnalise = (a: AnaliseDoConcorrente) =>
  [
    a.o_que_vende ? `vende ${a.o_que_vende}` : null,
    a.para_quem ? `para ${a.para_quem}` : null,
    a.posicionamento ? `se posiciona como ${a.posicionamento}` : null,
    a.onde_voce_ganha.length > 0 ? `onde a oferta ganha (hipótese): ${a.onde_voce_ganha.join("; ")}` : null,
  ]
    .filter((parte): parte is string => parte !== null)
    .join(". ");

/** A lista confirmada em texto, para os prompts do SDR, dos públicos e da abordagem. */
export function textoDosConcorrentes(lista: readonly ConcorrenteComAnalise[]): string {
  return lista
    .map((c) => {
      const linha = `- ${c.nome}${c.descricao ? `: ${c.descricao}` : ""}`;
      return c.analise ? `${linha}\n  ${linhaDaAnalise(c.analise)}` : linha;
    })
    .join("\n");
}
