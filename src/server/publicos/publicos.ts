import { limparEdicao } from "@/domain/edicao";
import {
  type Aderencia,
  explicarErroDoPublico,
  provasForaDoDossie,
  publico as esquemaDoPublico,
  publicosDaSugestao,
  type Publico,
} from "@/domain/publico";
import { ErroDoModelo } from "@/server/agente/modelo";
import { concorrentesConfirmados } from "@/server/concorrentes/concorrentes";
import { comOperador } from "@/server/db/operador";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { dossieConfirmado } from "@/server/oferta/oferta";
import { entradaDaSugestao, promptDaSugestao, VERSAO_DOS_PROMPTS_DE_PUBLICOS } from "./prompts";
import type { SugeridorDePublicos } from "./sugeridor";

export type StatusDoPublico = "sugerido" | "ativo" | "arquivado";

export type PublicoSalvo = Publico & {
  id: string;
  status: StatusDoPublico;
  origem: "ia" | "humano";
  /** O dossiê foi confirmado de novo depois que o público foi feito ou revisto (§4.11). */
  desatualizado: boolean;
  /** A nota da IA na sugestão; o público editado por um humano não tem. */
  aderencia: Aderencia | null;
};

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; erro: string };

type LinhaDoPublico = {
  id: string;
  nome: string;
  quem: Publico["quem"];
  empresa: Publico["empresa"];
  por_que: Publico["por_que"];
  angulo: string;
  provas: string[];
  quem_nao_e: string;
  origem: "ia" | "humano";
  status: StatusDoPublico;
  desatualizado: boolean;
  aderencia: number | null;
  aderencia_motivo: string | null;
};

const COLUNAS = `p.id, p.nome, p.quem, p.empresa, p.por_que, p.angulo, p.provas, p.quem_nao_e, p.origem, p.status,
  coalesce(o.confirmado_em > p.dossie_base_em, false) as desatualizado, p.aderencia, p.aderencia_motivo`;

const DE_PUBLICOS = `public.publicos p left join public.ofertas o on o.organizacao_id = p.organizacao_id`;

const doBanco = (linha: LinhaDoPublico): PublicoSalvo => ({
  id: linha.id,
  nome: linha.nome,
  quem: linha.quem,
  empresa: linha.empresa,
  por_que: linha.por_que,
  angulo: linha.angulo,
  provas: linha.provas,
  quem_nao_e: linha.quem_nao_e,
  origem: linha.origem,
  status: linha.status,
  desatualizado: linha.desatualizado,
  aderencia: linha.aderencia === null ? null : { nota: linha.aderencia, motivo: linha.aderencia_motivo ?? "" },
});

/** Os públicos da organização, dos escolhidos para os arquivados, e dentro de cada um pela aderência. Roda como o operador (RLS). */
export async function listarPublicos(db: Db, organizacaoId: string): Promise<PublicoSalvo[]> {
  const linhas = await db.query<LinhaDoPublico>(
    `select ${COLUNAS} from ${DE_PUBLICOS}
      where p.organizacao_id = $1::uuid
      order by case p.status when 'ativo' then 0 when 'sugerido' then 1 else 2 end, p.aderencia desc nulls last, p.criado_em, p.nome`,
    [organizacaoId],
  );
  return linhas.map(doBanco);
}

export async function obterPublico(db: Db, id: string): Promise<PublicoSalvo | null> {
  const [linha] = await db.query<LinhaDoPublico>(`select ${COLUNAS} from ${DE_PUBLICOS} where p.id = $1::uuid`, [id]);
  return linha ? doBanco(linha) : null;
}

/**
 * O público da abordagem do primeiro acesso (SDR-56): o escolhido, se houver;
 * senão a sugestão de maior aderência vira o escolhido, para a tela abrir já
 * com pessoas e mensagens. A pessoa troca pela lista de públicos antes de
 * permitir. Sem nenhum público, null: quem chama pede sugestões. Roda como o
 * operador.
 */
export async function publicoDoPrimeiroAcesso(
  db: Db,
  p: { organizacaoId: string; operadorId: string; agora: Date },
): Promise<PublicoSalvo | null> {
  const publicos = await listarPublicos(db, p.organizacaoId);
  const ativo = publicos.find((pub) => pub.status === "ativo");
  if (ativo) return ativo;
  // A lista já vem pela aderência.
  const melhor = publicos.find((pub) => pub.status === "sugerido");
  if (!melhor) return null;
  const escolhido = await mudarStatusDoPublico(db, { id: melhor.id, acao: "escolher", operadorId: p.operadorId, agora: p.agora });
  return escolhido.ok ? { ...melhor, status: "ativo" } : null;
}

/**
 * O público que pode virar campanha (SDR-26): só o que um humano escolheu ou
 * criou. Sugestão da IA e arquivado ficam de fora.
 */
