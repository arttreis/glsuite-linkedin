import { timingSafeEqual } from "node:crypto";
import { boasVindasPadrao, codigoDoStart, ehComandoDeSair, pedeParaSair, textoDoTelegram } from "@/domain/disparos";
import { primeiroNome } from "@/domain/texto";
import { canalParaEnvio, type CanalParaEnvio } from "@/server/canais/canais";
import { segredoDoWebhookDoTelegram } from "@/server/canais/telegram";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Cofre } from "@/server/segredos";
import type { ClienteTelegram } from "@/server/telegram/cliente";
import { sairDoCanal } from "./fila";

// O formato dos avisos: docs/pesquisa/telegram-bot-api.md, seção Entrada.

export type DependenciasDoWebhookDoTelegram = { db: Db; cofre: Cofre; telegram: ClienteTelegram; agora: () => Date };

const JANELA_DA_RESPOSTA_MS = 7 * 24 * 3_600_000;

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Aviso do Telegram (§4.20): confere o `X-Telegram-Bot-Api-Secret-Token`
 * (derivado do canal), grava o update com a chave `(canal, update_id)` e
 * processa. A resposta é 200 mesmo se o processamento falhar (a fila retenta),
 * para o Telegram não segurar os próximos avisos do mesmo chat.
 */
export async function receberWebhookDoTelegram(req: Request, canalId: string, deps: DependenciasDoWebhookDoTelegram): Promise<Response> {
  if (!iguais(req.headers.get("x-telegram-bot-api-secret-token") ?? "", segredoDoWebhookDoTelegram(deps.cofre, canalId))) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }
  const canal = await canalParaEnvio(deps.db, deps.cofre, { canalId });
  if (!canal || canal.tipo !== "telegram") return Response.json({ erro: "canal não encontrado" }, { status: 404 });
  let update: Record<string, unknown>;
  try {
    update = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ erro: "corpo não é JSON" }, { status: 400 });
  }
  const [registro] = await deps.db.query<{ id: string }>(
    `insert into public.webhooks_dos_canais (canal_id, chave, payload, recebido_em) values ($1::uuid, $2, $3::jsonb, $4)
     on conflict (chave) do nothing returning id`,
    [canalId, `telegram:${canalId}:${String(update.update_id ?? "")}`, JSON.stringify(update), deps.agora()],
  );
  if (!registro) return Response.json({ ok: true, duplicado: true });
  await processarRegistroDoTelegram(deps, { id: registro.id, canal, update });
  return Response.json({ ok: true });
}

export async function processarRegistroDoTelegram(deps: DependenciasDoWebhookDoTelegram, p: { id: string; canal: CanalParaEnvio; update: unknown }): Promise<boolean> {
  try {
    const respostas = await deps.db.transacao((tx) => processarUpdateDoTelegram(tx, { canal: p.canal, update: p.update, agora: deps.agora() }));
    await deps.db.query("update public.webhooks_dos_canais set processado_em = $2, erro = null where id = $1::uuid", [p.id, deps.agora()]);
    // A resposta do bot sai depois de gravar: se o Telegram falhar, o contato já entrou (ou saiu).
    for (const resposta of respostas) {
      await deps.telegram.enviarMensagem({ token: p.canal.token, chatId: resposta.chatId, texto: resposta.texto }).catch(() => undefined);
    }
    return true;
  } catch (erro) {
    await deps.db.query("update public.webhooks_dos_canais set tentativas = tentativas + 1, erro = $2 where id = $1::uuid", [p.id, (erro as Error).message.slice(0, 500)]);
    return false;
  }
}

type Json = Record<string, unknown>;
const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const idDe = (valor: unknown): string | null => (typeof valor === "number" || (typeof valor === "string" && /^-?\d+$/.test(valor)) ? String(valor) : null);
const quando = (data: unknown, agora: Date) => (typeof data === "number" && data > 0 ? new Date(data * 1000) : agora);

export type RespostaDoBot = { chatId: string; texto: string };

/**
 * O que um update do Telegram muda (§4.20), só em chat privado:
 * - `/start` (com ou sem o código de um link): o contato entra ou volta, com o
 *   nome e o @usuário, ganha a tag do link e recebe as boas-vindas;
 * - `/sair`, `/stop` ou "sair": sai do Telegram, e o bot confirma;
 * - outra mensagem: fica guardada e conta como resposta ao último envio em 7
 *   dias;
 * - `my_chat_member` com `kicked`: bloqueou o bot, sai do Telegram.
 * Quem pediu para não ser contatado não volta pelo /start e não recebe nada.
 * Devolve as respostas que o bot manda.
 */
