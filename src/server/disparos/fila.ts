import { normalizarTelefone } from "@/domain/contatos";
import {
  classificarErroDaMeta,
  classificarErroDoTelegram,
  dentroDaJanela,
  limiteDoTier,
  motivoParaPular,
  type ClasseDoErro,
  type ConteudoDoDisparo,
  type TipoDeCanal,
} from "@/domain/disparos";
import { canalParaEnvio, marcarCanalComErro, type CanalParaEnvio, type DadosDoWhatsapp } from "@/server/canais/canais";
import { lerConfiguracao, type Configuracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Cofre } from "@/server/segredos";
import { pegarTrava } from "@/server/travas";
import { ErroDoTelegram, type ClienteTelegram } from "@/server/telegram/cliente";
import { ErroDaMeta, type ClienteWhatsapp } from "@/server/whatsapp/cliente";

export type EnvioReservado = {
  id: string;
  disparoId: string;
  contatoId: string;
  destino: string;
  texto: string | null;
  parametros: Record<string, unknown>[] | null;
  tentativas: number;
};

export type ErroTratado = {
  classe: ClasseDoErro;
  motivo: string;
  codigo: string;
  /** Pede uma espera antes de tentar de novo (o `retry_after` do Telegram). */
  esperarMs?: number;
};

/**
 * Quem manda por um canal. O WhatsApp agora; o Telegram entra no SDR-73 com o
 * mesmo contrato: devolve o id da mensagem ou lança, e `tratar` diz o que a
 * fila faz com o erro.
 */
export type EnviadorDoCanal = {
  enviar(p: { canal: CanalParaEnvio; envio: EnvioReservado; conteudo: ConteudoDoDisparo }): Promise<{ providerMessageId: string; waId?: string | null }>;
  tratar(erro: unknown): ErroTratado;
};

/** O envio caiu sem a resposta do canal: pode ter chegado, e nunca é repetido sozinho (§4.18). */
export const INTERROMPIDO: ErroTratado = {
  classe: "contato",
  motivo: "Pode ter chegado: o envio caiu antes da resposta do canal. Confira antes de tentar de novo.",
  codigo: "interrompido",
};

/** O enviador do WhatsApp sobre a Cloud API (§4.19): o template preenchido, com o id do envio de volta nos status. */
export function enviadorDoWhatsapp(whatsapp: ClienteWhatsapp): EnviadorDoCanal {
  return {
    async enviar({ canal, envio, conteudo }) {
      if (conteudo.tipo !== "whatsapp") throw new Error("Disparo do WhatsApp sem template.");
      const resposta = await whatsapp.enviarTemplate({
        phoneNumberId: (canal.dados as DadosDoWhatsapp).phoneNumberId,
        token: canal.token,
        para: envio.destino,
        template: { nome: conteudo.template.nome, idioma: conteudo.template.idioma, componentes: envio.parametros ?? [] },
        dadosDeVolta: envio.id,
      });
      return { providerMessageId: resposta.wamid, waId: resposta.waId };
    },
    tratar(erro) {
      if (!(erro instanceof ErroDaMeta) || erro.semResposta) return INTERROMPIDO;
      return { ...classificarErroDaMeta(erro.codigo), codigo: erro.codigo };
    },
  };
}

/** O enviador do Telegram sobre a Bot API (§4.20): texto sem formatação e o botão com link, se houver. */
export function enviadorDoTelegram(telegram: ClienteTelegram): EnviadorDoCanal {
  return {
    async enviar({ canal, envio, conteudo }) {
      if (conteudo.tipo !== "telegram" || !envio.texto) throw new Error("Disparo do Telegram sem texto.");
      const { messageId } = await telegram.enviarMensagem({ token: canal.token, chatId: envio.destino, texto: envio.texto, botao: conteudo.botao });
      return { providerMessageId: `${envio.destino}:${messageId}` };
    },
    tratar(erro) {
      if (!(erro instanceof ErroDoTelegram) || erro.semResposta) return INTERROMPIDO;
      const tratado = classificarErroDoTelegram(erro.codigo, erro.descricao);
      return { ...tratado, codigo: `telegram_${erro.codigo}`, esperarMs: erro.esperarSegundos ? erro.esperarSegundos * 1000 : undefined };
    },
  };
}

