import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { primeiroNome } from "@/domain/texto";
import { classificarErroDaMeta, pedeParaSair, proximoStatusDoEnvio, type StatusDoEnvio, type TemplateDoWhatsapp } from "@/domain/disparos";
import { telefoneLegivel } from "@/domain/contatos";
import { canalParaEnvio, tokenDeVerificacaoDoWhatsapp, type CanalParaEnvio, type DadosDoWhatsapp } from "@/server/canais/canais";
import type { Db } from "@/server/db/tipos";
import type { Cofre } from "@/server/segredos";
import { sairDoCanal, telefoneDoWaId } from "./fila";

// O formato dos avisos: docs/pesquisa/whatsapp-cloud-api.md, seção Webhooks.

export type DependenciasDoWebhook = { db: Db; cofre: Cofre; agora: () => Date };

/** Uma resposta só conta para um envio de até 7 dias atrás (§4.18). */
const JANELA_DA_RESPOSTA_MS = 7 * 24 * 3_600_000;

const iguais = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** `X-Hub-Signature-256: sha256=<hex>`: HMAC-SHA256 do corpo cru com o app secret do cliente. */
export function assinaturaConfere(corpo: string, cabecalho: string | null, segredoDoApp: string): boolean {
  const recebida = cabecalho?.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!recebida) return false;
  return iguais(recebida, createHmac("sha256", segredoDoApp).update(corpo, "utf8").digest("hex"));
}

/**
 * GET da Meta para verificar o webhook (`hub.mode`, `hub.verify_token`,
 * `hub.challenge`). O verify token é derivado do id do canal; conferindo,
 * devolve o desafio e anota que o webhook foi verificado.
 */
export async function verificarWebhookWhatsapp(url: URL, canalId: string, deps: DependenciasDoWebhook): Promise<Response> {
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const desafio = url.searchParams.get("hub.challenge") ?? "";
  if (modo !== "subscribe" || !iguais(token, tokenDeVerificacaoDoWhatsapp(deps.cofre, canalId))) return new Response("não autorizado", { status: 403 });
  const anotados = await deps.db.query(
    `update public.canais set dados = jsonb_set(dados, '{webhookVerificadoEm}', to_jsonb($2::text))
      where id = $1::uuid and tipo = 'whatsapp' and status <> 'desconectado' returning id`,
    [canalId, deps.agora().toISOString()],
  );
  if (anotados.length === 0) return new Response("canal não encontrado", { status: 404 });
  return new Response(desafio, { status: 200, headers: { "content-type": "text/plain" } });
}

/**
 * POST da Meta (§4.19): confere a assinatura com o app secret do canal, grava
 * o corpo cru (não há API para buscar aviso antigo) com chave de idempotência
 * e processa na hora. Falhou o processamento, a fila dos disparos tenta de
 * novo; a Meta recebe 200 de qualquer jeito, para não repetir o que já está
 * guardado.
 */
export async function receberWebhookWhatsapp(req: Request, canalId: string, deps: DependenciasDoWebhook): Promise<Response> {
  const canal = await canalParaEnvio(deps.db, deps.cofre, { canalId });
  if (!canal || canal.tipo !== "whatsapp" || !canal.segredo) return Response.json({ erro: "canal não encontrado" }, { status: 404 });
  const bruto = await req.text();
  if (!assinaturaConfere(bruto, req.headers.get("x-hub-signature-256"), canal.segredo)) return Response.json({ erro: "assinatura inválida" }, { status: 401 });
  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return Response.json({ erro: "corpo não é JSON" }, { status: 400 });
  }
  const chave = `whatsapp:${createHash("sha256").update(bruto).digest("hex")}`;
  const [registro] = await deps.db.query<{ id: string }>(
    `insert into public.webhooks_dos_canais (canal_id, chave, payload, recebido_em) values ($1::uuid, $2, $3::jsonb, $4)
     on conflict (chave) do nothing returning id`,
    [canalId, chave, bruto, deps.agora()],
  );
  if (!registro) return Response.json({ ok: true, duplicado: true });
  await processarRegistro(deps, { id: registro.id, canal, payload: corpo });
  return Response.json({ ok: true });
}