export async function processarUpdateDoTelegram(db: Db, p: { canal: CanalParaEnvio; update: unknown; agora: Date }): Promise<RespostaDoBot[]> {
  const update = (p.update ?? {}) as Json;
  const membro = update.my_chat_member as Json | undefined;
  if (membro) {
    const chat = (membro.chat ?? {}) as Json;
    const status = ((membro.new_chat_member ?? {}) as Json).status;
    const chatId = idDe(chat.id);
    if (chat.type === "private" && chatId && status === "kicked") {
      const contatoId = await contatoDoChat(db, { organizacaoId: p.canal.organizacaoId, chatId });
      if (contatoId) await sairDoCanal(db, { contatoId, canal: "telegram", motivo: "Bloqueou o bot.", agora: quando(membro.date, p.agora) });
    }
    return [];
  }

  const mensagem = update.message as Json | undefined;
  if (!mensagem) return [];
  const chat = (mensagem.chat ?? {}) as Json;
  const de = (mensagem.from ?? {}) as Json;
  const chatId = idDe(chat.id);
  if (chat.type !== "private" || !chatId || de.is_bot === true) return [];
  const corpo = texto(mensagem.text) ?? texto(mensagem.caption) ?? "[mensagem sem texto]";
  const em = quando(mensagem.date, p.agora);
  const nome = [texto(de.first_name), texto(de.last_name)].filter(Boolean).join(" ") || texto(de.username) || "Contato do Telegram";
  const usuario = texto(de.username);
  const [organizacao] = await db.query<{ nome: string }>("select nome from public.organizacoes where id = $1::uuid", [p.canal.organizacaoId]);

  const codigo = codigoDoStart(corpo);
  if (codigo !== undefined) {
    const contato = await entrarPeloBot(db, { canal: p.canal, chatId, nome, usuario, codigo, agora: p.agora });
    if (!contato || contato.naoContatar) return [];
    const [canal] = await db.query<{ boas_vindas: string | null }>("select boas_vindas from public.canais where id = $1::uuid", [p.canal.id]);
    const boasVindas = textoDoTelegram(canal?.boas_vindas || boasVindasPadrao(organizacao?.nome ?? "empresa"), {
      nome,
      primeiroNome: primeiroNome(nome),
      empresa: organizacao?.nome ?? null,
      cargo: null,
    });
    return boasVindas.ok ? [{ chatId, texto: boasVindas.texto }] : [];
  }

  const contatoId = await contatoDoChat(db, { organizacaoId: p.canal.organizacaoId, chatId });
  await guardarMensagem(db, { canal: p.canal, contatoId, mensagemId: String(mensagem.message_id ?? update.update_id ?? ""), chatId, texto: corpo, em, payload: mensagem });
  if (contatoId && (ehComandoDeSair(corpo) || pedeParaSair(corpo))) {
    const saiu = await sairDoCanal(db, { contatoId, canal: "telegram", motivo: `Pediu para sair pelo Telegram: "${corpo.slice(0, 80)}"`, agora: p.agora });
    if (saiu) return [{ chatId, texto: `Pronto, você não recebe mais mensagens da ${organizacao?.nome ?? "empresa"} por aqui. Para voltar, mande /start.` }];
  }
  return [];
}

async function contatoDoChat(db: Db, p: { organizacaoId: string; chatId: string }): Promise<string | null> {
  const [contato] = await db.query<{ id: string }>("select id from public.contatos where organizacao_id = $1::uuid and telegram_id = $2", [p.organizacaoId, p.chatId]);
  return contato?.id ?? null;
}

/**
 * Quem deu /start: contato novo (origem Telegram) ou de volta. Volta quem saiu
 * do Telegram; quem pediu para não ser contatado continua de fora. O código do
 * link põe a tag dele.
 */
