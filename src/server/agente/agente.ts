import { resumoDaOferta } from "@/domain/dossie";
import type { EstadoDoLead } from "@/domain/estados";
import type { Praca, ResultadoDaValidacao } from "@/domain/validador";
import { urlPublicaDoApp } from "@/lib/env";
import { agendarAcao } from "@/server/acoes/agendar";
import { enfileirarAlerta } from "@/server/alertas/alertas";
import { lerConfiguracao } from "@/server/configuracoes";
import { registrarOptout } from "@/server/conversas/optout";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { transicionarLead } from "@/server/leads/transicoes";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { obterSdr } from "@/server/sdr/sdr";
import { decidirResposta, type Consumo, type EntradaDoAgente } from "./decidir";
import type { Classificacao, Decisao, ModeloDeLinguagem, Uso } from "./modelo";
import { VERSAO_DOS_PROMPTS, type MensagemDoHistorico } from "./prompts";

export type DependenciasDoAgente = { db: Db; modelo: ModeloDeLinguagem; agora: Date; aleatorio?: () => number };

export type ResultadoDoAgente =
  | "ja_processado"
  | "na_fila"
  | "agendado"
  | "optout_registrado"
  | "escalado"
  | "sem_resposta_necessaria"
  | "descartado"
  | "erro";

type Contexto = EntradaDoAgente & {
  leadId: string;
  estado: EstadoDoLead;
  providerId: string;
  modo: "aprovacao" | "automatico";
  perfil: EntradaDoAgente["perfil"] & { id: string };
};

async function carregarContexto(db: Db, mensagemId: string): Promise<Contexto | null> {
  const [linha] = await db.query<{
    lead_id: string;
    estado: EstadoDoLead;
    provider_id: string;
    modo: Contexto["modo"];
    perfil_id: string;
    organizacao_id: string;
    instrucoes_sdr: string | null;
    perfil_nome: string;
    praca: Praca;
    idioma: string;
    voz_md: string | null;
    regras_md: string | null;
    palavras_proibidas: string[];
    limite_nota_convite: number;
    link_agenda: string | null;
    nome: string;
    cargo: string | null;
    empresa: string | null;
    localizacao: string | null;
    campanha: string;
    angulo: string | null;
    nicho: string | null;
    pesquisa: unknown;
  }>(
    `select l.id as lead_id, l.estado, pe.provider_id, pf.modo_resposta as modo, pf.id as perfil_id, pf.nome as perfil_nome,
            pf.organizacao_id, c.instrucoes_sdr,
            pf.praca, pf.idioma, pf.voz_md, pf.regras_md, pf.palavras_proibidas,
            pf.limite_nota_convite, pf.link_agenda,
            pe.nome, pe.cargo, pe.empresa, pe.localizacao, c.nome as campanha, l.angulo, c.nicho, l.pesquisa
       from public.mensagens m
       join public.leads l on l.id = m.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.campanhas c on c.id = l.campanha_id
       join public.perfis pf on pf.id = l.perfil_id
      where m.id = $1::uuid`,
    [mensagemId],
  );
  if (!linha) return null;

  // Link de agenda: o do SDR; sem ele, o do responsável pela discovery da
  // própria organização (decisão D1 do épico anterior: Juliano), senão o do perfil.
  const slugResponsavel = await lerConfiguracao(db, "responsavel_discovery");
  const [responsavel] = await db.query<{ nome: string; link_agenda: string | null }>(
    "select nome, link_agenda from public.perfis where slug = $1 and organizacao_id = $2::uuid",
    [slugResponsavel, linha.organizacao_id],
  );
  // Com SDR, a oferta é a análise confirmada da organização (§7). Sem SDR, nada
  // muda no agente: vale o texto de oferta da configuração.
  const sdr = await obterSdr(db, linha.organizacao_id);
  const analise = sdr ? await dossieConfirmado(db, linha.organizacao_id) : null;
  const mensagens = await db.query<MensagemDoHistorico>(
    "select direcao, autor, texto, em from public.mensagens where lead_id = $1::uuid order by em",
    [linha.lead_id],
  );

  return {
    leadId: linha.lead_id,
    estado: linha.estado,
    providerId: linha.provider_id,
    modo: linha.modo,
    perfil: {
      id: linha.perfil_id,
      nome: linha.perfil_nome,
      praca: linha.praca,
      idioma: linha.idioma,
      voz: linha.voz_md,
      regras: linha.regras_md,
      palavrasProibidas: linha.palavras_proibidas,
      limiteNotaConvite: linha.limite_nota_convite,
    },
    linkDeAgenda: sdr?.sdr.link_agenda ?? responsavel?.link_agenda ?? linha.link_agenda,
    responsavelDiscovery: responsavel?.nome ?? linha.perfil_nome,
    oferta: analise ? resumoDaOferta(analise) : await lerConfiguracao(db, "oferta_vigente"),
    sdr: sdr ? { versao: sdr.versao, sdr: sdr.sdr } : null,
    instrucoesDaCampanha: linha.instrucoes_sdr,
    lead: {
      nome: linha.nome,
      cargo: linha.cargo,
      empresa: linha.empresa,
      localizacao: linha.localizacao,
      campanha: linha.campanha,
      angulo: linha.angulo,
      nicho: linha.nicho,
      pesquisa: linha.pesquisa,
    },
    mensagens,
  };
}

