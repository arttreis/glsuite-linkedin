import type { EstadoDaEtapa } from "../etapas";

export type IdDaEtapaDaLeitura = "abrir" | "paginas" | "negocio" | "mercado" | "pronto";

export type EtapaDaLeitura = { id: IdDaEtapaDaLeitura; rotulo: string; estado: EstadoDaEtapa };

/** O que o servidor sabe da leitura em andamento (`ProgressoDaLeitura`). */
type Progresso = { etapa: "paginas" | "analise" | "mercado"; paginas: readonly unknown[]; maxPaginas?: number };

const ORDEM: IdDaEtapaDaLeitura[] = ["abrir", "paginas", "negocio", "mercado", "pronto"];

function rotuloDasPaginas(lidas: number, maximo: number | undefined): string {
  if (lidas === 0) return maximo ? `Lendo as páginas (até ${maximo})` : "Lendo as páginas";
  if (maximo) return `Lendo as páginas (${lidas} de até ${maximo})`;
  return `Lendo as páginas (${lidas} ${lidas === 1 ? "página" : "páginas"})`;
}

/**
 * As etapas da leitura do site, só com o que o servidor sabe: abrir o site
 * (nenhuma página ainda), ler as páginas, montar Negócio e Produto, montar o
 * Mercado. "Pronto" fica por último: quando chega, a tela já é a análise.
 */
export function etapasDaLeitura(progresso: Progresso): EtapaDaLeitura[] {
  const lidas = progresso.paginas.length;
  const atual: IdDaEtapaDaLeitura =
    progresso.etapa === "mercado" ? "mercado" : progresso.etapa === "analise" ? "negocio" : lidas === 0 ? "abrir" : "paginas";
  const rotulos: Record<IdDaEtapaDaLeitura, string> = {
    abrir: "Abrindo o site",
    paginas: rotuloDasPaginas(lidas, progresso.maxPaginas),
    negocio: "Entendendo o negócio e o produto",
    mercado: "Montando o mercado",
    pronto: "Pronto",
  };
  const posicao = ORDEM.indexOf(atual);
  return ORDEM.map((id, indice) => ({
    id,
    rotulo: rotulos[id],
    estado: indice < posicao ? "feita" : indice === posicao ? "atual" : "futura",
  }));
}
