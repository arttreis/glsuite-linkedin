import type { Resposta, Uso } from "@/server/agente/modelo";
import type { Dossie } from "@/domain/dossie";

export type FonteDoSite = { url: string; titulo: string | null };

export type LeituraDoSite = { notas: string; fontes: FonteDoSite[]; uso: Uso; modelo: string };

/**
 * Lê o site e monta o dossiê em dois passos: a leitura (a IA abre as páginas e
 * anota os fatos) e a estruturação (as notas viram o dossiê no formato fixo).
 * Em produção é o Claude (`claude.ts`); nos testes, um falso.
 */
export interface LeitorDeSite {
  /** `aoAbrirPagina` avisa cada página aberta, enquanto a leitura ainda corre. */
  ler(p: {
    sistema: string;
    url: string;
    dominio: string;
    maxPaginas: number;
    aoAbrirPagina?: (fonte: FonteDoSite) => void;
  }): Promise<LeituraDoSite>;
  estruturar(p: { sistema: string; entrada: string }): Promise<Resposta<Dossie>>;
}