/** Reserva a mensagem para o agente. Retenta erro (até 3 vezes) e execução que morreu no meio. */
async function reservar(db: Db, mensagemId: string, agora: Date): Promise<string | null> {
  const [reserva] = await db.query<{ id: string }>(
    `insert into public.rascunhos (lead_id, perfil_id, mensagem_id, modo, tentativas)
     select m.lead_id, m.perfil_id, m.id, pf.modo_resposta, 1
       from public.mensagens m join public.perfis pf on pf.id = m.perfil_id
      where m.id = $1::uuid and m.direcao = 'entrada' and m.lead_id is not null
     on conflict (mensagem_id) do update
        set tentativas = public.rascunhos.tentativas + 1, resultado = 'processando', erro = null
      where (public.rascunhos.resultado = 'erro' and public.rascunhos.tentativas < 3)
         or (public.rascunhos.resultado = 'processando' and public.rascunhos.atualizado_em < $2::timestamptz - interval '10 minutes')
     returning id`,
    [mensagemId, agora],
  );
  return reserva?.id ?? null;
}

type Registro = {
  resultado: Exclude<ResultadoDoAgente, "ja_processado">;
  classificacao?: Classificacao;
  decisao?: Decisao;
  texto?: string | null;
  validacao?: ResultadoDaValidacao | null;
  excecao?: string | null;
  acaoId?: string | null;
  modelos?: Record<string, string>;
  uso?: Record<string, Uso>;
  sdrVersao?: number | null;
};

async function concluir(db: Db, rascunhoId: string, r: Registro): Promise<void> {
  await db.query(
    `update public.rascunhos set
       resultado = $2, categoria = $3, confianca_categoria = $4, sinais = $5::jsonb,
       acao_sugerida = $6, texto = $7, motivo = $8, estagio_sugerido = $9, confianca = $10,
       validacao = $11::jsonb, excecao = $12, acao_id = $13::uuid, modelos = $14::jsonb, uso = $15::jsonb,
       sdr_versao = $16
     where id = $1::uuid`,
    [
      rascunhoId,
      r.resultado,
      r.classificacao?.categoria ?? null,
      r.classificacao?.confianca ?? null,
      r.classificacao ? JSON.stringify(r.classificacao.sinais) : null,
      r.decisao?.acao ?? null,
      r.texto ?? r.decisao?.mensagem ?? null,
      r.decisao?.motivo ?? null,
      r.decisao?.estagio_sugerido ?? null,
      r.decisao?.confianca ?? null,
      r.validacao ? JSON.stringify(r.validacao) : null,
      r.excecao ?? null,
      r.acaoId ?? null,
      JSON.stringify({ ...r.modelos, prompts: VERSAO_DOS_PROMPTS }),
      r.uso ? JSON.stringify(r.uso) : null,
      r.sdrVersao ?? null,
    ],
  );
}