export type DependenciasDaFila = {
  db: Db;
  cofre: Cofre;
  agora: () => Date;
  enviadores: Partial<Record<TipoDeCanal, EnviadorDoCanal>>;
  /** Pausa entre envios (o ritmo). Os testes não esperam. */
  esperar?: (ms: number) => Promise<void>;
  /** Até quanto tempo esta rodada trabalha (a próxima continua de onde parou). */
  limiteMs?: number;
};

export type RelatorioDaFila =
  | { executado: false; motivo: string }
  | { executado: true; interrompidos: number; iniciados: number; enviados: number; falharam: number; pulados: number; pausados: string[]; concluidos: number };

const esperarDeVerdade = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type DisparoSaindo = { id: string; organizacao_id: string; canal_id: string; canal_tipo: TipoDeCanal; conteudo: ConteudoDoDisparo };

/**
 * Uma rodada da fila dos disparos (§4.18). Roda a cada minuto pelo cron e logo
 * depois da confirmação; uma rodada por vez (trava). Em ordem:
 *
 * 1. envio reservado cujo prazo venceu vira falha "pode ter chegado" e nunca
 *    volta sozinho para a fila (nunca duas vezes);
 * 2. disparo agendado que chegou na hora começa;
 * 3. os disparos saindo mandam um lote de cada vez, em rodízio, no ritmo do
 *    canal e dentro da janela, conferindo cada contato de novo antes de mandar;
 *    módulo fora do plano, canal desconectado ou com erro, e problema da conta
 *    ou do template pausam o disparo;
 * 4. disparo sem nada na fila termina.
 */
export async function processarDisparos(deps: DependenciasDaFila): Promise<RelatorioDaFila> {
  const inicio = deps.agora();
  const soltar = await pegarTrava(deps.db, "disparos", inicio, 5 * 60_000);
  if (!soltar) return { executado: false, motivo: "outra rodada em andamento" };
  const esperar = deps.esperar ?? esperarDeVerdade;
  const limiteMs = deps.limiteMs ?? 45_000;
  const passouDoTempo = () => deps.agora().getTime() - inicio.getTime() > limiteMs;
  const relatorio = { executado: true as const, interrompidos: 0, iniciados: 0, enviados: 0, falharam: 0, pulados: 0, pausados: [] as string[], concluidos: 0 };

  try {
    const config = await lerConfiguracao(deps.db, "disparos");
    relatorio.interrompidos = await reconciliarInterrompidos(deps.db, inicio);
    relatorio.iniciados = await comecarOsAgendados(deps.db, inicio);

    let ativos = await deps.db.query<DisparoSaindo>(
      "select id, organizacao_id, canal_id, canal_tipo, conteudo from public.disparos where status = 'enviando' order by agendado_para, id",
    );
    const canais = new Map<string, CanalParaEnvio | null>();
    while (ativos.length > 0 && !passouDoTempo()) {
      const seguem: DisparoSaindo[] = [];
      for (const disparo of ativos) {
        if (passouDoTempo()) break;
        const pausar = async (motivo: string) => {
          await deps.db.query("update public.disparos set status = 'pausado', motivo_pausa = $2 where id = $1::uuid and status = 'enviando'", [disparo.id, motivo]);
          await registrarEvento(deps.db, { tipo: "disparo_pausado", entidade: "disparo", entidadeId: disparo.id, payload: { motivo }, em: deps.agora() });
          relatorio.pausados.push(disparo.id);
        };

        const impedimento = await impedimentoDoDisparo(deps, disparo, canais);
        if (impedimento === "esperar") continue;
        if (impedimento) {
          await pausar(impedimento);
          continue;
        }
        const canal = canais.get(disparo.canal_id)!;
        const enviador = deps.enviadores[disparo.canal_tipo]!;
        if (!dentroDaJanela(deps.agora(), config.janela)) continue; // continua quando a janela abrir

        if (disparo.canal_tipo === "whatsapp") {
          const limite = limiteDoTier((canal.dados as Partial<DadosDoWhatsapp>).limite);
          if (limite !== null && (await alcancadosEm24h(deps.db, canal.id, deps.agora())) >= limite) {
            await pausar(`Chegou ao limite da Meta de ${limite.toLocaleString("pt-BR")} pessoas em 24 h. Retome amanhã, ou peça mais limite à Meta.`);
            continue;
          }
        }

        const lote = await reservarLote(deps.db, { disparoId: disparo.id, agora: deps.agora(), config });
        const resultado = await mandarLote(deps, { disparo, canal, enviador, lote, config, esperar, passouDoTempo });
        relatorio.enviados += resultado.enviados;
        relatorio.falharam += resultado.falharam;
        relatorio.pulados += resultado.pulados;
        if (resultado.pausar) {
          if (resultado.pausar.conta) await marcarCanalComErro(deps.db, { canalId: canal.id, motivo: resultado.pausar.motivo, agora: deps.agora() });
          await pausar(resultado.pausar.motivo);
          continue;
        }
        if (await semNadaNaFila(deps.db, disparo.id)) {
          if (await concluir(deps.db, disparo.id, deps.agora())) relatorio.concluidos += 1;
          continue;
        }
        if (lote.length > 0) seguem.push(disparo);
      }
      ativos = seguem;
    }
    return relatorio;
  } finally {
    await soltar();
  }
}

