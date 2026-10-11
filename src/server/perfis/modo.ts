import { z } from "zod";
import { VERSAO_DOS_PROMPTS } from "@/server/agente/prompts";
import { enfileirarAlerta } from "@/server/alertas/alertas";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";

/** Sozinho (`automatico`) ou "aprovo cada resposta" (`aprovacao`), §4.7. */
export type ModoDeResposta = "aprovacao" | "automatico";

const PRACAS = ["domestico", "canada", "espanha"] as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export class ErroDeModo extends Error {
  constructor(readonly motivos: string[]) {
    super(motivos.join(" "));
  }
}

// ---------------------------------------------------------------------------
// Eval: ferramenta interna para comparar versões de prompt (§4.7). Não trava
// mais o modo automático.

/** O pedaço do relatorio.json do eval (SDR-16) que fica registrado. */
const relatorioDoEval = z.object({
  geradoEm: z.string(),
  versaoDosPrompts: z.string(),
  versaoDoJuiz: z.string(),
  pracas: z.array(
    z.object({
      praca: z.enum(PRACAS),
      casos: z.number().int(),
      veredito: z.enum(["aprovado", "reprovado", "inconclusivo"]),
      motivos: z.array(z.string()),
      custo: z.object({ total: z.number() }),
    }),
  ),
});

/**
 * Registra o resultado de uma rodada do eval, uma linha por praça. Só aceita a
 * rodada da versão atual dos prompts: um veredito de outra versão não diz nada
 * sobre o agente que está rodando.
 */
export async function registrarEval(
  db: Db,
  p: { relatorio: unknown; operadorId: string | null; agora: Date },
): Promise<{ praca: string; veredito: string }[]> {
  const lido = relatorioDoEval.safeParse(p.relatorio);
  if (!lido.success) throw new ErroDeModo(["O arquivo não é um relatorio.json do eval."]);
  const relatorio = lido.data;
  if (relatorio.versaoDosPrompts !== VERSAO_DOS_PROMPTS) {
    throw new ErroDeModo([
      `A rodada é da versão ${relatorio.versaoDosPrompts} dos prompts, e a atual é ${VERSAO_DOS_PROMPTS}. Rode o eval de novo.`,
    ]);
  }
  if (relatorio.pracas.length === 0) throw new ErroDeModo(["A rodada não tem nenhuma praça."]);
  for (const praca of relatorio.pracas) {
    await db.query(
      `insert into public.evals
         (praca, versao_dos_prompts, versao_do_juiz, veredito, casos, custo_usd, motivos, gerado_em, registrado_por, registrado_em)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::uuid, $10)`,
      [
        praca.praca,
        relatorio.versaoDosPrompts,
        relatorio.versaoDoJuiz,
        praca.veredito,
        praca.casos,
        praca.custo.total,
        JSON.stringify(praca.motivos),
        new Date(relatorio.geradoEm),
        p.operadorId,
        p.agora,
      ],
    );
  }
  await registrarEvento(db, {
    tipo: "eval_registrado",
    entidade: "eval",
    payload: {
      versao_dos_prompts: relatorio.versaoDosPrompts,
      gerado_em: relatorio.geradoEm,
      vereditos: Object.fromEntries(relatorio.pracas.map((r) => [r.praca, r.veredito])),
    },
    ator: p.operadorId ?? "sistema",
    em: p.agora,
  });
  return relatorio.pracas.map((r) => ({ praca: r.praca, veredito: r.veredito }));
}

/** Veredito da rodada mais recente da praça para a versão atual dos prompts. */
export async function vereditoDoEval(db: Db, praca: string): Promise<string | null> {
  const [linha] = await db.query<{ veredito: string }>(
    `select veredito from public.evals
      where praca = $1 and versao_dos_prompts = $2
      order by gerado_em desc, registrado_em desc
      limit 1`,
    [praca, VERSAO_DOS_PROMPTS],
  );
  return linha?.veredito ?? null;
}

// ---------------------------------------------------------------------------
// Troca de modo

/**
 * Rascunhos automáticos que ainda não saíram voltam para a fila quando o perfil
 * deixa o `automatico`: quem decidiu sair não quer que eles saiam sozinhos.
 */
async function devolverPendentesParaFila(db: Db, perfilId: string, motivo: string): Promise<number> {
  const devolvidas = await db.query<{ id: string }>(
    `update public.acoes
        set status = 'aguardando_aprovacao', texto_final = null, motivo_revisao = $2
      where perfil_id = $1::uuid and origem = 'ia' and toque is null and status = 'pendente'
      returning id`,
    [perfilId, motivo],
  );
  return devolvidas.length;
}

/**
 * Troca o modo de resposta da conta (§4.7). É um ato humano, registrado em
 * `eventos` com o operador, e vale para a próxima resposta. Na Espanha a DM é
 * escrita à mão até as regras por praça saírem (SDR-53).
 */
