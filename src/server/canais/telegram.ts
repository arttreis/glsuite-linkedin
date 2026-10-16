import { randomBytes } from "node:crypto";
import { boasVindasPadrao } from "@/domain/disparos";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Resultado } from "@/server/publicos/publicos";
import type { Cofre } from "@/server/segredos";
import { ErroDoTelegram, type ClienteTelegram } from "@/server/telegram/cliente";
import { canalParaEnvio, desconectarCanal } from "./canais";

export type DadosDoTelegram = { botId: string; usuario: string; nome: string; webhook: { ok: boolean; erro: string | null } };

/** O caminho do webhook do Telegram de um canal (a URL inteira é `urlPublicaDoApp()` + este caminho). */
export const caminhoDoWebhookDoTelegram = (canalId: string) => `/api/webhooks/telegram/${canalId}`;

/** O `secret_token` do webhook: derivado da chave dos segredos e do canal, sem guardar (64 caracteres hex). */
export const segredoDoWebhookDoTelegram = (cofre: Cofre, canalId: string) => cofre.derivar("telegram-webhook", canalId);

/** O link do bot, com ou sem o código de um link de entrada (§4.20). */
export const linkDoBot = (usuario: string, codigo?: string | null) => `https://t.me/${usuario}${codigo ? `?start=${codigo}` : ""}`;

export type DependenciasDoTelegram = { db: Db; telegram: ClienteTelegram; cofre: Cofre; urlDoApp: string };

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroDoTelegram) {
    if (erro.semResposta) return "O Telegram não respondeu. Tente de novo em instantes.";
    if (erro.codigo === "401" || erro.codigo === "404") return "O Telegram não reconheceu este token. Copie de novo no @BotFather (é o texto depois de \"Use this token\").";
    return `O Telegram recusou: ${erro.descricao}`;
  }
  return "Não deu para falar com o Telegram agora. Tente de novo.";
}

export type Conexao = Resultado<{ canalId: string; usuario: string }> | { ok: false; erro: string; outroWebhook: string };

/**
 * Conecta o bot da organização (§4.20): confere o token (`getMe`), guarda
 * cifrado e liga o webhook do Kakou com o segredo do canal. Se o bot já manda
 * os avisos para outro sistema, só conecta com `tomarDoOutro`: um bot tem um
 * webhook só, e ligar o Kakou desliga o outro. Pela conexão do sistema; quem
 * chama confere o admin e o módulo.
 */
export async function conectarTelegram(
  deps: DependenciasDoTelegram,
  p: { organizacaoId: string; operadorId: string; organizacaoNome: string; token: string; tomarDoOutro: boolean; agora: Date },
): Promise<Conexao> {
  const token = p.token.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) return { ok: false, erro: "Cole o token que o @BotFather mostrou (números, dois-pontos e letras)." };
  let bot;
  let webhook;
  try {
    bot = await deps.telegram.conferirBot(token);
    webhook = await deps.telegram.webhookAtual(token);
  } catch (erro) {
    return { ok: false, erro: mensagemDoErro(erro) };
  }
  const [outro] = await deps.db.query(
    "select 1 from public.canais where tipo = 'telegram' and status <> 'desconectado' and dados ->> 'botId' = $1 and organizacao_id <> $2::uuid",
    [bot.id, p.organizacaoId],
  );
  if (outro) return { ok: false, erro: "Este bot já está conectado em outra organização do Kakou." };

  const [existente] = await deps.db.query<{ id: string }>("select id from public.canais where organizacao_id = $1::uuid and tipo = 'telegram'", [p.organizacaoId]);
  const nossoCaminho = existente ? caminhoDoWebhookDoTelegram(existente.id) : null;
  if (webhook.url && !(nossoCaminho && webhook.url.endsWith(nossoCaminho)) && !p.tomarDoOutro) {
    return { ok: false, erro: "Este bot já manda os avisos para outro sistema. Conectar aqui desliga esse outro.", outroWebhook: webhook.url };
  }

  const dados: DadosDoTelegram = { botId: bot.id, usuario: bot.usuario, nome: bot.nome, webhook: { ok: false, erro: null } };
  const [canal] = await deps.db.query<{ id: string }>(
    `insert into public.canais (organizacao_id, tipo, nome, status, credencial, dados, boas_vindas, erro, conectado_em, conectado_por, verificado_em)
     values ($1::uuid, 'telegram', $2, 'conectado', $3, $4::jsonb, $5, null, $6, $7::uuid, $6)
     on conflict (organizacao_id, tipo) do update
       set nome = excluded.nome, status = 'conectado', credencial = excluded.credencial, dados = excluded.dados,
           boas_vindas = coalesce(public.canais.boas_vindas, excluded.boas_vindas), erro = null,
           conectado_em = excluded.conectado_em, conectado_por = excluded.conectado_por, verificado_em = excluded.verificado_em
     returning id`,
    [p.organizacaoId, `@${bot.usuario}`, deps.cofre.cifrar(token), JSON.stringify(dados), boasVindasPadrao(p.organizacaoNome), p.agora, p.operadorId],
  );
  const canalId = canal!.id;
  let ligado: DadosDoTelegram["webhook"] = { ok: true, erro: null };
  try {
    await deps.telegram.ligarWebhook({ token, url: `${deps.urlDoApp}${caminhoDoWebhookDoTelegram(canalId)}`, segredo: segredoDoWebhookDoTelegram(deps.cofre, canalId) });
  } catch (erro) {
    ligado = { ok: false, erro: mensagemDoErro(erro) };
  }
  await deps.db.query("update public.canais set dados = jsonb_set(dados, '{webhook}', $2::jsonb) where id = $1::uuid", [canalId, JSON.stringify(ligado)]);
  if (!ligado.ok) return { ok: false, erro: `O bot conectou, mas o Telegram não aceitou o webhook: ${ligado.erro}` };
  await registrarEvento(deps.db, { tipo: "canal_conectado", entidade: "canal", entidadeId: canalId, payload: { tipo: "telegram", bot: bot.usuario }, ator: p.operadorId, em: p.agora });
  return { ok: true, canalId, usuario: bot.usuario };
}

