import { tetoDoPasso, type PassoDaSequencia } from "./sequencia";

/** O que do passo (toque da sequência ou bloco do fluxo) entra na validação. */
export type PassoValidavel = { toque: string; tipo: "convite" | "dm"; max_caracteres?: number };
import { renderizarTemplate, type ValoresDoTemplate } from "./template";
import { validarMensagem, type ContextoDeValidacao, type Praca, type Violacao } from "./validador";

/** O que do perfil entra na validação da copy. */
export type ContextoDoPerfil = {
  praca: Praca;
  palavrasProibidas: readonly string[];
  rodapeObrigatorio: string | null;
  limiteNotaConvite: number;
  linkDeAgenda?: string | null;
};

export function contextoDeValidacao(
  perfil: ContextoDoPerfil,
  passo: PassoValidavel | null,
  origem: ContextoDeValidacao["origem"],
): ContextoDeValidacao {
  return {
    toque: passo?.toque ?? null,
    tipo: passo?.tipo ?? "dm",
    origem,
    praca: perfil.praca,
    palavrasProibidas: perfil.palavrasProibidas,
    tetoCaracteres: passo ? tetoDoPasso(passo) : undefined,
    limiteNotaConvite: passo?.tipo === "convite" ? perfil.limiteNotaConvite : undefined,
    frasesDescadastro: perfil.rodapeObrigatorio ? [perfil.rodapeObrigatorio] : [],
    linkDeAgenda: perfil.linkDeAgenda ?? null,
  };
}

export type ProblemaDoPasso = { toque: PassoDaSequencia["toque"]; previa: string | null; violacoes: Violacao[] };

/**
 * Valida a copy de cada toque renderizada com valores de exemplo longos: o que
 * passa aqui passa com a maioria dos leads reais. O envio valida de novo, com o
 * texto do lead.
 */
export function validarCopyDaSequencia(
  passos: readonly PassoDaSequencia[],
  perfil: ContextoDoPerfil,
  exemplo: ValoresDoTemplate,
  opcoes: { t1PelaIa?: boolean } = {},
): ProblemaDoPasso[] {
  return passos.map((passo) => {
    if (passo.toque === "T1" && opcoes.t1PelaIa && passo.template.trim() === "") {
      return { toque: passo.toque, previa: null, violacoes: [] };
    }
    const renderizado = renderizarTemplate(passo.template, exemplo);
    if (!renderizado.ok) {
      return { toque: passo.toque, previa: null, violacoes: [{ regra: "token_nao_resolvido", mensagem: renderizado.erro }] };
    }
    const { violacoes } = validarMensagem(renderizado.texto, contextoDeValidacao(perfil, passo, "template"));
    return { toque: passo.toque, previa: renderizado.texto, violacoes };
  });
}