/**
 * O que impede o disparo de mandar agora: um motivo para pausar, "esperar"
 * (canal sem enviador neste ambiente) ou null. Guarda o canal aberto para a
 * rodada.
 */
async function impedimentoDoDisparo(deps: DependenciasDaFila, disparo: DisparoSaindo, canais: Map<string, CanalParaEnvio | null>): Promise<string | "esperar" | null> {
  const [modulo] = await deps.db.query("select 1 from public.modulos_da_organizacao where organizacao_id = $1::uuid and modulo = $2 and ativo", [
    disparo.organizacao_id,
    disparo.canal_tipo,
  ]);
  if (!modulo) return "O módulo deste canal saiu do plano da organização.";
  if (!canais.has(disparo.canal_id)) canais.set(disparo.canal_id, await canalParaEnvio(deps.db, deps.cofre, { canalId: disparo.canal_id }));
  const canal = canais.get(disparo.canal_id);
  if (!canal) return "O canal está desconectado. Conecte de novo em Configurações e retome.";
  if (canal.status === "erro") return "O canal está com erro. Veja em Configurações e retome.";
  if (!deps.enviadores[disparo.canal_tipo]) return "esperar";
  return null;
}

type ResultadoDoLote = { enviados: number; falharam: number; pulados: number; pausar: { motivo: string; conta: boolean } | null };

async function mandarLote(
  deps: DependenciasDaFila,
  p: {
    disparo: DisparoSaindo;
    canal: CanalParaEnvio;
    enviador: EnviadorDoCanal;
    lote: EnvioReservado[];
    config: Configuracao<"disparos">;
    esperar: (ms: number) => Promise<void>;
    passouDoTempo: () => boolean;
  },
): Promise<ResultadoDoLote> {
  const resultado: ResultadoDoLote = { enviados: 0, falharam: 0, pulados: 0, pausar: null };
  const ritmo = Math.ceil(1000 / p.config.por_segundo[p.disparo.canal_tipo]);
  for (const [indice, envio] of p.lote.entries()) {
    if (indice > 0 && p.passouDoTempo()) break;
    const agora = deps.agora();
    const pulo = await conferirNaHora(deps.db, { envio, canal: p.disparo.canal_tipo, agora, intervaloHoras: p.config.intervalo_horas });
    if (pulo) {
      await deps.db.query("update public.envios_do_disparo set status = 'pulado', motivo = $2, reservado_ate = null where id = $1::uuid", [envio.id, pulo]);
      resultado.pulados += 1;
      continue;
    }
    try {
      const enviado = await p.enviador.enviar({ canal: p.canal, envio, conteudo: p.disparo.conteudo });
      await deps.db.query(
        `update public.envios_do_disparo
            set status = 'enviado', provider_message_id = $2, enviado_em = $3, reservado_ate = null, motivo = null, codigo_erro = null
          where id = $1::uuid and status = 'enviando'`,
        [envio.id, enviado.providerMessageId, deps.agora()],
      );
      if (enviado.waId) await guardarWaId(deps.db, { contatoId: envio.contatoId, waId: enviado.waId });
      resultado.enviados += 1;
    } catch (erro) {
      const tratado = p.enviador.tratar(erro);
      if (tratado.classe === "template" || tratado.classe === "conta") {
        // O problema não é do contato: ele volta para a fila e o disparo pausa.
        await devolverReservados(deps.db, p.disparo.id);
        resultado.pausar = { motivo: tratado.motivo, conta: tratado.classe === "conta" };
        return resultado;
      }
      if (tratado.classe === "ritmo" && envio.tentativas < p.config.tentativas) {
        const espera = tratado.esperarMs ?? 30_000 * 2 ** (envio.tentativas - 1);
        await deps.db.query(
          "update public.envios_do_disparo set status = 'pendente', reservado_ate = null, tentar_apos = $2, motivo = $3, codigo_erro = $4 where id = $1::uuid",
          [envio.id, new Date(agora.getTime() + espera), tratado.motivo, tratado.codigo],
        );
      } else {
        await deps.db.query(
          "update public.envios_do_disparo set status = 'falhou', motivo = $2, codigo_erro = $3, falhou_em = $4, reservado_ate = null where id = $1::uuid",
          [envio.id, tratado.motivo, tratado.codigo, agora],
        );
        resultado.falharam += 1;
        if (tratado.classe === "saiu") await sairDoCanal(deps.db, { contatoId: envio.contatoId, canal: p.disparo.canal_tipo, motivo: tratado.motivo, agora });
      }
    }
    await p.esperar(ritmo);
  }
  // O que sobrou reservado (a rodada acabou o tempo) volta para a fila, sem contar tentativa.
  await devolverReservados(deps.db, p.disparo.id);
  return resultado;
}