async function escalar(db: Db, ctx: Contexto, p: { rascunhoId: string; motivo: string; agora: Date }): Promise<void> {
  // Se você assumiu enquanto o modelo pensava, a conversa já é sua: sem e-mail.
  if (!(await transicionarLead(db, { leadId: ctx.leadId, para: "escalado_humano", ator: "agente", agora: p.agora, motivo: p.motivo }))) return;
  await enfileirarAlerta(db, {
    chave: `escalado/${p.rascunhoId}`,
    tipo: "revisao",
    perfilId: ctx.perfil.id,
    incluirAdmin: false,
    assunto: `[Kakou] O SDR chamou você na conversa com ${ctx.lead.nome} (${ctx.perfil.nome})`,
    texto: [
      `O SDR parou de responder ${ctx.lead.nome} e passou a conversa para você.`,
      ``,
      `Motivo: ${p.motivo}`,
      ``,
      `Responda pelo Chats: ${urlPublicaDoApp()}/chats/${ctx.leadId}`,
      `Quando quiser, devolva a conversa ao SDR por lá.`,
    ].join("\n"),
  });
}

/**
 * Agente de conversa (§7) para uma mensagem da pessoa. A decisão é de
 * `decidirResposta`; aqui ficam os efeitos, e o modo da conta manda (§4.7):
 * "aprovo cada resposta" → fila; sozinho → envio agendado. Texto barrado
 * pelo validador vai para a fila nos dois modos; chamar você tira o SDR da
 * conversa.
 */
