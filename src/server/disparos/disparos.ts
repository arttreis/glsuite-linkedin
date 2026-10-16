import { z } from "zod";
import {
  CAMPOS_DO_CONTATO,
  classificarErroDaMeta,
  dentroDaJanela,
  estimativaDoCusto,
  limiteDoTier,
  motivoParaPular,
  preencherTemplate,
  proximaAbertura,
  type ConteudoDoDisparo,
  type ConteudoDoWhatsapp,
  type JanelaDosDisparos,
  type StatusDoDisparo,
  type StatusDoEnvio,
  type TemplateDoWhatsapp,
  type TipoDeCanal,
} from "@/domain/disparos";
import { renderizarTemplate } from "@/domain/template";
import { filtroDoSegmento, sqlDoFiltro, type FiltroDeContatos } from "@/domain/filtro-de-contatos";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Resultado } from "@/server/publicos/publicos";
import { obterCanal, type DadosDoWhatsapp } from "@/server/canais/canais";

export const MAX_NOME_DO_DISPARO = 120;
const ENVIOS_POR_INSERT = 1000;

// --- Entrada do rascunho -------------------------------------------------------------

const fonte = z.union([z.object({ campo: z.enum(CAMPOS_DO_CONTATO) }), z.object({ texto: z.string().max(2000) })]);

export const esquemaDoConteudo = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("whatsapp"), templateId: z.string().min(1).max(64), variaveis: z.record(z.string().max(80), fonte) }),
  z.object({
    tipo: z.literal("telegram"),
    texto: z.string().trim().min(1).max(4096),
    botao: z.object({ texto: z.string().trim().min(1).max(64), url: z.url().max(2000) }).nullable(),
  }),
]);
export type EntradaDoConteudo = z.infer<typeof esquemaDoConteudo>;

/**
 * O conteúdo como o disparo guarda. No WhatsApp, o template vem do que o
 * Kakou leu da Meta (só aprovado), e não do que o navegador mandou.
 */
function conteudoGuardado(entrada: EntradaDoConteudo, templates: TemplateDoWhatsapp[]): Resultado<{ conteudo: ConteudoDoDisparo }> {
  if (entrada.tipo === "telegram") return { ok: true, conteudo: { tipo: "telegram", texto: entrada.texto, botao: entrada.botao } };
  const template = templates.find((t) => t.id === entrada.templateId);
  if (!template) return { ok: false, erro: "Esse template não está mais na conta. Atualize os templates em Configurações > WhatsApp." };
  if (template.status !== "APPROVED") return { ok: false, erro: `O template "${template.nome}" não está aprovado pela Meta.` };
  return { ok: true, conteudo: { tipo: "whatsapp", template, variaveis: entrada.variaveis } };
}

/** Cria ou salva o rascunho (§4.18). Confirmado não se edita. Roda como o operador. */
export async function salvarRascunho(
  db: Db,
  p: { organizacaoId: string; id: string | null; canal: TipoDeCanal; nome: unknown; segmentoId: string; conteudo: unknown; operadorId: string; agora: Date },
): Promise<Resultado<{ id: string }>> {
  const nome = typeof p.nome === "string" ? p.nome.replace(/\s+/g, " ").trim().slice(0, MAX_NOME_DO_DISPARO) : "";
  if (!nome) return { ok: false, erro: "Dê um nome ao disparo (só você vê)." };
  const lido = esquemaDoConteudo.safeParse(p.conteudo);
  if (!lido.success || lido.data.tipo !== p.canal) return { ok: false, erro: "Escolha a mensagem do disparo." };
  const canal = await obterCanal(db, { organizacaoId: p.organizacaoId, tipo: p.canal });
  if (!canal || canal.status === "desconectado") return { ok: false, erro: `Conecte o ${p.canal === "whatsapp" ? "WhatsApp" : "Telegram"} em Configurações antes.` };
  const [segmento] = await db.query("select 1 from public.segmentos where id = $1::uuid and organizacao_id = $2::uuid", [p.segmentoId, p.organizacaoId]);
  if (!segmento) return { ok: false, erro: "Escolha um segmento." };
  const guardado = conteudoGuardado(lido.data, ((canal.dados as Partial<DadosDoWhatsapp>).templates ?? []) as TemplateDoWhatsapp[]);
  if (!guardado.ok) return guardado;

  if (p.id) {
    const salvos = await db.query(
      `update public.disparos set nome = $3, segmento_id = $4::uuid, conteudo = $5::jsonb, canal_id = $6::uuid
        where id = $1::uuid and organizacao_id = $2::uuid and status = 'rascunho' returning id`,
      [p.id, p.organizacaoId, nome, p.segmentoId, JSON.stringify(guardado.conteudo), canal.id],
    );
    if (salvos.length === 0) return { ok: false, erro: "Disparo confirmado não se edita: pause, retome ou cancele." };
    return { ok: true, id: p.id };
  }
  const [criado] = await db.query<{ id: string }>(
    `insert into public.disparos (organizacao_id, canal_id, canal_tipo, nome, segmento_id, conteudo, criado_por, criado_em)
     values ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::jsonb, $7::uuid, $8) returning id`,
    [p.organizacaoId, canal.id, p.canal, nome, p.segmentoId, JSON.stringify(guardado.conteudo), p.operadorId, p.agora],
  );
  return { ok: true, id: criado!.id };
}

