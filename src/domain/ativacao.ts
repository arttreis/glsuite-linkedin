import type { EtapaDaRampa } from "./rampa";

/**
 * O que precisa estar resolvido fora do sistema antes da primeira ativação de
 * um perfil (§8, e D3 para o Arthur pela §12). A conta conectada o sistema
 * checa sozinho; cada item daqui o operador confirma um a um, no painel.
 */
export type Trava = { id: string; texto: string; dono: string };

export function travasDaAtivacao(perfil: { slug: string; nome: string; praca: string; modoResposta: string }): Trava[] {
  const travas: Trava[] = [];
  if (perfil.slug === "arthur") {
    travas.push({ id: "D3", texto: "Rampa e teto deste perfil confirmados", dono: "Arthur" });
  }
  if (perfil.slug === "juliano" && perfil.modoResposta !== "manual") {
    travas.push({ id: "T-2", texto: "Juliano de acordo com a IA rascunhar respostas em nome dele", dono: "Juliano" });
  }
  const internacional = { canada: { pais: "do Canadá", lei: "CASL" }, espanha: { pais: "da Espanha", lei: "LSSI" } }[perfil.praca];
  if (internacional) {
    travas.push(
      { id: "T-1", texto: `Unipile confirmou que o IP da conta sai ${internacional.pais}`, dono: "Arthur" },
      { id: "T-3", texto: "Acordo de parceria com cláusula de automação assinado", dono: "Arthur" },
    );
    if (perfil.praca === "espanha") {
      travas.push({ id: "T-4", texto: "DPA assinado (necessário para gravar nomes europeus)", dono: "Arthur" });
    }
    travas.push({ id: "T-5", texto: `Postura ${internacional.lei} confirmada com fonte local`, dono: perfil.nome });
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