export async function publicoParaCampanha(db: Db, id: string): Promise<PublicoSalvo | null> {
  const encontrado = await obterPublico(db, id);
  return encontrado?.status === "ativo" ? encontrado : null;
}

async function confirmadoEm(db: Db, organizacaoId: string): Promise<Date | null> {
  const [linha] = await db.query<{ confirmado_em: Date | null }>(
    "select confirmado_em from public.ofertas where organizacao_id = $1::uuid",
    [organizacaoId],
  );
  return linha?.confirmado_em ?? null;
}

const SEM_DOSSIE = "Confirme o dossiê da oferta antes: os públicos saem dele.";

/**
 * Pede à IA de 3 a 5 públicos a partir do dossiê confirmado e troca as
 * sugestões anteriores pelas novas. Escolhidos e arquivados ficam como estão.
 * Lê e grava como o operador; a chamada à IA fica fora da transação.
 */
export async function sugerirPublicos(
  deps: { db: Db; sugeridor: SugeridorDePublicos; agora: () => Date },
  p: { organizacaoId: string; operadorId: string },
): Promise<Resultado<{ quantidade: number }>> {
  const entrada = await comOperador(deps.db, p.operadorId, async (tx) => {
    const dossie = await dossieConfirmado(tx, p.organizacaoId);
    if (!dossie) return null;
    const escolhidos = (await listarPublicos(tx, p.organizacaoId)).filter((pub) => pub.status === "ativo");
    return {
      dossie,
      jaEscolhidos: escolhidos,
      concorrentes: await concorrentesConfirmados(tx, p.organizacaoId),
      baseEm: await confirmadoEm(tx, p.organizacaoId),
    };
  });
  if (!entrada) return { ok: false, erro: SEM_DOSSIE };

  let resposta;
  try {
    resposta = await deps.sugeridor.sugerir({ sistema: promptDaSugestao(), entrada: entradaDaSugestao(entrada) });
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) console.error("Sugestão de públicos falhou", erro);
    const motivo = erro instanceof ErroDoModelo ? erro.message.replace(/\.$/, "") : "a IA não respondeu";
    return { ok: false, erro: `Não consegui sugerir públicos: ${motivo}.` };
  }

  const { publicos, descartados } = publicosDaSugestao(resposta.saida, entrada.dossie);
  if (publicos.length === 0) return { ok: false, erro: "A IA não trouxe nenhum público aproveitável. Tente de novo." };

  const agora = deps.agora();
  await comOperador(deps.db, p.operadorId, async (tx) => {
    await tx.query("delete from public.publicos where organizacao_id = $1::uuid and status = 'sugerido'", [p.organizacaoId]);
    for (const pub of publicos) {
      await tx.query(
        `insert into public.publicos
           (organizacao_id, nome, quem, empresa, por_que, angulo, provas, quem_nao_e, praca, origem, status,
            dossie_base_em, criado_por, criado_em, atualizado_em, aderencia, aderencia_motivo)
         values ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8, 'domestico', 'ia', 'sugerido', $9, $10::uuid, $11, $11,
                 $12, $13)`,
        [
          p.organizacaoId,
          pub.nome,
          JSON.stringify(pub.quem),
          JSON.stringify(pub.empresa),
          JSON.stringify(pub.por_que),
          pub.angulo,
          JSON.stringify(pub.provas),
          pub.quem_nao_e,
          entrada.baseEm,
          p.operadorId,
          agora,
          pub.aderencia?.nota ?? null,
          pub.aderencia?.motivo ?? null,
        ],
      );
    }
    await registrarEvento(tx, {
      tipo: "publicos_sugeridos",
      entidade: "organizacao",
      entidadeId: p.organizacaoId,
      payload: {
        quantidade: publicos.length,
        descartados,
        modelo: resposta.modelo,
        custo_usd: Number((custoDaChamada(resposta.modelo, resposta.uso) ?? 0).toFixed(4)),
        versao_prompt: VERSAO_DOS_PROMPTS_DE_PUBLICOS,
      },
      ator: p.operadorId,
      em: agora,
    });
  });
  return { ok: true, quantidade: publicos.length };
}

/**
 * Grava um público criado ou editado por um humano (§4.12). Prova só do dossiê
 * confirmado. `ativar` escolhe a sugestão junto; público novo já nasce ativo.
 * Quem salva revisou o público contra o dossiê de agora: o aviso de
 * desatualizado sai, e a aderência da IA também, que era do texto dela.
 * Roda como o operador.
 */