// --- Conferência -----------------------------------------------------------------------

export type DisparoGuardado = {
  id: string;
  organizacaoId: string;
  canalId: string;
  canalTipo: TipoDeCanal;
  nome: string;
  segmentoId: string | null;
  segmentoNome: string | null;
  filtros: FiltroDeContatos;
  conteudo: ConteudoDoDisparo;
  status: StatusDoDisparo;
  motivoPausa: string | null;
  agendadoPara: Date | null;
  confirmadoEm: Date | null;
  confirmadoPor: string | null;
  iniciadoEm: Date | null;
  concluidoEm: Date | null;
  total: number;
  criadoEm: Date;
};

const COLUNAS_DO_DISPARO = `
  d.id, d.organizacao_id as "organizacaoId", d.canal_id as "canalId", d.canal_tipo as "canalTipo", d.nome,
  d.segmento_id as "segmentoId", s.nome as "segmentoNome", coalesce(s.filtros, d.filtros) as "filtrosAtuais", d.filtros,
  d.conteudo, d.status, d.motivo_pausa as "motivoPausa", d.agendado_para as "agendadoPara", d.confirmado_em as "confirmadoEm",
  (select o.nome from public.operadores o where o.id = d.confirmado_por) as "confirmadoPor",
  d.iniciado_em as "iniciadoEm", d.concluido_em as "concluidoEm", d.total, d.criado_em as "criadoEm"`;

/**
 * O disparo da organização. No rascunho, o filtro é o do segmento agora; depois
 * de confirmado, o que ficou guardado na confirmação. Roda como o operador;
 * de outra organização, null.
 */
export async function obterDisparo(db: Db, p: { id: string; organizacaoId: string }): Promise<DisparoGuardado | null> {
  const [linha] = await db.query<DisparoGuardado & { filtrosAtuais: unknown }>(
    `select ${COLUNAS_DO_DISPARO} from public.disparos d left join public.segmentos s on s.id = d.segmento_id
      where d.id = $1::uuid and d.organizacao_id = $2::uuid`,
    [p.id, p.organizacaoId],
  );
  if (!linha) return null;
  const { filtrosAtuais, ...disparo } = linha;
  return { ...disparo, filtros: filtroDoSegmento(disparo.status === "rascunho" ? filtrosAtuais : disparo.filtros) };
}

type ContatoDoSegmento = {
  id: string;
  nome: string;
  primeiroNome: string | null;
  empresa: string | null;
  cargo: string | null;
  naoContatarEm: Date | null;
  telefone: string | null;
  whatsappAutorizadoEm: Date | null;
  whatsappSaiuEm: Date | null;
  telegramId: string | null;
  telegramSaiuEm: Date | null;
  ultimoEnvioNoCanalEm: Date | null;
};

/**
 * Os contatos do segmento com o que a regra de quem recebe precisa (§4.18).
 * Roda como o operador: o disparo sai para quem a pessoa vê no segmento.
 */
