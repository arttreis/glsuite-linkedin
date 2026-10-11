import { contextoDeValidacao } from "@/domain/campanha";
import { validarMensagem, type Violacao } from "@/domain/validador";
import { contextoDoPerfil } from "@/server/campanhas/perfil";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import type { MensagemRecebida } from "@/server/unipile/webhooks";

/**
 * Conversas do LinkedIn que não são de campanha (§4.6). São só leitura e
 * resposta humana: nada aqui dispara IA, SLA, alerta, RD ou estado de lead.
 */

type PerfilDaConversa = { id: string; praca: string };

type Contraparte = { providerId: string | null; nome: string | null; url?: string | null };

async function garantirConversa(
  db: Db,
  p: { perfilId: string; chatId: string; contraparte: Contraparte; em: Date },
): Promise<string> {
  const [conversa] = await db.query<{ id: string }>(
    `insert into public.conversas (perfil_id, chat_id, contraparte_provider_id, contraparte_nome, contraparte_url, ultima_em)
     values ($1::uuid, $2, $3, $4, $5, $6)
     on conflict (perfil_id, chat_id) do update
       set contraparte_provider_id = coalesce(public.conversas.contraparte_provider_id, excluded.contraparte_provider_id),
           contraparte_nome = coalesce(excluded.contraparte_nome, public.conversas.contraparte_nome),
           contraparte_url = coalesce(excluded.contraparte_url, public.conversas.contraparte_url),
           ultima_em = greatest(public.conversas.ultima_em, excluded.ultima_em)
     returning id`,
    [p.perfilId, p.chatId, p.contraparte.providerId, p.contraparte.nome, p.contraparte.url ?? null, p.em],
  );
  return conversa!.id;
}

/** Grava a mensagem de uma conversa sem lead. Devolve false quando não pode gravar. */
export async function gravarMensagemExterna(
  db: Db,
  p: { perfil: PerfilDaConversa; m: MensagemRecebida; contraparte: string | null; agora: Date },
): Promise<boolean> {
  const { m } = p;
  const em = m.em ? new Date(m.em) : p.agora;
  const nome = m.enviadaPelaConta
    ? (m.participantes.find((participante) => participante.providerId === p.contraparte)?.nome ?? null)
    : m.remetenteNome;
  const conversaId = await garantirConversa(db, {
    perfilId: p.perfil.id,
    chatId: m.chatId,
    contraparte: { providerId: p.contraparte, nome },
    em,
  });
  if (m.enviadaPelaConta) {
    // Eco de uma resposta mandada pelo painel que voltou da API sem id.
    const [eco] = await db.query(
      `update public.mensagens set provider_message_id = $1
        where id = (
          select id from public.mensagens
           where conversa_id = $2::uuid and direcao = 'saida' and provider_message_id is null
             and btrim(texto) = btrim($3) and em > $4::timestamptz - interval '1 hour'
           order by em desc limit 1)
        returning id`,
      [m.messageId, conversaId, m.texto, em],
    );
    if (eco) return true;
  }
  await db.query(
    `insert into public.mensagens (perfil_id, conversa_id, chat_id, direcao, autor, texto, provider_message_id, em)
     values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
     on conflict (provider_message_id) do nothing`,
    [p.perfil.id, conversaId, m.chatId, m.enviadaPelaConta ? "saida" : "entrada", m.enviadaPelaConta ? "humano" : "prospect", m.texto, m.messageId, em],
  );
  return true;
}

export type ResultadoDaRespostaExterna = { ok: true } | { ok: false; motivo: string; violacoes?: Violacao[] };

/**
 * Resposta humana numa conversa externa. Passa pelo validador como texto
 * humano (§4.2 vale para toda mensagem que sai) e sai na hora. A chave do
 * formulário evita mandar duas vezes com clique duplo.
 */
