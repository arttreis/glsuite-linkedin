import { enfileirarAlerta } from "@/server/alertas/alertas";
import type { Db } from "@/server/db/tipos";
import { listarConversas } from "./inbox";

const trecho = (texto: string) => (texto.length > 280 ? `${texto.slice(0, 277)}...` : texto);

/**
 * "Respondeu qualquer coisa" → alerta ao dono do perfil (§4.6). Só na virada
 * de turno: a primeira mensagem da pessoa depois de uma nossa. Assim uma
 * conversa ativa não vira uma enxurrada de e-mails.
 */
export async function alertarNovaMensagem(
  db: Db,
  p: { leadId: string; perfilId: string; mensagemId: string; texto: string },
): Promise<void> {
  const [anterior] = await db.query<{ direcao: string }>(
    `select direcao from public.mensagens
      where lead_id = $1::uuid and id <> $2::uuid
      order by em desc limit 1`,
    [p.leadId, p.mensagemId],
  );
  if (anterior?.direcao === "entrada") return;

  const [contexto] = await db.query<{ pessoa: string; empresa: string | null; perfil: string }>(
    `select pe.nome as pessoa, pe.empresa, pf.nome as perfil
       from public.leads l join public.pessoas pe on pe.id = l.pessoa_id join public.perfis pf on pf.id = l.perfil_id
      where l.id = $1::uuid`,
    [p.leadId],
  );
  if (!contexto) return;
  await enfileirarAlerta(db, {
    chave: `resposta/${p.mensagemId}`,
    tipo: "sla",
    perfilId: p.perfilId,
    incluirAdmin: false,
    assunto: `[SDR] ${contexto.pessoa}${contexto.empresa ? ` (${contexto.empresa})` : ""} respondeu ao ${contexto.perfil}`,
    texto: [
      `${contexto.pessoa} respondeu:`,
      ``,
      `"${trecho(p.texto)}"`,
      ``,
      `SLA: responder em até 4 horas úteis no fuso do perfil. A conversa está na inbox do painel.`,
    ].join("\n"),
  });
}

/** SLA estourado vira alerta (uma vez por mensagem sem retorno). Roda no tick. */
export async function alertarSlasEstourados(db: Db, agora: Date): Promise<number> {
  const conversas = await listarConversas(db, { agora, estado: "abertas" });
  let alertas = 0;
  for (const conversa of conversas) {
    if (conversa.sla?.tipo !== "estourado" || !conversa.ultimaEntrada) continue;
    await enfileirarAlerta(db, {
      chave: `sla/${conversa.leadId}/${new Date(conversa.ultimaEntrada).toISOString()}`,
      tipo: "sla",
      perfilId: conversa.perfilId,
      assunto: `[SDR] SLA estourado: ${conversa.pessoa} está sem resposta (${conversa.perfil})`,
      texto: [
        `A mensagem de ${conversa.pessoa}${conversa.empresa ? ` (${conversa.empresa})` : ""} passou de 4 horas úteis sem retorno.`,
        conversa.aguardandoAprovacao > 0 ? `Há ${conversa.aguardandoAprovacao} rascunho(s) esperando aprovação na fila.` : "",
        `Responda pela inbox do painel.`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    alertas += 1;
  }
  return alertas;
}