/** Desliga o webhook no Telegram (se der) e desconecta o canal: o token sai do Kakou e os disparos pausam. */
export async function desconectarTelegram(deps: Omit<DependenciasDoTelegram, "urlDoApp">, p: { organizacaoId: string; operadorId: string; agora: Date }) {
  const canal = await canalParaEnvio(deps.db, deps.cofre, { organizacaoId: p.organizacaoId, tipo: "telegram" });
  if (canal) await deps.telegram.desligarWebhook(canal.token).catch(() => undefined);
  return desconectarCanal(deps.db, { organizacaoId: p.organizacaoId, tipo: "telegram", operadorId: p.operadorId, agora: p.agora });
}

/** A mensagem de boas-vindas do bot (§4.20). Roda pela conexão do sistema, presa à organização. */
export async function salvarBoasVindas(db: Db, p: { organizacaoId: string; texto: unknown }): Promise<Resultado> {
  const texto = typeof p.texto === "string" ? p.texto.trim().slice(0, 1000) : "";
  if (!texto) return { ok: false, erro: "Escreva a mensagem de boas-vindas." };
  const salvos = await db.query("update public.canais set boas_vindas = $2 where organizacao_id = $1::uuid and tipo = 'telegram' returning id", [p.organizacaoId, texto]);
  return salvos.length > 0 ? { ok: true } : { ok: false, erro: "Conecte o bot antes." };
}

export type LinkDeEntrada = { id: string; codigo: string; nome: string; tagId: string | null; tagNome: string | null; contatos: number };

/** Os links de entrada do bot, com quantos entraram por cada um. Roda como o operador. */
export async function listarLinksDeEntrada(db: Db, canalId: string): Promise<LinkDeEntrada[]> {
  return db.query<LinkDeEntrada>(
    `select l.id, l.codigo, l.nome, l.tag_id as "tagId", t.nome as "tagNome",
            (select count(*)::int from public.contato_tags ct where l.tag_id is not null and ct.tag_id = l.tag_id) as contatos
       from public.links_de_entrada l left join public.tags t on t.id = l.tag_id
      where l.canal_id = $1::uuid order by l.criado_em`,
    [canalId],
  );
}

/** Um link de entrada com tag (§4.20): o código é aleatório, porque nome de tag com acento ou espaço não cabe no link. Roda como o operador. */
export async function criarLinkDeEntrada(
  db: Db,
  p: { canalId: string; nome: unknown; tagId: string | null; operadorId: string; agora: Date },
): Promise<Resultado<{ codigo: string }>> {
  const nome = typeof p.nome === "string" ? p.nome.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (!nome) return { ok: false, erro: "Dê um nome ao link (só a equipe vê)." };
  if (!p.tagId) return { ok: false, erro: "Escolha a tag que o link põe em quem entra." };
  const [tag] = await db.query("select 1 from public.tags where id = $1::uuid", [p.tagId]);
  if (!tag) return { ok: false, erro: "Tag não encontrada." };
  const codigo = randomBytes(9).toString("base64url");
  await db.query(
    "insert into public.links_de_entrada (canal_id, codigo, nome, tag_id, criado_por, criado_em) values ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6)",
    [p.canalId, codigo, nome, p.tagId, p.operadorId, p.agora],
  );
  return { ok: true, codigo };
}

export async function apagarLinkDeEntrada(db: Db, linkId: string): Promise<Resultado> {
  const apagados = await db.query("delete from public.links_de_entrada where id = $1::uuid returning id", [linkId]);
  return apagados.length > 0 ? { ok: true } : { ok: false, erro: "Link não encontrado." };
}