export async function responderConversaExterna(
  deps: { db: Db; unipile: ClienteUnipile; agora: Date },
  p: { conversaId: string; texto: string; operadorId: string; chave: string },
): Promise<ResultadoDaRespostaExterna> {
  const { db, agora } = deps;
  const texto = p.texto.trim();
  const [conversa] = await db.query<{ perfil_id: string; chat_id: string; account_id: string | null; status: string }>(
    `select c.perfil_id, c.chat_id, pf.unipile_account_id as account_id, pf.status
       from public.conversas c join public.perfis pf on pf.id = c.perfil_id
      where c.id = $1::uuid`,
    [p.conversaId],
  );
  if (!conversa) return { ok: false, motivo: "Conversa não encontrada." };
  if (!conversa.account_id) return { ok: false, motivo: "O LinkedIn deste perfil não está conectado." };
  if (conversa.status !== "ativo") return { ok: false, motivo: "O perfil está pausado. Despause antes de responder pelo painel." };
  const [repetida] = await db.query(
    "select 1 from public.eventos where tipo = 'resposta_externa' and entidade_id = $1 and payload->>'chave' = $2 limit 1",
    [p.conversaId, p.chave],
  );
  if (repetida) return { ok: false, motivo: "Essa mensagem já foi enviada." };

  const validacao = validarMensagem(texto, contextoDeValidacao(await contextoDoPerfil(db, conversa.perfil_id), null, "humano"));
  if (!validacao.ok) return { ok: false, motivo: "A mensagem não passou no validador.", violacoes: validacao.violacoes };

  let messageId: string | null;
  try {
    ({ messageId } = await deps.unipile.enviarMensagem({ accountId: conversa.account_id, chatId: conversa.chat_id, texto }));
  } catch (erro) {
    return { ok: false, motivo: `A Unipile recusou o envio: ${(erro as Error).message}` };
  }
  await db.transacao(async (tx) => {
    await tx.query(
      `insert into public.mensagens (perfil_id, conversa_id, chat_id, direcao, autor, texto, provider_message_id, em)
       values ($1::uuid, $2::uuid, $3, 'saida', 'humano', $4, $5, $6)
       on conflict (provider_message_id) do nothing`,
      [conversa.perfil_id, p.conversaId, conversa.chat_id, texto, messageId, agora],
    );
    await tx.query("update public.conversas set ultima_em = greatest(ultima_em, $2) where id = $1::uuid", [p.conversaId, agora]);
    await registrarEvento(tx, {
      tipo: "resposta_externa",
      entidade: "conversa",
      entidadeId: p.conversaId,
      perfilId: conversa.perfil_id,
      payload: { chave: p.chave },
      ator: p.operadorId,
      em: agora,
    });
  });
  return { ok: true };
}

/**
 * A pessoa de uma conversa externa virou lead (importada numa campanha) e
 * falou de novo: a conversa e o histórico passam para o lead.
 */
export async function ligarConversaAoLead(
  db: Db,
  p: { perfilId: string; chatId: string; leadId: string; pessoaId: string },
): Promise<void> {
  const [conversa] = await db.query<{ id: string }>(
    "update public.conversas set lead_id = $3::uuid where perfil_id = $1::uuid and chat_id = $2 and lead_id is null returning id",
    [p.perfilId, p.chatId, p.leadId],
  );
  if (!conversa) return;
  await db.query("update public.mensagens set lead_id = $2::uuid, pessoa_id = $3::uuid where conversa_id = $1::uuid and lead_id is null", [
    conversa.id,
    p.leadId,
    p.pessoaId,
  ]);
}

export type ResultadoDoHistorico = { conversas: number; mensagens: number; motivo?: string };

/**
 * Traz da Unipile as conversas mais recentes do perfil e as últimas mensagens
 * de cada uma. Chat de lead fica de fora: o histórico dele já chega pelo fluxo
 * da campanha, e reprocessar mensagem antiga mexeria no estado do lead.
 */
