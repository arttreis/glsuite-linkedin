import { z } from "zod";

/**
 * Busca de leads com filtros (§4.11). Roda no navegador (formulário e prévia)
 * e no servidor (validação de verdade). Local e setor são ids do LinkedIn,
 * escolhidos numa lista que a Unipile devolve; o título só serve para a tela.
 */
export type OpcaoDeFiltro = { id: string; titulo: string };

export const IDIOMAS_DO_PERFIL = { pt: "Português", en: "Inglês", es: "Espanhol", fr: "Francês" } as const;
export type IdiomaDoPerfil = keyof typeof IDIOMAS_DO_PERFIL;

export const GRAUS_DE_CONEXAO = [1, 2, 3] as const;
export type GrauDeConexao = (typeof GRAUS_DE_CONEXAO)[number];

const opcao = z.object({ id: z.string().regex(/^\d+$/), titulo: z.string().trim().min(1).max(200) });
const texto = z.string().trim().max(200).default("");

export const esquemaDosFiltros = z.object({
  palavrasChave: texto,
  cargo: texto,
  empresa: texto,
  locais: z.array(opcao).max(10).default([]),
  setores: z.array(opcao).max(10).default([]),
  graus: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).max(3).default([]),
  idiomas: z.array(z.enum(Object.keys(IDIOMAS_DO_PERFIL) as [IdiomaDoPerfil, ...IdiomaDoPerfil[]])).max(4).default([]),
});

export type FiltrosDeBusca = z.infer<typeof esquemaDosFiltros>;

export const FILTROS_INICIAIS: FiltrosDeBusca = {
  palavrasChave: "",
  cargo: "",
  empresa: "",
  locais: [],
  setores: [],
  graus: [2, 3],
  idiomas: [],
};

/**
 * Grau e idioma só estreitam. Sem palavra-chave, cargo, empresa, local ou
 * setor, a busca traria qualquer um e gastaria o teto do perfil à toa.
 */
export function temFiltroDeConteudo(f: FiltrosDeBusca): boolean {
  return Boolean(f.palavrasChave || f.cargo || f.empresa || f.locais.length || f.setores.length);
}

const ORDINAL: Record<GrauDeConexao, string> = { 1: "1º", 2: "2º", 3: "3º+" };

/** Resumo dos filtros em uma linha. Vai no nome da importação, para saber de onde a lista veio. */
export function descreverFiltros(f: FiltrosDeBusca): string {
  const partes = [
    f.palavrasChave && `"${f.palavrasChave}"`,
    f.cargo && `cargo: ${f.cargo}`,
    f.empresa && `empresa: ${f.empresa}`,
    f.locais.length > 0 && `local: ${f.locais.map((o) => o.titulo).join(", ")}`,
    f.setores.length > 0 && `setor: ${f.setores.map((o) => o.titulo).join(", ")}`,
    f.graus.length > 0 && f.graus.length < 3 && `${[...f.graus].sort().map((g) => ORDINAL[g]).join(" e ")} grau`,
    f.idiomas.length > 0 && `idioma: ${f.idiomas.join(", ")}`,
  ].filter(Boolean);
  const linha = `Busca: ${partes.join(" · ")}`;
  return linha.length > 200 ? `${linha.slice(0, 199)}…` : linha;
}

/**
 * Situação de quem a busca trouxe, olhando a base. É aviso: quem decide é a
 * triagem, que confere tudo de novo na importação.
 */
export type SituacaoNaBase =
  | { tipo: "nova" }
  | { tipo: "na_base" }
  | { tipo: "na_campanha" }
  | { tipo: "de_outro_perfil"; perfil: string }
  | { tipo: "optout" };

/** Opt-out nem entra; quem já está na campanha duplicaria; o de outro perfil entraria bloqueado. */
export function podeSelecionar(situacao: SituacaoNaBase): boolean {
  return situacao.tipo === "nova" || situacao.tipo === "na_base";
}

export function rotuloDaSituacao(situacao: SituacaoNaBase): string {
  switch (situacao.tipo) {
    case "nova":
      return "Nova";
    case "na_base":
      return "Já está na base";
    case "na_campanha":
      return "Já está nesta campanha";
    case "de_outro_perfil":
      return `É do perfil ${situacao.perfil}`;
    case "optout":
      return "Pediu para não ser contatada";
  }
}
