import { randomUUID } from "node:crypto";
import { RAMPA_PADRAO, TETO_SEMANAL_PADRAO } from "@/domain/rampa";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

/**
 * Uma conta nova do LinkedIn para a organização (§4.12, "vincular outra
 * conta"): pausada, com a rampa padrão e o SDR respondendo sozinho, operada
 * por quem vincula. Conta dela ainda sem LinkedIn é reaproveitada: dois
 * cliques não criam duas contas.
 */
export async function contaNovaDoLinkedin(
  db: Db,
  p: { organizacaoId: string; operadorId: string; nome: string; agora: Date },
): Promise<string> {
  return db.transacao(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`conta-nova:${p.organizacaoId}:${p.operadorId}`]);
    const [pendente] = await tx.query<{ id: string }>(
      `select id from public.perfis
        where organizacao_id = $1::uuid and operador_id = $2::uuid and not casa and unipile_account_id is null
        order by criado_em limit 1`,
      [p.organizacaoId, p.operadorId],
    );
    if (pendente) return pendente.id;

    const [perfil] = await tx.query<{ id: string }>(
      `insert into public.perfis
         (slug, nome, operador_id, praca, fuso, idioma, modo_resposta, rampa, teto_convites_semana,
          palavras_proibidas, status, motivo_pausa, organizacao_id, criado_em)
       values ($1, $2, $3::uuid, 'domestico', 'America/Sao_Paulo', 'pt', 'automatico', $4::jsonb, $5,
               '{}', 'pausado', 'Aguardando o LinkedIn', $6::uuid, $7)
       returning id`,
      [`p-${randomUUID().slice(0, 8)}`, p.nome, p.operadorId, JSON.stringify(RAMPA_PADRAO), TETO_SEMANAL_PADRAO, p.organizacaoId, p.agora],
    );
    await tx.query("insert into public.operador_perfis (operador_id, perfil_id) values ($1::uuid, $2::uuid) on conflict do nothing", [
      p.operadorId,
      perfil!.id,
    ]);
    await registrarEvento(tx, {
      tipo: "perfil_criado",
      entidade: "perfil",
      entidadeId: perfil!.id,
      perfilId: perfil!.id,
      payload: { origem: "configuracoes" },
      ator: p.operadorId,
      em: p.agora,
    });
    return perfil!.id;
  });
}