export async function processarComAgente(deps: DependenciasDoAgente, mensagemId: string): Promise<ResultadoDoAgente> {
  const { db, modelo, agora } = deps;
  const rascunhoId = await reservar(db, mensagemId, agora);
  if (!rascunhoId) return "ja_processado";

  const consumo: Consumo = { modelos: {}, uso: {} };
  const { modelos, uso } = consumo;
  try {
    const ctx = await carregarContexto(db, mensagemId);
    if (!ctx || ctx.estado !== "em_conversa") {
      await concluir(db, rascunhoId, { resultado: "descartado", excecao: `lead em ${ctx?.estado ?? "estado desconhecido"}` });
      return "descartado";
    }
    const configuracao = await lerConfiguracao(db, "agente");
    // A versão do SDR vai junto do registro de cada rascunho (§7).
    const sdrVersao = ctx.sdr?.versao ?? null;
    const desfecho = await decidirResposta({
      entrada: ctx,
      modelo,
      configuracao,
      consumo,
      aoClassificar: async (classificacao) => {
        await db.query("update public.mensagens set categoria = $2 where id = $1::uuid", [mensagemId, classificacao.categoria]);
      },
    });

    if (desfecho.tipo === "optout") {
      const ultima = ctx.mensagens.filter((m) => m.direcao === "entrada").at(-1);
      await registrarOptout(db, { providerId: ctx.providerId, perfilOrigem: ctx.perfil.id, textoPedido: ultima?.texto ?? "", ator: "agente", agora });
      const { classificacao, decisao, excecao } = desfecho;
      await concluir(db, rascunhoId, { resultado: "optout_registrado", classificacao, decisao, excecao, modelos, uso, sdrVersao });
      return "optout_registrado";
    }
    if (desfecho.tipo === "sem_resposta") {
      await concluir(db, rascunhoId, {
        resultado: "sem_resposta_necessaria",
        classificacao: desfecho.classificacao,
        modelos,
        uso,
        sdrVersao,
      });
      return "sem_resposta_necessaria";
    }
    if (desfecho.tipo === "escalar") {
      const { classificacao, decisao, motivo } = desfecho;
      await escalar(db, ctx, { rascunhoId, motivo, agora });
      await concluir(db, rascunhoId, { resultado: "escalado", classificacao, decisao, excecao: motivo, modelos, uso, sdrVersao });
      return "escalado";
    }

    const { classificacao, decisao, texto, validacao, excecao } = desfecho;
    const base = { classificacao, decisao, texto, validacao, excecao, modelos, uso, sdrVersao };

    const automatico = ctx.modo === "automatico" && excecao === null;
    const [minimo, maximo] = configuracao.atraso_minutos;
    const atraso = minimo + (deps.aleatorio ?? Math.random)() * (maximo - minimo);
    const agendamento = await db.transacao(async (tx) => {
      // Enquanto o modelo pensava, você pode ter assumido (pelo Chats ou direto
      // no LinkedIn): aí o rascunho não entra (§4.7).
      const [atual] = await tx.query<{ estado: EstadoDoLead }>("select estado from public.leads where id = $1::uuid for update", [ctx.leadId]);
      if (atual?.estado !== "em_conversa") return { descartado: atual?.estado ?? "estado desconhecido" };

      // Rascunho mais novo substitui o que ainda estava na fila para o mesmo lead.
      await tx.query(
        `update public.acoes set status = 'cancelada', erro = 'substituída por rascunho mais novo'
          where lead_id = $1::uuid and origem = 'ia' and toque is null and status in ('pendente', 'aguardando_aprovacao')`,
        [ctx.leadId],
      );
      const acaoId = await agendarAcao(tx, {
        leadId: ctx.leadId,
        perfilId: ctx.perfil.id,
        tipo: "dm",
        toque: null,
        origem: "ia",
        agendadaPara: automatico ? new Date(agora.getTime() + atraso * 60_000) : agora,
        chave: `ia:${rascunhoId}`,
        status: automatico ? "pendente" : "aguardando_aprovacao",
        textoGerado: texto,
        motivoRevisao: excecao,
      });
      if (acaoId) {
        await tx.query("update public.acoes set validacao = $2::jsonb, texto_final = $3 where id = $1::uuid", [
          acaoId,
          validacao ? JSON.stringify(validacao) : null,
          automatico ? texto : null,
        ]);
      }
      return { acaoId };
    });
    if ("descartado" in agendamento) {
      await concluir(db, rascunhoId, { ...base, resultado: "descartado", excecao: `lead em ${agendamento.descartado}` });
      return "descartado";
    }
    const { acaoId } = agendamento;
    const resultado = automatico ? "agendado" : "na_fila";
    await concluir(db, rascunhoId, { ...base, resultado, acaoId });
    await registrarEvento(db, {
      tipo: "agente_rascunhou",
      entidade: "lead",
      entidadeId: ctx.leadId,
      perfilId: ctx.perfil.id,
      payload: { rascunho_id: rascunhoId, acao: decisao.acao, resultado, excecao },
      ator: "agente",
      em: agora,
    });
    return resultado;
  } catch (erro) {
    await db.query("update public.rascunhos set resultado = 'erro', erro = $2, modelos = $3::jsonb, uso = $4::jsonb where id = $1::uuid", [
      rascunhoId,
      (erro as Error).message ?? String(erro),
      JSON.stringify({ ...modelos, prompts: VERSAO_DOS_PROMPTS }),
      JSON.stringify(uso),
    ]);
    return "erro";
  }
}

/**
 * Mensagens da pessoa ainda sem resposta nem rascunho (a mais recente de cada
 * lead em conversa). Roda no tick e logo depois do webhook.
 */
export async function processarMensagensPendentes(deps: DependenciasDoAgente, limite = 5): Promise<ResultadoDoAgente[]> {
  const pendentes = await deps.db.query<{ id: string }>(
    `with ultimas as (
       select distinct on (m.lead_id) m.id, m.lead_id, m.em
         from public.mensagens m join public.leads l on l.id = m.lead_id
        where m.direcao = 'entrada' and l.estado = 'em_conversa' and m.em > $1::timestamptz - interval '14 days'
        order by m.lead_id, m.em desc
     )
     select u.id from ultimas u
      where not exists (
              select 1 from public.mensagens s where s.lead_id = u.lead_id and s.direcao = 'saida' and s.em > u.em)
        and not exists (
              select 1 from public.rascunhos r
               where r.mensagem_id = u.id
                 and not (r.resultado = 'erro' and r.tentativas < 3)
                 and not (r.resultado = 'processando' and r.atualizado_em < $1::timestamptz - interval '10 minutes'))
      order by u.em
      limit $2`,
    [deps.agora, limite],
  );
  const resultados: ResultadoDoAgente[] = [];
  for (const { id } of pendentes) resultados.push(await processarComAgente(deps, id));
  return resultados;
}
