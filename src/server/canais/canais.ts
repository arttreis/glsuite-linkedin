import type { TipoDeCanal } from "@/domain/canais";
import type { TemplateDoWhatsapp } from "@/domain/disparos";
import { classificarErroDaMeta } from "@/domain/disparos";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Resultado } from "@/server/publicos/publicos";
import type { Cofre } from "@/server/segredos";
import { ErroDaMeta, type ClienteWhatsapp } from "@/server/whatsapp/cliente";

export type DadosDoWhatsapp = {
  wabaId: string;
  phoneNumberId: string;
  numero: string;
  nomeVerificado: string | null;
  qualidade: string | null;
  limite: string | null;
  templates: TemplateDoWhatsapp[];
  templatesEm: string | null;
  /** O app foi inscrito na WABA com o webhook do Kakou; se falhou, por quê. */
  inscricao: { ok: boolean; erro: string | null };
  /** A Meta chamou o webhook para verificar (GET com o verify token). */
  webhookVerificadoEm: string | null;
};

export type CanalNoPainel = {
  id: string;
  tipo: TipoDeCanal;
  nome: string;
  status: "conectado" | "erro" | "desconectado";
  dados: Record<string, unknown>;
  erro: string | null;
  conectadoEm: Date;
  verificadoEm: Date | null;
};

/** As colunas que o painel pode ler (o grant não dá as credenciais). */
const COLUNAS = `id, tipo, nome, status, dados, erro, conectado_em as "conectadoEm", verificado_em as "verificadoEm"`;

/** O canal da organização, sem as credenciais. Roda como o operador ou pela conexão do sistema. */
export async function obterCanal(db: Db, p: { organizacaoId: string; tipo: TipoDeCanal }): Promise<CanalNoPainel | null> {
  const [canal] = await db.query<CanalNoPainel>(`select ${COLUNAS} from public.canais where organizacao_id = $1::uuid and tipo = $2`, [p.organizacaoId, p.tipo]);
  return canal ?? null;
}

/** O caminho do webhook do WhatsApp de um canal. A URL inteira é `urlPublicaDoApp()` + este caminho. */
export const caminhoDoWebhookDoWhatsapp = (canalId: string) => `/api/webhooks/whatsapp/${canalId}`;

/** O verify token do webhook do WhatsApp: derivado da chave dos segredos, sem guardar. */
export const tokenDeVerificacaoDoWhatsapp = (cofre: Cofre, canalId: string) => cofre.derivar("whatsapp-webhook", canalId);

export type DependenciasDoCanal = { db: Db; whatsapp: ClienteWhatsapp; cofre: Cofre; urlDoApp: string };

const SO_DIGITOS = /^\d{5,30}$/;

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroDaMeta) {
    if (erro.semResposta) return "A Meta não respondeu. Tente de novo em instantes.";
    const { motivo } = classificarErroDaMeta(erro.codigo);
    return erro.codigo === "100" ? "A Meta não achou este id com este token. Confira o id do número e o da conta." : motivo;
  }
  return "Não deu para falar com a Meta agora. Tente de novo.";
}

/**
 * Conecta o WhatsApp da organização (§4.19), pelo app do próprio cliente na
 * Meta: confere o número e a WABA com o token, guarda o token e o app secret
 * cifrados e inscreve o app na WABA com o webhook do Kakou. Se a inscrição
 * falhar, o canal fica conectado (dá para disparar) e a tela mostra como
 * configurar o webhook à mão. Reconectar atualiza o mesmo canal.
 *
 * Roda pela conexão do sistema: o painel não escreve credencial. Quem chama
 * confere antes que o operador é admin e que a organização tem o módulo.
 */
