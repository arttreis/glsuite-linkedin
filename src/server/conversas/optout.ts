import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { transicionarLead } from "@/server/leads/transicoes";
import { cancelarPendentes } from "@/server/reacoes/mensagem";

/**
 * Opt-out global (§4.6): vale para os 4 perfis, cancela tudo o que estava para
 * sair para a pessoa, fecha todos os leads dela em `optout` e barra qualquer
 * importação futura. O pedido fica guardado como prova.
 */
export async function registrarOptout(
  db: Db,
  p: { providerId: string; perfilOrigem: string | null; textoPedido: string | null; ator: string; agora: Date },
): Promise<{ leadsFechados: number }> {
  return db.transacao(async (tx) => {
    await tx.query(
      `insert into public.optouts (provider_id, em, perfil_origem, texto_pedido)
       values ($1, $2, $3::uuid, $4)
       on conflict (provider_id) do nothing`,
      [p.providerId, p.agora, p.perfilOrigem, p.textoPedido],
    );
    await tx.query("update public.pessoas set optout_em = coalesce(optout_em, $2) where provider_id = $1", [p.providerId, p.agora]);

    const leads = await tx.query<{ id: string; perfil_id: string }>(
      `select l.id, l.perfil_id
         from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
        where pe.provider_id = $1 and l.estado <> 'optout'
        for update of l`,
      [p.providerId],
    );
    let leadsFechados = 0;
    for (const lead of leads) {
      await cancelarPendentes(tx, lead.id, "opt-out");
      if (await transicionarLead(tx, { leadId: lead.id, para: "optout", ator: p.ator, agora: p.agora, motivo: "pediu para não ser contatado" })) {
        leadsFechados += 1;
      }
    }
    await registrarEvento(tx, {
      tipo: "optout_registrado",
      entidade: "pessoa",
      entidadeId: p.providerId,
      perfilId: p.perfilOrigem,
      payload: { leads_fechados: leadsFechados, texto: p.textoPedido },
      ator: p.ator,
      em: p.agora,
    });
    return { leadsFechados };
  });
}