export async function contatosDoSegmento(
  db: Db,
  p: { organizacaoId: string; filtros: FiltroDeContatos; canal: TipoDeCanal; disparoId: string },
): Promise<ContatoDoSegmento[]> {
  const { condicoes, parametros } = sqlDoFiltro(p.filtros, 4);
  return db.query<ContatoDoSegmento>(
    `select c.id, c.nome, c.primeiro_nome as "primeiroNome", c.empresa, c.cargo, c.nao_contatar_em as "naoContatarEm",
            c.telefone, c.whatsapp_autorizado_em as "whatsappAutorizadoEm", c.whatsapp_saiu_em as "whatsappSaiuEm",
            ${CAMPOS_DO_TELEGRAM}
            (select max(e.enviado_em) from public.envios_do_disparo e join public.disparos d on d.id = e.disparo_id
              where e.contato_id = c.id and d.canal_tipo = $2 and d.id <> $3::uuid and e.enviado_em is not null) as "ultimoEnvioNoCanalEm"
       from public.contatos c
      where ${["c.organizacao_id = $1::uuid", ...condicoes].join(" and ")}
      order by c.criado_em, c.id`,
    [p.organizacaoId, p.canal, p.disparoId, ...parametros],
  );
}

/** As colunas do Telegram no contato chegam no SDR-73; até lá, o contato não tem Telegram. */
const CAMPOS_DO_TELEGRAM = `null::text as "telegramId", null::timestamptz as "telegramSaiuEm",`;

export type EnvioPlanejado = {
  contatoId: string;
  nome: string;
  destino: string;
  status: "pendente" | "pulado";
  motivo: string | null;
  texto: string | null;
  parametros: Record<string, unknown>[] | null;
};

/** A mensagem de um contato: no WhatsApp, o template preenchido; no Telegram, o texto com as variáveis. */
export function mensagemPara(conteudo: ConteudoDoDisparo, contato: Pick<ContatoDoSegmento, "nome" | "primeiroNome" | "empresa" | "cargo">) {
  if (conteudo.tipo === "whatsapp") return preencherTemplate(conteudo as ConteudoDoWhatsapp, contato);
  const renderizado = renderizarTemplate(conteudo.texto, { first_name: contato.primeiroNome ?? contato.nome.split(" ")[0], company: contato.empresa });
  return renderizado.ok ? { ok: true as const, componentes: null, texto: renderizado.texto } : { ok: false as const, motivo: renderizado.erro };
}

/** Quem recebe e quem fica de fora, com o motivo e a mensagem de cada um (§4.18). */
export function planejarEnvios(disparo: Pick<DisparoGuardado, "canalTipo" | "conteudo">, contatos: ContatoDoSegmento[], agora: Date, intervaloHoras: number): EnvioPlanejado[] {
  return contatos.map((contato) => {
    const destino = disparo.canalTipo === "whatsapp" ? (contato.telefone ?? "") : (contato.telegramId ?? "");
    const pulo = motivoParaPular(disparo.canalTipo, contato, agora, intervaloHoras);
    const base = { contatoId: contato.id, nome: contato.nome, destino };
    if (pulo) return { ...base, status: "pulado", motivo: pulo, texto: null, parametros: null };
    const mensagem = mensagemPara(disparo.conteudo, contato);
    if (!mensagem.ok) return { ...base, status: "pulado", motivo: mensagem.motivo, texto: null, parametros: null };
    return { ...base, status: "pendente", motivo: null, texto: mensagem.texto, parametros: mensagem.componentes };
  });
}

export type Conferencia = {
  recebem: number;
  deFora: { motivo: string; quantos: number }[];
  exemplos: { nome: string; texto: string }[];
  custo: { valor: number; moeda: string; categoria: string } | null;
  /** O limite da Meta para o portfólio, se o disparo passa dele. */
  limite: number | null;
  janela: JanelaDosDisparos;
  /** Quando começaria, se for confirmado agora (fora da janela, na próxima abertura). */
  comecaEm: Date;
};

/**
 * O que a tela mostra antes de confirmar (§4.18): quantos recebem, quantos
 * ficam de fora e por quê, três mensagens como chegam e, no WhatsApp, a
 * estimativa da Meta. Roda como o operador.
 */
