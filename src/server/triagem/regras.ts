import { ESTADOS_ATIVOS, ROTULO_DO_ESTADO, type EstadoDoLead } from "@/domain/estados";
import type { Db } from "@/server/db/tipos";

export type CampanhaAlvo = { id: string; perfilId: string; angulo: string };

const dataCurta = (valor: string | Date) =>
  new Date(valor).toISOString().slice(0, 10).split("-").reverse().join("/");

/** Pessoa com opt-out, na tabela global ou na própria pessoa, nunca entra (§4.6). */
export async function temOptout(db: Db, providerId: string): Promise<boolean> {
  const [linha] = await db.query<{ optout: boolean }>(
    `select exists (select 1 from public.optouts where provider_id = $1)
         or exists (select 1 from public.pessoas where provider_id = $1 and optout_em is not null) as optout`,
    [providerId],
  );
  return Boolean(linha?.optout);
}

/**
 * Por que a pessoa não pode entrar nesta campanha, ou null se pode.
 * - Um alvo, um dono (§4.7): se a pessoa é de outro perfil que ainda tem lead
 *   vivo com ela, fica bloqueada. Se o outro perfil só a rejeitou, a posse
 *   passa na aprovação.
 * - Uma régua por vez, "disse não" não volta, sem resposta até o T4 segue a
 *   regra da praça (§4.5).
 */
export async function motivoDeBloqueio(
  db: Db,
  p: { pessoaId: string; donoPerfilId: string; campanha: CampanhaAlvo; hoje: string; ignorarLeadId?: string },
): Promise<string | null> {
  if (p.donoPerfilId !== p.campanha.perfilId) {
    const [outroDono] = await db.query<{ perfil: string }>(
      `select pf.nome as perfil
         from public.leads l join public.perfis pf on pf.id = l.perfil_id
        where l.pessoa_id = $1::uuid and l.perfil_id = $2::uuid and l.estado <> 'rejeitado'
          and not (l.estado = 'triagem' and l.bloqueio_motivo is not null)
        limit 1`,
      [p.pessoaId, p.donoPerfilId],
    );
    if (outroDono) return `Já é do perfil ${outroDono.perfil}: cada pessoa fica com um perfil só`;
  }

  const historico = await db.query<{ estado: EstadoDoLead; angulo: string | null; retorno_apos: string | null; campanha: string }>(
    `select l.estado, l.angulo, l.retorno_apos, c.nome as campanha
       from public.leads l join public.campanhas c on c.id = l.campanha_id
      where l.pessoa_id = $1::uuid and l.estado <> 'rejeitado'
        -- Entrada bloqueada na triagem não é lead vivo: não segura outra campanha.
        and not (l.estado = 'triagem' and l.bloqueio_motivo is not null)
        and ($2::uuid is null or l.id <> $2::uuid)
      order by l.criado_em desc`,
    [p.pessoaId, p.ignorarLeadId ?? null],
  );

  for (const lead of historico) {
    if (lead.estado === "triagem") return `Já está em triagem na campanha ${lead.campanha}`;
    if (ESTADOS_ATIVOS.includes(lead.estado)) return `Já está na campanha ${lead.campanha} (${ROTULO_DO_ESTADO[lead.estado].toLowerCase()})`;
    if (lead.estado === "optout") return "Pediu para não ser contatado";
    if (lead.estado === "encerrado_nao") return `Disse não na campanha ${lead.campanha}: não volta`;
    if (lead.estado === "sem_resposta") {
      if (!lead.retorno_apos) return "Já passou por uma sequência e ficou só como conexão";
      if (lead.retorno_apos > p.hoje) return `Em pausa até ${dataCurta(lead.retorno_apos)}`;
      if (lead.angulo === p.campanha.angulo) return `Só volta com ângulo diferente de "${lead.angulo}"`;
    }
  }
  return null;
}

/**
 * Alerta de cooldown de empresa (§4.7): outro perfil da casa tocou alguém da
 * mesma empresa há menos de `dias`. É alerta na triagem; o despachante é quem
 * segura o convite até o cooldown acabar.
 */
export async function alertaDeCooldown(
  db: Db,
  p: { empresaChave: string | null; perfilId: string; agora: Date; dias: number },
): Promise<string | null> {
  if (!p.empresaChave || p.dias <= 0) return null;
  const [toque] = await db.query<{ perfil: string; em: Date }>(
    `select pf.nome as perfil, max(l.ultimo_toque_em) as em
       from public.leads l
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.perfis pf on pf.id = l.perfil_id
      where pe.empresa_chave = $1 and l.perfil_id <> $2::uuid
        and l.ultimo_toque_em > $3::timestamptz - make_interval(days => $4::int)
      group by pf.nome
      order by em desc
      limit 1`,
    [p.empresaChave, p.perfilId, p.agora, p.dias],
  );
  if (!toque) return null;
  const fim = new Date(new Date(toque.em).getTime() + p.dias * 86_400_000);
  return `O perfil ${toque.perfil} falou com alguém desta empresa em ${dataCurta(toque.em)}. Pode aprovar: o convite espera até ${dataCurta(fim)}`;
}