export async function salvarPublico(
  db: Db,
  p: { organizacaoId: string; id: string | null; publico: unknown; ativar: boolean; operadorId: string; agora: Date },
): Promise<Resultado<{ id: string }>> {
  const validado = esquemaDoPublico.safeParse(limparEdicao(p.publico));
  if (!validado.success) return { ok: false, erro: explicarErroDoPublico(validado.error) };
  const pub = validado.data;

  const dossie = await dossieConfirmado(db, p.organizacaoId);
  if (!dossie) return { ok: false, erro: SEM_DOSSIE };
  const [fora] = provasForaDoDossie(pub, dossie);
  if (fora) return { ok: false, erro: `A prova "${fora}" não está no dossiê confirmado.` };
  const baseEm = await confirmadoEm(db, p.organizacaoId);

  if (p.id === null) {
    const [criado] = await db.query<{ id: string }>(
      `insert into public.publicos
         (organizacao_id, nome, quem, empresa, por_que, angulo, provas, quem_nao_e, praca, origem, status,
          dossie_base_em, escolhido_por, escolhido_em, criado_por, criado_em, atualizado_em)
       values ($1::uuid, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8, 'domestico', 'humano', 'ativo',
               $9, $10::uuid, $11, $10::uuid, $11, $11)
       returning id`,
      [
        p.organizacaoId,
        pub.nome,
        JSON.stringify(pub.quem),
        JSON.stringify(pub.empresa),
        JSON.stringify(pub.por_que),
        pub.angulo,
        JSON.stringify(pub.provas),
        pub.quem_nao_e,
        baseEm,
        p.operadorId,
        p.agora,
      ],
    );
    await registrarEvento(db, { tipo: "publico_criado", entidade: "publico", entidadeId: criado!.id, payload: {}, ator: p.operadorId, em: p.agora });
    return { ok: true, id: criado!.id };
  }

  // Escolher junto só vale para sugestão; arquivado não se edita.
  const [editado] = await db.query<{ ativou: boolean }>(
    `with antes as (select id, status from public.publicos where id = $1::uuid and organizacao_id = $2::uuid)
     update public.publicos p
        set nome = $3, quem = $4::jsonb, empresa = $5::jsonb, por_que = $6::jsonb, angulo = $7, provas = $8::jsonb,
            quem_nao_e = $9, dossie_base_em = $10, editado_por = $11::uuid, editado_em = $12,
            atualizado_em = $12, aderencia = null, aderencia_motivo = null,
            status = case when $13 and antes.status = 'sugerido' then 'ativo' else antes.status end,
            escolhido_por = case when $13 and antes.status = 'sugerido' then $11::uuid else p.escolhido_por end,
            escolhido_em = case when $13 and antes.status = 'sugerido' then $12 else p.escolhido_em end
       from antes
      where p.id = antes.id and antes.status <> 'arquivado'
      returning ($13 and antes.status = 'sugerido') as ativou`,
    [
      p.id,
      p.organizacaoId,
      pub.nome,
      JSON.stringify(pub.quem),
      JSON.stringify(pub.empresa),
      JSON.stringify(pub.por_que),
      pub.angulo,
      JSON.stringify(pub.provas),
      pub.quem_nao_e,
      baseEm,
      p.operadorId,
      p.agora,
      p.ativar,
    ],
  );
  if (!editado) return { ok: false, erro: "Público não encontrado ou arquivado." };
  await registrarEvento(db, { tipo: "publico_editado", entidade: "publico", entidadeId: p.id, payload: {}, ator: p.operadorId, em: p.agora });
  if (editado.ativou) {
    await registrarEvento(db, { tipo: "publico_escolhido", entidade: "publico", entidadeId: p.id, payload: {}, ator: p.operadorId, em: p.agora });
  }
  return { ok: true, id: p.id };
}

const TRANSICOES: Record<"escolher" | "arquivar" | "reativar", { de: StatusDoPublico[]; para: StatusDoPublico; evento: string }> = {
  escolher: { de: ["sugerido"], para: "ativo", evento: "publico_escolhido" },
  arquivar: { de: ["sugerido", "ativo"], para: "arquivado", evento: "publico_arquivado" },
  reativar: { de: ["arquivado"], para: "ativo", evento: "publico_reativado" },
};

/**
 * Escolher uma sugestão, arquivar ou voltar a usar. Escolher é a decisão
 * humana que deixa o público virar campanha. Roda como o operador.
 */
export async function mudarStatusDoPublico(
  db: Db,
  p: { id: string; acao: keyof typeof TRANSICOES; operadorId: string; agora: Date },
): Promise<Resultado> {
  const transicao = TRANSICOES[p.acao];
  const marcaEscolha = transicao.para === "ativo";
  const [mudou] = await db.query<{ id: string }>(
    `update public.publicos
        set status = $2, atualizado_em = $4,
            escolhido_por = case when $5 then $3::uuid else escolhido_por end,
            escolhido_em = case when $5 then $4 else escolhido_em end
      where id = $1::uuid and status = any($6::text[])
      returning id`,
    [p.id, transicao.para, p.operadorId, p.agora, marcaEscolha, transicao.de],
  );
  if (!mudou) return { ok: false, erro: "O público mudou enquanto você olhava. Recarregue a tela." };
  await registrarEvento(db, { tipo: transicao.evento, entidade: "publico", entidadeId: p.id, payload: {}, ator: p.operadorId, em: p.agora });
  return { ok: true };
}