async function entrarPeloBot(
  db: Db,
  p: { canal: CanalParaEnvio; chatId: string; nome: string; usuario: string | null; codigo: string | null; agora: Date },
): Promise<{ id: string; naoContatar: boolean } | null> {
  const [contato] = await db.query<{ id: string; nao_contatar_em: Date | null; voltou: boolean }>(
    `insert into public.contatos (organizacao_id, nome, primeiro_nome, origem, telegram_canal_id, telegram_id, telegram_usuario, telegram_entrou_em, criado_em)
     values ($1::uuid, $2, $3, 'telegram', $4::uuid, $5, $6, $7, $7)
     on conflict (organizacao_id, telegram_id) where telegram_id is not null do update
       set telegram_canal_id = excluded.telegram_canal_id,
           telegram_usuario = coalesce(excluded.telegram_usuario, public.contatos.telegram_usuario),
           telegram_entrou_em = coalesce(public.contatos.telegram_entrou_em, excluded.telegram_entrou_em),
           telegram_saiu_em = case when public.contatos.nao_contatar_em is null then null else public.contatos.telegram_saiu_em end,
           telegram_motivo = case when public.contatos.nao_contatar_em is null then null else public.contatos.telegram_motivo end
     returning id, nao_contatar_em, (xmax <> 0) as voltou`,
    [p.canal.organizacaoId, p.nome.slice(0, 200), primeiroNome(p.nome), p.canal.id, p.chatId, p.usuario, p.agora],
  );
  if (!contato) return null;
  if (p.codigo) {
    const [link] = await db.query<{ tag_id: string | null }>("select tag_id from public.links_de_entrada where canal_id = $1::uuid and codigo = $2", [p.canal.id, p.codigo]);
    if (link?.tag_id) {
      await db.query("insert into public.contato_tags (contato_id, tag_id, em, por) values ($1::uuid, $2::uuid, $3, 'telegram') on conflict do nothing", [
        contato.id,
        link.tag_id,
        p.agora,
      ]);
    }
  }
  await registrarEvento(db, {
    tipo: contato.voltou ? "contato_voltou_pelo_telegram" : "contato_entrou_pelo_telegram",
    entidade: "contato",
    entidadeId: contato.id,
    payload: { codigo: p.codigo },
    em: p.agora,
  });
  return { id: contato.id, naoContatar: contato.nao_contatar_em !== null };
}

async function guardarMensagem(
  db: Db,
  p: { canal: CanalParaEnvio; contatoId: string | null; mensagemId: string; chatId: string; texto: string; em: Date; payload: Json },
): Promise<void> {
  const [envio] = await db.query<{ id: string }>(
    `select e.id from public.envios_do_disparo e join public.disparos d on d.id = e.disparo_id
      where d.canal_id = $1::uuid and e.contato_id = $2::uuid and e.enviado_em > $3 order by e.enviado_em desc limit 1`,
    [p.canal.id, p.contatoId, new Date(p.em.getTime() - JANELA_DA_RESPOSTA_MS)],
  );
  const guardadas = await db.query(
    `insert into public.mensagens_dos_canais (organizacao_id, canal_id, contato_id, direcao, texto, provider_message_id, envio_id, em, payload)
     values ($1::uuid, $2::uuid, $3::uuid, 'entrada', $4, $5, $6::uuid, $7, $8::jsonb)
     on conflict (canal_id, provider_message_id) do nothing returning id`,
    [p.canal.organizacaoId, p.canal.id, p.contatoId, p.texto, `${p.chatId}:${p.mensagemId}`, envio?.id ?? null, p.em, JSON.stringify(p.payload)],
  );
  if (guardadas.length > 0 && envio) {
    await db.query("update public.envios_do_disparo set respondido_em = coalesce(respondido_em, $2) where id = $1::uuid", [envio.id, p.em]);
  }
}

/** Retenta os updates guardados do Telegram que falharam ao processar (a fila dos disparos chama). */
export async function reprocessarAvisosDoTelegram(deps: DependenciasDoWebhookDoTelegram): Promise<number> {
  const pendentes = await deps.db.query<{ id: string; canal_id: string; payload: unknown }>(
    `select w.id, w.canal_id, w.payload from public.webhooks_dos_canais w join public.canais c on c.id = w.canal_id
      where w.processado_em is null and w.tentativas < 10 and c.tipo = 'telegram'
      order by w.recebido_em limit 50`,
  );
  let processados = 0;
  for (const pendente of pendentes) {
    const canal = await canalParaEnvio(deps.db, deps.cofre, { canalId: pendente.canal_id });
    if (canal && (await processarRegistroDoTelegram(deps, { id: pendente.id, canal, update: pendente.payload }))) processados += 1;
  }
  return processados;
}
