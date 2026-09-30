import "server-only";
import { obterDb } from "@/server/db";
import { comOperador } from "@/server/db/operador";

/**
 * Autorização das escritas do painel. As regras de negócio cruzam perfis (um
 * dono, opt-out global, cooldown), então os serviços rodam com a conexão do
 * sistema; antes, estas funções confirmam, pelo RLS, que o operador enxerga o
 * que vai mexer.
 */
export async function exigirCampanhaDoOperador(operadorId: string, campanhaId: string): Promise<{ perfilId: string }> {
  const [campanha] = await comOperador(obterDb(), operadorId, (tx) =>
    tx.query<{ perfil_id: string }>("select perfil_id from public.campanhas where id = $1::uuid", [campanhaId]),
  );
  if (!campanha) throw new Error("Campanha fora do seu acesso.");
  return { perfilId: campanha.perfil_id };
}

/** Filtra os ids de lead para os que o operador enxerga. */
export async function leadsVisiveis(operadorId: string, leadIds: string[]): Promise<string[]> {
  if (leadIds.length === 0) return [];
  const visiveis = await comOperador(obterDb(), operadorId, (tx) =>
    tx.query<{ id: string }>("select id from public.leads where id = any($1::uuid[])", [leadIds]),
  );
  const permitidos = new Set(visiveis.map((lead) => lead.id));
  return leadIds.filter((id) => permitidos.has(id));
}