/** Processa um aviso guardado e anota o resultado. Usado na chegada e na retentativa. */
export async function processarRegistro(deps: DependenciasDoWebhook, p: { id: string; canal: CanalParaEnvio; payload: unknown }): Promise<boolean> {
  try {
    await deps.db.transacao((tx) => processarAvisoDoWhatsapp(tx, { canal: p.canal, payload: p.payload, agora: deps.agora() }));
    await deps.db.query("update public.webhooks_dos_canais set processado_em = $2, erro = null where id = $1::uuid", [p.id, deps.agora()]);
    return true;
  } catch (erro) {
    await deps.db.query("update public.webhooks_dos_canais set tentativas = tentativas + 1, erro = $2 where id = $1::uuid", [p.id, (erro as Error).message.slice(0, 500)]);
    return false;
  }
}

type Json = Record<string, unknown>;
const lista = (valor: unknown): Json[] => (Array.isArray(valor) ? (valor as Json[]) : []);
const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const quando = (timestamp: unknown, agora: Date) => {
  const segundos = Number(timestamp);
  return Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : agora;
};

export type ResumoDoAviso = { status: number; mensagens: number; sairam: number };

/**
 * O que um aviso da Meta muda (§4.18 e §4.19):
 * - `statuses`: o envio anda (enviado < entregue < lido; falhou antes de
 *   entregue), sem voltar estado com aviso repetido ou fora de ordem;
 * - `messages`: a mensagem fica guardada, com o contato (achado pelo wa_id,
 *   pelo telefone ou pelo id de usuário; novo, sem autorização de disparo) e o
 *   envio que ela responde; "SAIR" e companhia tiram do WhatsApp;
 * - `user_preferences` com `stop`: a pessoa parou o marketing pelo próprio
 *   WhatsApp e sai do canal;
 * - `message_template_status_update`: o status do template guardado muda.
 *
 * Aviso de outro número da mesma WABA é ignorado.
 */
export async function processarAvisoDoWhatsapp(db: Db, p: { canal: CanalParaEnvio; payload: unknown; agora: Date }): Promise<ResumoDoAviso> {
  const resumo: ResumoDoAviso = { status: 0, mensagens: 0, sairam: 0 };
  const dados = p.canal.dados as DadosDoWhatsapp;
  for (const entrada of lista((p.payload as Json)?.entry)) {
    for (const mudanca of lista(entrada.changes)) {
      const valor = (mudanca.value ?? {}) as Json;
      const campo = mudanca.field;
      if (campo === "message_template_status_update") {
        await atualizarStatusDoTemplate(db, { canalId: p.canal.id, valor });
        continue;
      }
      const numero = texto((valor.metadata as Json | undefined)?.phone_number_id);
      if (numero && numero !== dados.phoneNumberId) continue;
      if (campo === "messages") {
        for (const status of lista(valor.statuses)) if (await aplicarStatus(db, { canal: p.canal, status, agora: p.agora })) resumo.status += 1;
        const contatos = lista(valor.contacts);
        for (const [indice, mensagem] of lista(valor.messages).entries()) {
          const contatoDaMeta = contatos.find((c) => c.wa_id === mensagem.from) ?? contatos[indice] ?? {};
          const resultado = await guardarMensagem(db, { canal: p.canal, mensagem, contatoDaMeta, agora: p.agora });
          if (resultado.guardada) resumo.mensagens += 1;
          if (resultado.saiu) resumo.sairam += 1;
        }
      }
      if (campo === "user_preferences") {
        for (const preferencia of lista(valor.user_preferences)) {
          if (preferencia.category !== "marketing_messages" || preferencia.value !== "stop") continue;
          const contato = await acharContato(db, { organizacaoId: p.canal.organizacaoId, waId: texto(preferencia.wa_id), usuarioId: texto(preferencia.user_id) });
          if (contato && (await sairDoCanal(db, { contatoId: contato, canal: "whatsapp", motivo: "Parou as mensagens de marketing pelo próprio WhatsApp.", agora: p.agora }))) {
            resumo.sairam += 1;
          }
        }
      }
    }
  }
  return resumo;
}

