import { dataLocal, instanteLocal, somarDiasUteis, type Feriados, type Janela } from "@/domain/calendario";
import type { PassoDaSequencia } from "@/domain/sequencia";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import type { Db } from "@/server/db/tipos";

export type PerfilDoToque = { id: string; fuso: string; janela: Janela };

/**
 * Agenda um toque da régua: `offset_dias_uteis` depois de `base` (aceite ou
 * toque anterior), na abertura da janela no fuso do perfil.
 */
export async function agendarToque(
  db: Db,
  p: { perfil: PerfilDoToque; leadId: string; passo: PassoDaSequencia; base: Date; feriados: Feriados },
): Promise<string | null> {
  const data = somarDiasUteis(dataLocal(p.base, p.perfil.fuso), p.passo.offset_dias_uteis, p.feriados);
  return agendarAcao(db, {
    leadId: p.leadId,
    perfilId: p.perfil.id,
    tipo: "dm",
    toque: p.passo.toque,
    origem: "template",
    agendadaPara: instanteLocal(data, p.perfil.janela.inicio, p.perfil.fuso),
    chave: chaveDoToque(p.leadId, p.passo.toque),
  });
}