export async function conferirDisparo(db: Db, p: { disparo: DisparoGuardado; agora: Date }): Promise<Resultado<Conferencia>> {
  if (!p.disparo.segmentoId) return { ok: false, erro: "O segmento deste disparo foi apagado. Escolha outro." };
  const config = await lerConfiguracao(db, "disparos");
  const contatos = await contatosDoSegmento(db, { organizacaoId: p.disparo.organizacaoId, filtros: p.disparo.filtros, canal: p.disparo.canalTipo, disparoId: p.disparo.id });
  const planejados = planejarEnvios(p.disparo, contatos, p.agora, config.intervalo_horas);
  const recebem = planejados.filter((e) => e.status === "pendente");
  const motivos = new Map<string, number>();
  for (const envio of planejados) if (envio.motivo) motivos.set(envio.motivo, (motivos.get(envio.motivo) ?? 0) + 1);

  let custo: Conferencia["custo"] = null;
  let limite: number | null = null;
  if (p.disparo.conteudo.tipo === "whatsapp") {
    const categoria = p.disparo.conteudo.template.categoria;
    const estimativa = estimativaDoCusto(recebem.length, categoria, await lerConfiguracao(db, "whatsapp"));
    custo = estimativa ? { ...estimativa, categoria } : null;
    const canal = await obterCanal(db, { organizacaoId: p.disparo.organizacaoId, tipo: "whatsapp" });
    const doTier = limiteDoTier((canal?.dados as Partial<DadosDoWhatsapp> | undefined)?.limite);
    limite = doTier !== null && recebem.length > doTier ? doTier : null;
  }
  return {
    ok: true,
    recebem: recebem.length,
    deFora: [...motivos].map(([motivo, quantos]) => ({ motivo, quantos })).sort((a, b) => b.quantos - a.quantos),
    exemplos: recebem.slice(0, 3).map((e) => ({ nome: e.nome, texto: e.texto ?? "" })),
    custo,
    limite,
    janela: config.janela,
    comecaEm: proximaAbertura(p.agora, config.janela),
  };
}

// --- Confirmação e controle ----------------------------------------------------------------

/**
 * Confirma o disparo (§4.18): congela a lista com quem recebe e quem fica de
 * fora (com o motivo) e agenda. "Agora" fora da janela começa na próxima
 * abertura; agendar fora da janela é recusado com o horário em que daria.
 *
 * `envios` vem de `planejarEnvios` com os contatos que o operador vê; aqui
 * roda pela conexão do sistema, numa transação, só se o disparo ainda é
 * rascunho da organização.
 */