/** Envio com a reserva vencida: caiu no meio. Vira falha "pode ter chegado" e não volta sozinho. */
async function reconciliarInterrompidos(db: Db, agora: Date): Promise<number> {
  const interrompidos = await db.query(
    `update public.envios_do_disparo
        set status = 'falhou', motivo = $2, codigo_erro = $3, falhou_em = $1, reservado_ate = null
      where status = 'enviando' and reservado_ate < $1
      returning id`,
    [agora, INTERROMPIDO.motivo, INTERROMPIDO.codigo],
  );
  return interrompidos.length;
}

async function comecarOsAgendados(db: Db, agora: Date): Promise<number> {
  const comecaram = await db.query<{ id: string }>(
    `update public.disparos set status = 'enviando', iniciado_em = coalesce(iniciado_em, $1)
      where status = 'agendado' and agendado_para <= $1 returning id`,
    [agora],
  );
  for (const { id } of comecaram) await registrarEvento(db, { tipo: "disparo_iniciado", entidade: "disparo", entidadeId: id, em: agora });
  return comecaram.length;
}

/** Reserva o próximo lote do disparo, com prazo. `skip locked`: duas rodadas nunca pegam o mesmo envio. */
async function reservarLote(db: Db, p: { disparoId: string; agora: Date; config: Configuracao<"disparos"> }): Promise<EnvioReservado[]> {
  return db.query<EnvioReservado>(
    `update public.envios_do_disparo e
        set status = 'enviando', reservado_ate = $3, tentativas = e.tentativas + 1
      where e.id in (
        select id from public.envios_do_disparo
         where disparo_id = $1::uuid and status = 'pendente' and (tentar_apos is null or tentar_apos <= $2)
         order by criado_em, id
         limit $4
         for update skip locked)
      returning e.id, e.disparo_id as "disparoId", e.contato_id as "contatoId", e.destino, e.texto, e.parametros, e.tentativas`,
    [p.disparoId, p.agora, new Date(p.agora.getTime() + p.config.reserva_segundos * 1000), p.config.lote],
  );
}

/** Devolve à fila o que ficou reservado sem ser tentado. Não conta como tentativa. */
async function devolverReservados(db: Db, disparoId: string): Promise<void> {
  await db.query(
    `update public.envios_do_disparo set status = 'pendente', reservado_ate = null, tentativas = greatest(tentativas - 1, 0)
      where disparo_id = $1::uuid and status = 'enviando'`,
    [disparoId],
  );
}

