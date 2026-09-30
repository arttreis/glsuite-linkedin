import { dataLocal, instanteLocal, somarDias, somarDiasUteis, type Feriados, type Janela } from "@/domain/calendario";
import { proximoToque, sequencia, type PassoDaSequencia } from "@/domain/sequencia";
import { renderizarTemplate } from "@/domain/template";
import type { Praca, Toque } from "@/domain/validador";
import { agendarAcao, chaveDoToque } from "@/server/acoes/agendar";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { transicionarLead } from "@/server/leads/transicoes";

export type PerfilDoToque = { id: string; fuso: string; janela: Janela; praca: Praca };

/**
 * Agenda um toque da régua: `offset_dias_uteis` depois de `base` (aceite ou
 * toque anterior), na abertura da janela no fuso do perfil.
 *
 * Na Espanha a cadência automatizada é proibida (§4.5): o toque vira tarefa
 * para o JP escrever à mão, com o template da campanha como roteiro de apoio.
 */
export async function agendarToque(
  db: Db,
  p: { perfil: PerfilDoToque; leadId: string; passo: PassoDaSequencia; base: Date; feriados: Feriados },
): Promise<string | null> {
  const data = somarDiasUteis(dataLocal(p.base, p.perfil.fuso), p.passo.offset_dias_uteis, p.feriados);
  const manual = p.perfil.praca === "espanha";

  let roteiro: string | null = null;
  if (manual) {
    const [pessoa] = await db.query<{ primeiro_nome: string | null; empresa: string | null }>(
      "select pe.primeiro_nome, pe.empresa from public.leads l join public.pessoas pe on pe.id = l.pessoa_id where l.id = $1::uuid",
      [p.leadId],
    );
    const renderizado = renderizarTemplate(p.passo.template, { first_name: pessoa?.primeiro_nome, company: pessoa?.empresa });
    roteiro = renderizado.ok ? renderizado.texto : p.passo.template;
  }

  return agendarAcao(db, {
    leadId: p.leadId,
    perfilId: p.perfil.id,
    tipo: manual ? "tarefa_manual" : "dm",
    toque: p.passo.toque,
    origem: "template",
    agendadaPara: instanteLocal(data, p.perfil.janela.inicio, p.perfil.fuso),
    chave: chaveDoToque(p.leadId, p.passo.toque),
    textoGerado: roteiro,
  });
}

/**
 * Depois de um toque da régua (DM enviada ou tarefa manual feita): o lead vai
 * para `em_sequencia`, o próximo toque é agendado e, depois do último, a régua
 * termina sem resposta. Nas praças com pausa, o retorno é daqui a 60 dias
 * (§4.5).
 */
export async function avancarRegua(
  db: Db,
  p: { perfil: PerfilDoToque; leadId: string; toque: Toque; agora: Date; feriados: Feriados; ator: string },
): Promise<void> {
  const [lead] = await db.query<{ estado: string; sequencia: unknown; pos_t4: string }>(
    `select l.estado, c.sequencia, c.pos_t4
       from public.leads l join public.campanhas c on c.id = l.campanha_id
      where l.id = $1::uuid`,
    [p.leadId],
  );
  if (!lead) return;
  if (lead.estado === "aceito") {
    await transicionarLead(db, { leadId: p.leadId, para: "em_sequencia", ator: p.ator, agora: p.agora });
  }

  const passos = sequencia.safeParse(lead.sequencia);
  const proximo = passos.success ? proximoToque(passos.data, p.toque) : undefined;
  if (proximo) {
    await agendarToque(db, { perfil: p.perfil, leadId: p.leadId, passo: proximo, base: p.agora, feriados: p.feriados });
    return;
  }

  await transicionarLead(db, { leadId: p.leadId, para: "sem_resposta", ator: p.ator, agora: p.agora });
  if (lead.pos_t4 === "pausa_60_novo_angulo") {
    const dias = await lerConfiguracao(db, "pausa_pos_t4_dias");
    await db.query("update public.leads set retorno_apos = $2::date where id = $1::uuid", [
      p.leadId,
      somarDias(dataLocal(p.agora, p.perfil.fuso), dias),
    ]);
  }
}