async function aplicarStatus(db: Db, p: { canal: CanalParaEnvio; status: Json; agora: Date }): Promise<boolean> {
  const wamid = texto(p.status.id);
  const aviso = texto(p.status.status);
  if (!wamid || !aviso) return false;
  const [envio] = await db.query<{ id: string; status: StatusDoEnvio; contato_id: string }>(
    `select e.id, e.status, e.contato_id from public.envios_do_disparo e join public.disparos d on d.id = e.disparo_id
      where e.provider_message_id = $1 and d.canal_id = $2::uuid for update of e`,
    [wamid, p.canal.id],
  );
  if (!envio) return false;
  const novo = proximoStatusDoEnvio(envio.status, aviso);
  if (!novo) return false;
  const em = quando(p.status.timestamp, p.agora);
  if (novo === "falhou") {
    const erro = lista(p.status.errors)[0] ?? {};
    const { classe, motivo } = classificarErroDaMeta(erro.code as number | string | undefined);
    await db.query(
      "update public.envios_do_disparo set status = 'falhou', motivo = $2, codigo_erro = $3, falhou_em = $4 where id = $1::uuid",
      [envio.id, motivo, erro.code === undefined ? null : String(erro.code), em],
    );
    if (classe === "saiu") await sairDoCanal(db, { contatoId: envio.contato_id, canal: "whatsapp", motivo, agora: p.agora });
    return true;
  }
  await db.query(
    `update public.envios_do_disparo
        set status = $2,
            enviado_em = coalesce(enviado_em, $3),
            entregue_em = case when $2 in ('entregue', 'lido') then coalesce(entregue_em, $3) else entregue_em end,
            lido_em = case when $2 = 'lido' then coalesce(lido_em, $3) else lido_em end
      where id = $1::uuid`,
    [envio.id, novo, em],
  );
  return true;
}

/** O texto da mensagem recebida, de qualquer tipo; o que não é texto vira o tipo entre colchetes. */
function textoDaMensagem(mensagem: Json): string {
  const tipo = texto(mensagem.type) ?? "mensagem";
  const doTipo = (mensagem[tipo] ?? {}) as Json;
  if (tipo === "text") return texto(doTipo.body) ?? "";
  if (tipo === "button") return texto(doTipo.text) ?? texto(doTipo.payload) ?? "[botão]";
  if (tipo === "interactive") {
    const resposta = (doTipo.button_reply ?? doTipo.list_reply ?? {}) as Json;
    return texto(resposta.title) ?? "[resposta]";
  }
  return texto(doTipo.caption) ?? `[${tipo}]`;
}

async function acharContato(db: Db, p: { organizacaoId: string; waId: string | null; usuarioId: string | null }): Promise<string | null> {
  const telefone = telefoneDoWaId(p.waId);
  const [contato] = await db.query<{ id: string }>(
    `select id from public.contatos
      where organizacao_id = $1::uuid
        and (($2::text is not null and whatsapp_wa_id = $2) or ($3::text is not null and telefone = $3) or ($4::text is not null and whatsapp_usuario_id = $4))
      order by (whatsapp_wa_id = $2) desc nulls last, criado_em
      limit 1`,
    [p.organizacaoId, p.waId, telefone, p.usuarioId],
  );
  return contato?.id ?? null;
}

/**
 * O contato de quem escreveu: achado ou criado (origem WhatsApp, sem a
 * autorização de disparo: escrever não é autorizar marketing, §4.19).
 */
async function contatoDeQuemEscreveu(db: Db, p: { organizacaoId: string; waId: string | null; usuarioId: string | null; nome: string | null; agora: Date }): Promise<string | null> {
  const achado = await acharContato(db, p);
  if (achado) {
    await db.query(
      "update public.contatos set whatsapp_wa_id = coalesce(whatsapp_wa_id, $2), whatsapp_usuario_id = coalesce(whatsapp_usuario_id, $3) where id = $1::uuid",
      [achado, p.waId, p.usuarioId],
    );
    return achado;
  }
  const telefone = telefoneDoWaId(p.waId);
  if (!telefone && !p.usuarioId) return null;
  const nome = p.nome?.trim().slice(0, 200) || (telefone ? telefoneLegivel(telefone) : "Contato do WhatsApp");
  const [criado] = await db.query<{ id: string }>(
    `insert into public.contatos (organizacao_id, nome, primeiro_nome, telefone, origem, whatsapp_wa_id, whatsapp_usuario_id, criado_em)
     values ($1::uuid, $2, $3, $4, 'whatsapp', $5, $6, $7)
     on conflict (organizacao_id, telefone) where telefone is not null do update set whatsapp_wa_id = coalesce(public.contatos.whatsapp_wa_id, excluded.whatsapp_wa_id)
     returning id`,
    [p.organizacaoId, nome, p.nome ? primeiroNome(p.nome) : null, telefone, p.waId, p.usuarioId, p.agora],
  );
  return criado?.id ?? null;
}

