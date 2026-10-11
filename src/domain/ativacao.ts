import type { EtapaDaRampa } from "./rampa";

/**
 * O que precisa estar resolvido fora do sistema antes da primeira ativação de
 * um perfil (D3 para o Arthur e T-2 para o Juliano, do épico anterior). A
 * conta conectada o sistema checa sozinho; cada item daqui o operador confirma
 * um a um, no painel.
 */
export type Trava = { id: string; texto: string; dono: string };

export function travasDaAtivacao(perfil: { slug: string; nome: string; praca: string; modoResposta: string }): Trava[] {
  const travas: Trava[] = [];
  if (perfil.slug === "arthur") {
    travas.push({ id: "D3", texto: "Rampa e teto deste perfil confirmados", dono: "Arthur" });
  }
  if (perfil.slug === "juliano") {
    travas.push({ id: "T-2", texto: "Juliano de acordo com a IA rascunhar respostas em nome dele", dono: "Juliano" });
  }
  return travas;
}

/** "8 → 12 → 15": os valores por semana, a partir da semana 1. */
export function resumoDaRampa(rampa: readonly EtapaDaRampa[], campo: "convites_dia" | "dms_dia"): string {
  return [...rampa]
    .sort((a, b) => a.semana - b.semana)
    .map((etapa) => etapa[campo])
    .join(" → ");
}
