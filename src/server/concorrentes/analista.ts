import type { AnaliseDaIa } from "@/domain/concorrentes";
import type { Resposta } from "@/server/agente/modelo";
import type { LeitorDeSite } from "@/server/oferta/leitor";

/**
 * Lê o site de um concorrente e compara com a oferta, em dois passos como a
 * análise do site (§4.2): a leitura, com o mesmo leitor (preso ao domínio), e
 * a análise com saída estruturada. Em produção é o Claude (`claude.ts`); nos
 * testes, um falso.
 */
export interface AnalistaDeConcorrente {
  ler: LeitorDeSite["ler"];
  analisar(p: { sistema: string; entrada: string }): Promise<Resposta<AnaliseDaIa>>;
}