async function guardarMensagem(db: Db, p: { canal: CanalParaEnvio; mensagem: Json; contatoDaMeta: Json; agora: Date }): Promise<{ guardada: boolean; saiu: boolean }> {
  const id = texto(p.mensagem.id);
  if (!id) return { guardada: false, saiu: false };
  const perfil = (p.contatoDaMeta.profile ?? {}) as Json;
  const waId = texto(p.contatoDaMeta.wa_id) ?? texto(p.mensagem.from);
  const usuarioId = texto(p.contatoDaMeta.user_id) ?? texto(p.mensagem.from_user_id);
  const contatoId = await contatoDeQuemEscreveu(db, { organizacaoId: p.canal.organizacaoId, waId, usuarioId, nome: texto(perfil.name), agora: p.agora });
  const em = quando(p.mensagem.timestamp, p.agora);
  const corpo = textoDaMensagem(p.mensagem);

  // O envio que a mensagem responde: o do botão (context.id) ou o último a este contato, em até 7 dias.
  const contexto = texto((p.mensagem.context as Json | undefined)?.id);
  const [envio] = await db.query<{ id: string }>(
    `select e.id from public.envios_do_disparo e join public.disparos d on d.id = e.disparo_id
      where d.canal_id = $1::uuid and e.enviado_em is not null
        and (($2::text is not null and e.provider_message_id = $2)
             or ($2::text is null and e.contato_id = $3::uuid and e.enviado_em > $4))
      order by e.enviado_em desc limit 1`,
    [p.canal.id, contexto, contatoId, new Date(em.getTime() - JANELA_DA_RESPOSTA_MS)],
  );
  const guardadas = await db.query(
    `insert into public.mensagens_dos_canais (organizacao_id, canal_id, contato_id, direcao, texto, provider_message_id, envio_id, em, payload)
     values ($1::uuid, $2::uuid, $3::uuid, 'entrada', $4, $5, $6::uuid, $7, $8::jsonb)
     on conflict (canal_id, provider_message_id) do nothing returning id`,
    [p.canal.organizacaoId, p.canal.id, contatoId, corpo, id, envio?.id ?? null, em, JSON.stringify(p.mensagem)],
  );
  if (guardadas.length === 0) return { guardada: false, saiu: false };
  if (envio) await db.query("update public.envios_do_disparo set respondido_em = coalesce(respondido_em, $2) where id = $1::uuid", [envio.id, em]);
  let saiu = false;
  if (contatoId && pedeParaSair(corpo)) {
    saiu = await sairDoCanal(db, { contatoId, canal: "whatsapp", motivo: `Pediu para sair pelo WhatsApp: "${corpo.slice(0, 80)}"`, agora: p.agora });
  }
  return { guardada: true, saiu };
}

async function atualizarStatusDoTemplate(db: Db, p: { canalId: string; valor: Json }): Promise<void> {
  const id = p.valor.message_template_id === undefined ? null : String(p.valor.message_template_id);
  const evento = texto(p.valor.event);
  if (!id || !evento) return;
  const [canal] = await db.query<{ dados: DadosDoWhatsapp }>("select dados from public.canais where id = $1::uuid for update", [p.canalId]);
  if (!canal) return;
  const templates = (canal.dados.templates ?? []).map((t: TemplateDoWhatsapp) => (t.id === id ? { ...t, status: evento } : t));
  await db.query("update public.canais set dados = jsonb_set(dados, '{templates}', $2::jsonb) where id = $1::uuid", [p.canalId, JSON.stringify(templates)]);
}

/** Retenta os avisos guardados que falharam ao processar (a fila dos disparos chama). */
export async function reprocessarAvisosPendentes(deps: DependenciasDoWebhook): Promise<number> {
  const pendentes = await deps.db.query<{ id: string; canal_id: string; payload: unknown }>(
    `select w.id, w.canal_id, w.payload from public.webhooks_dos_canais w join public.canais c on c.id = w.canal_id
      where w.processado_em is null and w.tentativas < 10 and c.tipo = 'whatsapp'
      order by w.recebido_em limit 50`,
  );
  let processados = 0;
  for (const pendente of pendentes) {
    const canal = await canalParaEnvio(deps.db, deps.cofre, { canalId: pendente.canal_id });
    if (canal && (await processarRegistro(deps, { id: pendente.id, canal, payload: pendente.payload }))) processados += 1;
  }
  return processados;
}