export async function confirmarDisparo(
  db: Db,
  p: {
    organizacaoId: string;
    disparoId: string;
    filtros: FiltroDeContatos;
    envios: EnvioPlanejado[];
    quando: Date | null;
    operadorId: string;
    agora: Date;
  },
): Promise<Resultado<{ agendadoPara: Date; recebem: number }>> {
  const config = await lerConfiguracao(db, "disparos");
  if (p.quando && !dentroDaJanela(p.quando, config.janela)) {
    const daria = proximaAbertura(p.quando, config.janela).toLocaleString("pt-BR", { timeZone: config.janela.fuso, dateStyle: "short", timeStyle: "short" });
    return { ok: false, erro: `Disparo só sai das ${config.janela.inicio} às ${config.janela.fim}. O horário mais perto que dá é ${daria}.` };
  }
  if (p.quando && p.quando.getTime() < p.agora.getTime() - 60_000) return { ok: false, erro: "Esse horário já passou." };
  const recebem = p.envios.filter((e) => e.status === "pendente").length;
  if (recebem === 0) return { ok: false, erro: "Ninguém do segmento pode receber agora. Veja quem ficou de fora e por quê." };
  const agendadoPara = p.quando ?? proximaAbertura(p.agora, config.janela);

  return db.transacao(async (tx) => {
    const [disparo] = await tx.query<{ status: string; canal_tipo: TipoDeCanal }>(
      "select status, canal_tipo from public.disparos where id = $1::uuid and organizacao_id = $2::uuid for update",
      [p.disparoId, p.organizacaoId],
    );
    if (!disparo) return { ok: false, erro: "Disparo não encontrado." };
    if (disparo.status !== "rascunho") return { ok: false, erro: "Este disparo já foi confirmado." };
    for (let inicio = 0; inicio < p.envios.length; inicio += ENVIOS_POR_INSERT) {
      const bloco = p.envios.slice(inicio, inicio + ENVIOS_POR_INSERT);
      await tx.query(
        `insert into public.envios_do_disparo (disparo_id, contato_id, destino, nome, texto, parametros, status, motivo, criado_em)
         select $1::uuid, r."contatoId", r.destino, r.nome, r.texto, r.parametros, r.status, r.motivo, $3
           from jsonb_to_recordset($2::jsonb) as r ("contatoId" uuid, destino text, nome text, texto text, parametros jsonb, status text, motivo text)
           join public.contatos c on c.id = r."contatoId" and c.organizacao_id = $4::uuid
         on conflict (disparo_id, contato_id) do nothing`,
        [p.disparoId, JSON.stringify(bloco), p.agora, p.organizacaoId],
      );
    }
    await tx.query(
      `update public.disparos
          set status = 'agendado', agendado_para = $3, confirmado_em = $4, confirmado_por = $5::uuid, filtros = $6::jsonb,
              total = (select count(*) from public.envios_do_disparo where disparo_id = $1::uuid), motivo_pausa = null
        where id = $1::uuid and organizacao_id = $2::uuid`,
      [p.disparoId, p.organizacaoId, agendadoPara, p.agora, p.operadorId, JSON.stringify({ ...p.filtros, situacao: undefined })],
    );
    await registrarEvento(tx, {
      tipo: "disparo_confirmado",
      entidade: "disparo",
      entidadeId: p.disparoId,
      payload: { recebem, de_fora: p.envios.length - recebem, agendado_para: agendadoPara.toISOString(), canal: disparo.canal_tipo },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true, agendadoPara, recebem };
  });
}

/** Pausa (§4.18). Pela conexão do sistema, preso à organização. */
export async function pausarDisparo(db: Db, p: { organizacaoId: string; disparoId: string; motivo: string; ator: string; agora: Date }): Promise<Resultado> {
  const pausados = await db.query(
    `update public.disparos set status = 'pausado', motivo_pausa = $3
      where id = $1::uuid and organizacao_id = $2::uuid and status in ('agendado', 'enviando') returning id`,
    [p.disparoId, p.organizacaoId, p.motivo],
  );
  if (pausados.length === 0) return { ok: false, erro: "Só pausa disparo agendado ou saindo." };
  await registrarEvento(db, { tipo: "disparo_pausado", entidade: "disparo", entidadeId: p.disparoId, payload: { motivo: p.motivo }, ator: p.ator, em: p.agora });
  return { ok: true };
}

/** Retoma o pausado: volta para a fila na hora (ou no horário agendado, se ainda não chegou). */
export async function retomarDisparo(db: Db, p: { organizacaoId: string; disparoId: string; operadorId: string; agora: Date }): Promise<Resultado> {
  const [disparo] = await db.query<{ canal_tipo: TipoDeCanal }>(
    "select canal_tipo from public.disparos where id = $1::uuid and organizacao_id = $2::uuid and status = 'pausado'",
    [p.disparoId, p.organizacaoId],
  );
  if (!disparo) return { ok: false, erro: "Só retoma disparo pausado." };
  const [modulo] = await db.query("select 1 from public.modulos_da_organizacao where organizacao_id = $1::uuid and modulo = $2 and ativo", [
    p.organizacaoId,
    disparo.canal_tipo,
  ]);
  if (!modulo) return { ok: false, erro: "O módulo deste canal não está no plano da organização." };
  const [canal] = await db.query<{ status: string; erro: string | null }>(
    "select status, erro from public.canais where organizacao_id = $1::uuid and tipo = $2",
    [p.organizacaoId, disparo.canal_tipo],
  );
  if (!canal || canal.status === "desconectado") return { ok: false, erro: "O canal está desconectado. Conecte de novo em Configurações." };
  await db.query(
    `update public.disparos set status = 'agendado', motivo_pausa = null, agendado_para = greatest(agendado_para, $3)
      where id = $1::uuid and organizacao_id = $2::uuid`,
    [p.disparoId, p.organizacaoId, p.agora],
  );
  await registrarEvento(db, { tipo: "disparo_retomado", entidade: "disparo", entidadeId: p.disparoId, ator: p.operadorId, em: p.agora });
  return { ok: true };
}

/** Cancela (§4.18): o que ainda não saiu não sai mais. O que já saiu, saiu. */
export async function cancelarDisparo(db: Db, p: { organizacaoId: string; disparoId: string; operadorId: string; agora: Date }): Promise<Resultado<{ cancelados: number }>> {
  return db.transacao(async (tx) => {
    const cancelados = await tx.query(
      `update public.disparos set status = 'cancelado', concluido_em = $3
        where id = $1::uuid and organizacao_id = $2::uuid and status in ('rascunho', 'agendado', 'enviando', 'pausado') returning id`,
      [p.disparoId, p.organizacaoId, p.agora],
    );
    if (cancelados.length === 0) return { ok: false, erro: "Este disparo já terminou." };
    const envios = await tx.query("update public.envios_do_disparo set status = 'cancelado' where disparo_id = $1::uuid and status = 'pendente' returning id", [
      p.disparoId,
    ]);
    await registrarEvento(tx, { tipo: "disparo_cancelado", entidade: "disparo", entidadeId: p.disparoId, payload: { nao_sairam: envios.length }, ator: p.operadorId, em: p.agora });
    return { ok: true, cancelados: envios.length };
  });
}

/** Falha que pode dar certo agora: ritmo, conta, template, "esperar" e o envio interrompido. A do contato não volta. */
export function falhaQueVolta(codigo: string | null): boolean {
  if (codigo === "interrompido") return true;
  if (!codigo) return false;
  return ["ritmo", "esperar", "template", "conta"].includes(classificarErroDaMeta(codigo).classe);
}

/**
 * "Tentar de novo as falhas" (§4.18): volta para a fila só o que pode dar certo
 * agora, com nova conferência na hora do envio. O disparo terminado volta a
 * ser agendado.
 */
export async function tentarDeNovoAsFalhas(db: Db, p: { organizacaoId: string; disparoId: string; operadorId: string; agora: Date }): Promise<Resultado<{ voltaram: number }>> {
  return db.transacao(async (tx) => {
    const [disparo] = await tx.query<{ status: string }>(
      "select status from public.disparos where id = $1::uuid and organizacao_id = $2::uuid for update",
      [p.disparoId, p.organizacaoId],
    );
    if (!disparo || disparo.status === "rascunho" || disparo.status === "cancelado") return { ok: false, erro: "Só dá para tentar de novo num disparo confirmado." };
    const falhas = await tx.query<{ id: string; codigo_erro: string | null }>(
      "select id, codigo_erro from public.envios_do_disparo where disparo_id = $1::uuid and status = 'falhou'",
      [p.disparoId],
    );
    const ids = falhas.filter((f) => falhaQueVolta(f.codigo_erro)).map((f) => f.id);
    if (ids.length === 0) return { ok: false, erro: "Nenhuma falha que possa dar certo agora." };
    await tx.query(
      `update public.envios_do_disparo
          set status = 'pendente', motivo = null, codigo_erro = null, tentativas = 0, tentar_apos = null, reservado_ate = null, falhou_em = null
        where id = any($1::uuid[])`,
      [ids],
    );
    if (disparo.status === "concluido") {
      await tx.query("update public.disparos set status = 'agendado', concluido_em = null, agendado_para = $2 where id = $1::uuid", [p.disparoId, p.agora]);
    }
    await registrarEvento(tx, { tipo: "disparo_falhas_de_volta", entidade: "disparo", entidadeId: p.disparoId, payload: { envios: ids.length }, ator: p.operadorId, em: p.agora });
    return { ok: true, voltaram: ids.length };
  });
}

// --- Resultado ---------------------------------------------------------------------------

export type Contagem = Record<StatusDoEnvio, number> & { responderam: number };

const CONTAGEM_VAZIA: Contagem = { pendente: 0, enviando: 0, enviado: 0, entregue: 0, lido: 0, falhou: 0, pulado: 0, cancelado: 0, responderam: 0 };

export type DisparoNaLista = Pick<DisparoGuardado, "id" | "nome" | "canalTipo" | "status" | "motivoPausa" | "agendadoPara" | "total" | "criadoEm"> & {
  contagem: Contagem;
};

/** Os disparos da organização, os mais novos primeiro, com quantos estão em cada situação. Roda como o operador. */
export async function listarDisparos(db: Db, organizacaoId: string, limite = 100): Promise<DisparoNaLista[]> {
  const linhas = await db.query<Omit<DisparoNaLista, "contagem"> & { contagem: Partial<Contagem> | null }>(
    `select d.id, d.nome, d.canal_tipo as "canalTipo", d.status, d.motivo_pausa as "motivoPausa", d.agendado_para as "agendadoPara",
            d.total, d.criado_em as "criadoEm",
            (select jsonb_object_agg(status, n) || jsonb_build_object('responderam', (select count(*) from public.envios_do_disparo r where r.disparo_id = d.id and r.respondido_em is not null))
               from (select status, count(*)::int as n from public.envios_do_disparo e where e.disparo_id = d.id group by status) s) as contagem
       from public.disparos d where d.organizacao_id = $1::uuid
      order by d.criado_em desc limit $2`,
    [organizacaoId, limite],
  );
  return linhas.map((linha) => ({ ...linha, contagem: { ...CONTAGEM_VAZIA, ...(linha.contagem ?? {}) } }));
}

export type ResultadoDoDisparo = {
  contagem: Contagem;
  falhas: { nome: string; destino: string; motivo: string | null; em: Date | null; volta: boolean }[];
  pulados: { motivo: string; quantos: number }[];
  respostas: { contatoId: string | null; nome: string; texto: string; em: Date }[];
};

/** O resultado (§4.18): as contagens, as falhas com o motivo, quem ficou de fora e as respostas. Roda como o operador. */
export async function resultadoDoDisparo(db: Db, disparoId: string): Promise<ResultadoDoDisparo> {
  const porStatus = await db.query<{ status: StatusDoEnvio; n: number }>(
    "select status, count(*)::int as n from public.envios_do_disparo where disparo_id = $1::uuid group by status",
    [disparoId],
  );
  const [responderam] = await db.query<{ n: number }>(
    "select count(*)::int as n from public.envios_do_disparo where disparo_id = $1::uuid and respondido_em is not null",
    [disparoId],
  );
  const contagem: Contagem = { ...CONTAGEM_VAZIA, responderam: responderam!.n };
  for (const linha of porStatus) contagem[linha.status] = linha.n;
  const falhas = await db.query<{ nome: string; destino: string; motivo: string | null; em: Date | null; codigo: string | null }>(
    `select nome, destino, motivo, falhou_em as em, codigo_erro as codigo from public.envios_do_disparo
      where disparo_id = $1::uuid and status = 'falhou' order by falhou_em desc nulls last limit 200`,
    [disparoId],
  );
  const pulados = await db.query<{ motivo: string; quantos: number }>(
    `select coalesce(motivo, 'Sem motivo') as motivo, count(*)::int as quantos from public.envios_do_disparo
      where disparo_id = $1::uuid and status = 'pulado' group by 1 order by 2 desc`,
    [disparoId],
  );
  const respostas = await db.query<{ contatoId: string | null; nome: string; texto: string; em: Date }>(
    `select m.contato_id as "contatoId", e.nome, m.texto, m.em
       from public.mensagens_dos_canais m join public.envios_do_disparo e on e.id = m.envio_id
      where e.disparo_id = $1::uuid and m.direcao = 'entrada' order by m.em desc limit 200`,
    [disparoId],
  );
  return { contagem, falhas: falhas.map(({ codigo, ...f }) => ({ ...f, volta: falhaQueVolta(codigo) })), pulados, respostas };
}

export type DisparoDoContato = { disparoId: string; nome: string; canal: TipoDeCanal; status: StatusDoEnvio; motivo: string | null; em: Date | null; resposta: string | null };

/** Os disparos que o contato recebeu (ou de que ficou de fora) e a resposta a cada um, os mais novos primeiro (§4.15). Roda como o operador. */
export async function disparosDoContato(db: Db, contatoId: string, limite = 20): Promise<DisparoDoContato[]> {
  return db.query<DisparoDoContato>(
    `select d.id as "disparoId", d.nome, d.canal_tipo as canal, e.status, e.motivo, coalesce(e.enviado_em, e.falhou_em, d.agendado_para) as em,
            (select m.texto from public.mensagens_dos_canais m where m.envio_id = e.id and m.direcao = 'entrada' order by m.em limit 1) as resposta
       from public.envios_do_disparo e join public.disparos d on d.id = e.disparo_id
      where e.contato_id = $1::uuid
      order by coalesce(e.enviado_em, d.agendado_para, e.criado_em) desc
      limit $2`,
    [contatoId, limite],
  );
}