/** Na hora de cada envio, o contato é conferido de novo (§4.18): quem saiu depois da confirmação não recebe. */
async function conferirNaHora(db: Db, p: { envio: EnvioReservado; canal: TipoDeCanal; agora: Date; intervaloHoras: number }): Promise<string | null> {
  const [contato] = await db.query<{
    naoContatarEm: Date | null;
    telefone: string | null;
    whatsappAutorizadoEm: Date | null;
    whatsappSaiuEm: Date | null;
    telegramId: string | null;
    telegramSaiuEm: Date | null;
    ultimoEnvioNoCanalEm: Date | null;
  }>(
    `select c.nao_contatar_em as "naoContatarEm", c.telefone, c.whatsapp_autorizado_em as "whatsappAutorizadoEm", c.whatsapp_saiu_em as "whatsappSaiuEm",
            c.telegram_id as "telegramId", c.telegram_saiu_em as "telegramSaiuEm",
            (select max(e.enviado_em) from public.envios_do_disparo e join public.disparos d on d.id = e.disparo_id
              where e.contato_id = c.id and d.canal_tipo = $2 and e.disparo_id <> $3::uuid and e.enviado_em is not null) as "ultimoEnvioNoCanalEm"
       from public.contatos c where c.id = $1::uuid`,
    [p.envio.contatoId, p.canal, p.envio.disparoId],
  );
  if (!contato) return "O contato foi apagado.";
  return motivoParaPular(p.canal, contato, p.agora, p.intervaloHoras);
}

/** O contato sai do canal (§4.15): não recebe mais disparo por ele. */
export async function sairDoCanal(db: Db, p: { contatoId: string; canal: TipoDeCanal; motivo: string; agora: Date }): Promise<boolean> {
  const coluna = p.canal === "whatsapp" ? "whatsapp" : "telegram";
  const sairam = await db.query(
    `update public.contatos set ${coluna}_saiu_em = $2, ${coluna}_motivo = $3 where id = $1::uuid and ${coluna}_saiu_em is null returning id`,
    [p.contatoId, p.agora, p.motivo],
  );
  if (sairam.length > 0) {
    await registrarEvento(db, { tipo: "contato_saiu_do_canal", entidade: "contato", entidadeId: p.contatoId, payload: { canal: p.canal, motivo: p.motivo }, em: p.agora });
  }
  return sairam.length > 0;
}

/** Guarda o wa_id que a Meta devolveu: é por ele que as respostas casam com o contato (o 9º dígito do Brasil). */
async function guardarWaId(db: Db, p: { contatoId: string; waId: string }): Promise<void> {
  await db.query("update public.contatos set whatsapp_wa_id = $2 where id = $1::uuid and whatsapp_wa_id is distinct from $2", [p.contatoId, p.waId]);
}

/** Destinatários únicos alcançados pelo número nas últimas 24 h (o limite da Meta conta assim). */
async function alcancadosEm24h(db: Db, canalId: string, agora: Date): Promise<number> {
  const [linha] = await db.query<{ n: number }>(
    `select count(distinct e.contato_id)::int as n from public.envios_do_disparo e join public.disparos d on d.id = e.disparo_id
      where d.canal_id = $1::uuid and e.enviado_em > $2`,
    [canalId, new Date(agora.getTime() - 24 * 3_600_000)],
  );
  return linha!.n;
}

async function semNadaNaFila(db: Db, disparoId: string): Promise<boolean> {
  const [linha] = await db.query("select 1 from public.envios_do_disparo where disparo_id = $1::uuid and status in ('pendente', 'enviando') limit 1", [disparoId]);
  return !linha;
}

async function concluir(db: Db, disparoId: string, agora: Date): Promise<boolean> {
  const terminou = await db.query("update public.disparos set status = 'concluido', concluido_em = $2 where id = $1::uuid and status = 'enviando' returning id", [
    disparoId,
    agora,
  ]);
  if (terminou.length > 0) await registrarEvento(db, { tipo: "disparo_concluido", entidade: "disparo", entidadeId: disparoId, em: agora });
  return terminou.length > 0;
}

/** O telefone de um wa_id, no formato do contato (+55… com o 9 do celular). */
export function telefoneDoWaId(waId: string | null | undefined): string | null {
  if (!waId) return null;
  const lido = normalizarTelefone(`+${waId.replace(/\D/g, "")}`);
  return lido.ok ? lido.telefone : null;
}