export async function conectarWhatsapp(
  deps: DependenciasDoCanal,
  p: { organizacaoId: string; operadorId: string; wabaId: string; phoneNumberId: string; token: string; segredoDoApp: string; agora: Date },
): Promise<Resultado<{ canalId: string; inscrito: boolean }>> {
  const wabaId = p.wabaId.trim();
  const phoneNumberId = p.phoneNumberId.trim();
  const token = p.token.trim();
  const segredoDoApp = p.segredoDoApp.trim();
  if (!SO_DIGITOS.test(wabaId) || !SO_DIGITOS.test(phoneNumberId)) return { ok: false, erro: "Os ids da conta e do número são só números. Copie do WhatsApp Manager." };
  if (token.length < 20) return { ok: false, erro: "Cole o token permanente do usuário do sistema." };
  if (!/^[0-9a-f]{16,64}$/i.test(segredoDoApp)) return { ok: false, erro: "O segredo do app fica em Configurações do app > Básico, na Meta." };

  let numero;
  let templates: TemplateDoWhatsapp[];
  try {
    numero = await deps.whatsapp.conferirNumero({ phoneNumberId, token });
    templates = await deps.whatsapp.listarTemplates({ wabaId, token });
  } catch (erro) {
    return { ok: false, erro: mensagemDoErro(erro) };
  }

  const [outro] = await deps.db.query<{ organizacao_id: string }>(
    "select organizacao_id from public.canais where tipo = 'whatsapp' and status <> 'desconectado' and dados ->> 'phoneNumberId' = $1 and organizacao_id <> $2::uuid",
    [phoneNumberId, p.organizacaoId],
  );
  if (outro) return { ok: false, erro: "Este número já está conectado em outra organização do Kakou." };

  const dados: DadosDoWhatsapp = {
    wabaId,
    phoneNumberId,
    numero: numero.numero,
    nomeVerificado: numero.nomeVerificado,
    qualidade: numero.qualidade,
    limite: numero.limite,
    templates,
    templatesEm: p.agora.toISOString(),
    inscricao: { ok: false, erro: null },
    webhookVerificadoEm: null,
  };
  const [canal] = await deps.db.query<{ id: string }>(
    `insert into public.canais (organizacao_id, tipo, nome, status, credencial, segredo, dados, erro, conectado_em, conectado_por, verificado_em)
     values ($1::uuid, 'whatsapp', $2, 'conectado', $3, $4, $5::jsonb, null, $6, $7::uuid, $6)
     on conflict (organizacao_id, tipo) do update
       set nome = excluded.nome, status = 'conectado', credencial = excluded.credencial, segredo = excluded.segredo,
           dados = excluded.dados, erro = null, conectado_em = excluded.conectado_em, conectado_por = excluded.conectado_por,
           verificado_em = excluded.verificado_em
     returning id`,
    [p.organizacaoId, numero.numero, deps.cofre.cifrar(token), deps.cofre.cifrar(segredoDoApp), JSON.stringify(dados), p.agora, p.operadorId],
  );
  const canalId = canal!.id;

  let inscricao: DadosDoWhatsapp["inscricao"] = { ok: true, erro: null };
  try {
    await deps.whatsapp.inscreverApp({
      wabaId,
      token,
      urlDoWebhook: `${deps.urlDoApp}${caminhoDoWebhookDoWhatsapp(canalId)}`,
      tokenDeVerificacao: tokenDeVerificacaoDoWhatsapp(deps.cofre, canalId),
    });
  } catch (erro) {
    inscricao = { ok: false, erro: mensagemDoErro(erro) };
  }
  await deps.db.query("update public.canais set dados = jsonb_set(dados, '{inscricao}', $2::jsonb) where id = $1::uuid", [canalId, JSON.stringify(inscricao)]);
  await registrarEvento(deps.db, {
    tipo: "canal_conectado",
    entidade: "canal",
    entidadeId: canalId,
    payload: { tipo: "whatsapp", numero: numero.numero, inscrito: inscricao.ok },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true, canalId, inscrito: inscricao.ok };
}

/** Busca de novo os templates do WhatsApp (o cliente cria e edita no WhatsApp Manager). Pela conexão do sistema. */
export async function atualizarTemplates(deps: Omit<DependenciasDoCanal, "urlDoApp">, p: { organizacaoId: string; agora: Date }): Promise<Resultado<{ aprovados: number }>> {
  const canal = await canalParaEnvio(deps.db, deps.cofre, { organizacaoId: p.organizacaoId, tipo: "whatsapp" });
  if (!canal) return { ok: false, erro: "Conecte o WhatsApp antes." };
  try {
    const dados = canal.dados as DadosDoWhatsapp;
    const templates = await deps.whatsapp.listarTemplates({ wabaId: dados.wabaId, token: canal.token });
    const numero = await deps.whatsapp.conferirNumero({ phoneNumberId: dados.phoneNumberId, token: canal.token });
    await deps.db.query(
      `update public.canais
          set dados = dados || jsonb_build_object('templates', $2::jsonb, 'templatesEm', $3::text, 'qualidade', $4::text, 'limite', $5::text),
              verificado_em = $6, status = 'conectado', erro = null
        where id = $1::uuid`,
      [canal.id, JSON.stringify(templates), p.agora.toISOString(), numero.qualidade, numero.limite, p.agora],
    );
    return { ok: true, aprovados: templates.filter((t) => t.status === "APPROVED").length };
  } catch (erro) {
    return { ok: false, erro: mensagemDoErro(erro) };
  }
}

export type CanalParaEnvio = { id: string; organizacaoId: string; tipo: TipoDeCanal; status: string; token: string; segredo: string | null; dados: Record<string, unknown> };

/** O canal com as credenciais abertas, para a fila e os webhooks. Só pela conexão do sistema; desconectado, null. */
export async function canalParaEnvio(
  db: Db,
  cofre: Cofre,
  p: { canalId: string } | { organizacaoId: string; tipo: TipoDeCanal },
): Promise<CanalParaEnvio | null> {
  const [linha] = await db.query<{ id: string; organizacao_id: string; tipo: TipoDeCanal; status: string; credencial: string | null; segredo: string | null; dados: Record<string, unknown> }>(
    "canalId" in p
      ? "select id, organizacao_id, tipo, status, credencial, segredo, dados from public.canais where id = $1::uuid"
      : "select id, organizacao_id, tipo, status, credencial, segredo, dados from public.canais where organizacao_id = $1::uuid and tipo = $2",
    "canalId" in p ? [p.canalId] : [p.organizacaoId, p.tipo],
  );
  if (!linha || linha.status === "desconectado" || !linha.credencial) return null;
  return {
    id: linha.id,
    organizacaoId: linha.organizacao_id,
    tipo: linha.tipo,
    status: linha.status,
    token: cofre.decifrar(linha.credencial),
    segredo: linha.segredo ? cofre.decifrar(linha.segredo) : null,
    dados: linha.dados,
  };
}

/** O canal deu erro de conta (token, permissão, restrição): fica com o motivo até reconectar ou atualizar. */
export async function marcarCanalComErro(db: Db, p: { canalId: string; motivo: string; agora: Date }): Promise<void> {
  await db.query("update public.canais set status = 'erro', erro = $2 where id = $1::uuid and status <> 'desconectado'", [p.canalId, p.motivo]);
  await registrarEvento(db, { tipo: "canal_com_erro", entidade: "canal", entidadeId: p.canalId, payload: { motivo: p.motivo }, em: p.agora });
}

/**
 * Pausa os disparos do canal que estão agendados ou saindo (§4.14 e §4.18),
 * com o motivo. Ninguém retoma sozinho: a pessoa retoma. Devolve quantos.
 */
export async function pausarDisparosDoCanal(db: Db, p: { organizacaoId: string; tipo: TipoDeCanal; motivo: string; agora: Date }): Promise<number> {
  const pausados = await db.query<{ id: string }>(
    `update public.disparos set status = 'pausado', motivo_pausa = $3
      where organizacao_id = $1::uuid and canal_tipo = $2 and status in ('agendado', 'enviando')
      returning id`,
    [p.organizacaoId, p.tipo, p.motivo],
  );
  for (const { id } of pausados) {
    await registrarEvento(db, { tipo: "disparo_pausado", entidade: "disparo", entidadeId: id, payload: { motivo: p.motivo }, em: p.agora });
  }
  return pausados.length;
}

/**
 * Desconecta o canal (§4.19): as credenciais saem do banco e os disparos dele
 * que estavam agendados ou saindo pausam. Os contatos e os disparos feitos
 * ficam. Pela conexão do sistema; quem chama confere que é o admin.
 */
export async function desconectarCanal(db: Db, p: { organizacaoId: string; tipo: TipoDeCanal; operadorId: string; agora: Date }): Promise<Resultado<{ disparosPausados: number }>> {
  return db.transacao(async (tx) => {
    const desconectados = await tx.query<{ id: string }>(
      `update public.canais set status = 'desconectado', credencial = null, segredo = null, erro = null
        where organizacao_id = $1::uuid and tipo = $2 and status <> 'desconectado' returning id`,
      [p.organizacaoId, p.tipo],
    );
    if (desconectados.length === 0) return { ok: false, erro: "O canal já estava desconectado." };
    const disparosPausados = await pausarDisparosDoCanal(tx, { organizacaoId: p.organizacaoId, tipo: p.tipo, motivo: "O canal foi desconectado.", agora: p.agora });
    await registrarEvento(tx, { tipo: "canal_desconectado", entidade: "canal", entidadeId: desconectados[0]!.id, payload: { tipo: p.tipo }, ator: p.operadorId, em: p.agora });
    return { ok: true, disparosPausados };
  });
}