export async function importarHistorico(
  deps: { db: Db; unipile: ClienteUnipile; agora: Date },
  p: { perfilId: string; maxConversas?: number; mensagensPorConversa?: number },
): Promise<ResultadoDoHistorico> {
  const { db, unipile } = deps;
  const [perfil] = await db.query<{ id: string; praca: string; unipile_account_id: string | null }>(
    "select id, praca, unipile_account_id from public.perfis where id = $1::uuid",
    [p.perfilId],
  );
  if (!perfil?.unipile_account_id) return { conversas: 0, mensagens: 0, motivo: "O LinkedIn deste perfil não está conectado." };

  const max = p.maxConversas ?? 100;
  const resultado: ResultadoDoHistorico = { conversas: 0, mensagens: 0 };
  let cursor: string | undefined;
  let vistas = 0;
  do {
    const pagina = await unipile.listarConversas(perfil.unipile_account_id, { cursor, limite: Math.min(100, max - vistas) });
    for (const chat of pagina.itens) {
      vistas += 1;
      const [deLead] = await db.query(
        `select 1 from public.leads l join public.pessoas pe on pe.id = l.pessoa_id
          where l.perfil_id = $1::uuid and l.estado not in ('triagem', 'rejeitado')
            and (l.chat_id = $2 or ($3::text is not null and pe.provider_id = $3))
          limit 1`,
        [perfil.id, chat.id, chat.contraparteProviderId],
      );
      if (deLead) continue;

      const participantes = await unipile.listarParticipantes(chat.id);
      const outro = participantes.find((participante) => !participante.euMesmo) ?? null;
      const mensagens = await unipile.listarMensagens(chat.id, p.mensagensPorConversa ?? 20);
      const ultima = mensagens.map((m) => new Date(m.em)).sort((a, b) => b.getTime() - a.getTime())[0];
      const conversaId = await garantirConversa(db, {
        perfilId: perfil.id,
        chatId: chat.id,
        contraparte: {
          providerId: outro?.providerId ?? chat.contraparteProviderId,
          nome: outro?.nome ?? chat.nome,
          url: outro?.url ?? null,
        },
        em: ultima ?? (chat.em ? new Date(chat.em) : deps.agora),
      });
      resultado.conversas += 1;
      for (const m of mensagens) {
        const gravadas = await db.query(
          `insert into public.mensagens (perfil_id, conversa_id, chat_id, direcao, autor, texto, provider_message_id, em)
           values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
           on conflict (provider_message_id) do nothing
           returning id`,
          [perfil.id, conversaId, chat.id, m.enviadaPelaConta ? "saida" : "entrada", m.enviadaPelaConta ? "humano" : "prospect", m.texto, m.id, m.em],
        );
        resultado.mensagens += gravadas.length;
      }
    }
    cursor = pagina.cursor ?? undefined;
  } while (cursor && vistas < max);
  return resultado;
}

export type ConversaExterna = {
  id: string;
  perfil: string;
  perfilId: string;
  nome: string | null;
  url: string | null;
  ultimoTexto: string | null;
  ultimaDirecao: "entrada" | "saida" | null;
  ultimaEm: Date | null;
  /** A pessoa está numa campanha deste perfil, mas ainda não falou depois disso. */
  campanha: string | null;
};

/** Conversas fora de campanha, mais recentes primeiro. Roda dentro de `comOperador`. */
export async function listarConversasExternas(db: Db, p: { perfilId?: string | null }): Promise<ConversaExterna[]> {
  return db.query<ConversaExterna>(
    `select c.id, pf.nome as perfil, pf.id as "perfilId", c.contraparte_nome as nome, c.contraparte_url as url,
            ultima.texto as "ultimoTexto", ultima.direcao as "ultimaDirecao", coalesce(ultima.em, c.ultima_em) as "ultimaEm",
            (select ca.nome from public.leads l
               join public.pessoas pe on pe.id = l.pessoa_id
               join public.campanhas ca on ca.id = l.campanha_id
              where l.perfil_id = c.perfil_id and pe.provider_id = c.contraparte_provider_id
                and l.estado not in ('triagem', 'rejeitado')
              order by l.criado_em desc limit 1) as campanha
       from public.conversas c
       join public.perfis pf on pf.id = c.perfil_id
       left join lateral (
         select texto, direcao, em from public.mensagens m where m.conversa_id = c.id order by em desc limit 1
       ) ultima on true
      where c.lead_id is null and ($1::uuid is null or c.perfil_id = $1::uuid)
      order by coalesce(ultima.em, c.ultima_em) desc nulls last
      limit 300`,
    [p.perfilId ?? null],
  );
}