export async function trocarModo(
  db: Db,
  p: { perfilId: string; para: ModoDeResposta; operadorId: string; agora: Date },
): Promise<void> {
  await db.transacao(async (tx) => {
    const [perfil] = await tx.query<{ modo_resposta: ModoDeResposta; praca: string }>(
      "select modo_resposta, praca from public.perfis where id = $1::uuid for update",
      [p.perfilId],
    );
    if (!perfil) throw new ErroDeModo(["Perfil não encontrado."]);
    if (perfil.modo_resposta === p.para) throw new ErroDeModo([`O perfil já está em ${p.para}.`]);
    if (p.para === "automatico" && perfil.praca === "espanha") {
      throw new ErroDeModo(["Na Espanha a DM é escrita à mão: o SDR não responde sozinho neste perfil."]);
    }

    await tx.query("update public.perfis set modo_resposta = $2, modo_desde = $3 where id = $1::uuid", [
      p.perfilId,
      p.para,
      p.agora,
    ]);
    const devolvidas =
      perfil.modo_resposta === "automatico"
        ? await devolverPendentesParaFila(tx, p.perfilId, `o perfil saiu do automático para ${p.para}`)
        : 0;
    await registrarEvento(tx, {
      tipo: "modo_alterado",
      entidade: "perfil",
      entidadeId: p.perfilId,
      perfilId: p.perfilId,
      payload: { de: perfil.modo_resposta, para: p.para, devolvidas_para_fila: devolvidas },
      ator: p.operadorId,
      em: p.agora,
    });
  });
}

// ---------------------------------------------------------------------------
// Rebaixamento automático

export type TaxaDeErro = { mensagens: number; erros: number; taxa: number | null };

/**
 * Taxa de erro do automático (interpretação na spec, SDR-17): das DMs que a IA
 * agendou sozinha na janela e que já tiveram desfecho, a fração que o
 * validador barrou no envio, que falhou de vez ou cuja pessoa pediu opt-out
 * depois de recebê-la.
 */
export async function taxaDeErroDoAutomatico(db: Db, p: { perfilId: string; agora: Date; dias: number }): Promise<TaxaDeErro> {
  const [linha] = await db.query<{ mensagens: number; erros: number }>(
    `with automaticas as (
       select a.id, a.status, a.enviada_em, pe.provider_id,
              exists (select 1 from public.eventos e
                       where e.entidade = 'acao' and e.entidade_id = a.id::text and e.tipo = 'acao_em_revisao') as barrada
         from public.acoes a
         join public.rascunhos r on r.acao_id = a.id and r.resultado = 'agendado'
         join public.leads l on l.id = a.lead_id
         join public.pessoas pe on pe.id = l.pessoa_id
        where a.perfil_id = $1::uuid and a.criada_em > $2::timestamptz - make_interval(days => $3::int)
     )
     select count(*) filter (where barrada or status in ('enviada', 'falhou'))::int as mensagens,
            count(*) filter (where barrada or status = 'falhou'
                               or (status = 'enviada' and exists (
                                     select 1 from public.optouts o
                                      where o.provider_id = automaticas.provider_id and o.em >= automaticas.enviada_em)))::int as erros
       from automaticas`,
    [p.perfilId, p.agora, p.dias],
  );
  const mensagens = linha?.mensagens ?? 0;
  const erros = linha?.erros ?? 0;
  return { mensagens, erros, taxa: mensagens > 0 ? erros / mensagens : null };
}

/**
 * Etapa do tick: perfil em `automatico` com taxa de erro acima do limiar volta
 * sozinho para `aprovacao` (§9, SDR-17). Fica registrado em `eventos`, o dono e
 * o admin recebem alerta, e os rascunhos que ainda não saíram voltam para a fila.
 */
export async function avaliarModosAutomaticos(db: Db, agora: Date): Promise<{ rebaixados: string[] }> {
  const config = await lerConfiguracao(db, "gate_automatico");
  const perfis = await db.query<{ id: string; nome: string }>(
    "select id, nome from public.perfis where modo_resposta = 'automatico'",
  );
  const rebaixados: string[] = [];
  for (const perfil of perfis) {
    const erro = await taxaDeErroDoAutomatico(db, { perfilId: perfil.id, agora, dias: config.janela_erro_dias });
    if (erro.mensagens < config.amostra_minima_erro || erro.taxa === null || erro.taxa <= config.limiar_erro) continue;

    const motivo = `Taxa de erro de ${pct(erro.taxa)} nas mensagens automáticas dos últimos ${config.janela_erro_dias} dias (${erro.erros} de ${erro.mensagens}), acima de ${pct(config.limiar_erro)}.`;
    await db.transacao(async (tx) => {
      const mudou = await tx.query(
        `update public.perfis set modo_resposta = 'aprovacao', modo_desde = $2
          where id = $1::uuid and modo_resposta = 'automatico' returning id`,
        [perfil.id, agora],
      );
      if (mudou.length === 0) return;
      const devolvidas = await devolverPendentesParaFila(tx, perfil.id, `rebaixado para aprovação: ${motivo}`);
      await registrarEvento(tx, {
        tipo: "modo_rebaixado",
        entidade: "perfil",
        entidadeId: perfil.id,
        perfilId: perfil.id,
        payload: { de: "automatico", para: "aprovacao", motivo, ...erro, devolvidas_para_fila: devolvidas },
        ator: "sistema",
        em: agora,
      });
      await enfileirarAlerta(tx, {
        chave: `rebaixado/${perfil.id}/${agora.toISOString()}`,
        tipo: "modo_rebaixado",
        perfilId: perfil.id,
        assunto: `[SDR] Perfil ${perfil.nome} voltou para aprovação`,
        texto: [
          `O perfil ${perfil.nome} saiu do modo automático e voltou para aprovação.`,
          ``,
          `Motivo: ${motivo}`,
          ``,
          `As respostas que ainda não tinham saído esperam aprovação nos Chats. Para o SDR voltar a responder sozinho, troque o modo da conta.`,
        ].join("\n"),
      });
      rebaixados.push(perfil.id);
    });
  }
  return { rebaixados };
}
