import { contextoDeValidacao } from "@/domain/campanha";
import { dentroDaJanela, limitesDoDia, type Janela } from "@/domain/calendario";
import { STATUS_SAUDAVEIS } from "@/domain/conta";
import { validarMensagem, type Praca, type ResultadoDaValidacao } from "@/domain/validador";
import type { ConviteT1, ModeloDeLinguagem, Resposta } from "@/server/agente/modelo";
import { entradaDoConvite, promptDoConvite, VERSAO_DOS_PROMPTS } from "@/server/agente/prompts";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { feriadosDaPraca } from "@/server/despachante/perfis";
import { registrarEvento } from "@/server/eventos";
import { passoDoLead } from "@/server/fluxo/fluxos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { classificarErro } from "@/server/unipile/erros";

export type Pesquisa = {
  titulo: string | null;
  resumo: string | null;
  localizacao: string | null;
  experiencia: { empresa: string | null; cargo: string | null; atual: boolean }[];
  posts: { texto: string; data: string | null }[];
  coletada_em: string;
};

/** Perfil completo e posts recentes do prospect pela Unipile. Conta como visita de perfil. */
export async function pesquisarProspect(
  unipile: ClienteUnipile,
  accountId: string,
  providerId: string,
  agora: Date,
): Promise<Pesquisa> {
  const perfil = await unipile.obterPerfil(accountId, providerId, { completo: true });
  // Sem posts a nota ainda sai, apoiada em cargo e empresa.
  const posts = await unipile.listarPosts(accountId, providerId, 5).catch(() => []);
  return {
    titulo: perfil.titulo,
    resumo: perfil.resumo?.slice(0, 1500) ?? null,
    localizacao: perfil.localizacao,
    experiencia: perfil.experiencia.slice(0, 5).map(({ empresa, cargo, atual }) => ({ empresa, cargo, atual })),
    posts: posts.slice(0, 5).map((post) => ({ texto: post.texto.slice(0, 600), data: post.data })),
    coletada_em: agora.toISOString(),
  };
}

type Pendente = {
  acao_id: string;
  lead_id: string;
  perfil_id: string;
  tentativas: number;
  pesquisa: Pesquisa | null;
  provider_id: string;
  primeiro_nome: string | null;
  nome: string;
  cargo: string | null;
  empresa: string | null;
  localizacao: string | null;
  angulo: string;
  toque: string | null;
  account_id: string;
  unipile_status: string | null;
  perfil_nome: string;
  praca: Praca;
  idioma: string;
  fuso: string;
  janela: Janela;
  voz_md: string | null;
  regras_md: string | null;
  palavras_proibidas: string[];
  rodape_obrigatorio: string | null;
  limite_nota_convite: number;
};

export type ResultadoDaPesquisa = {
  acaoId: string;
  resultado: "na_fila" | "fora_da_janela" | "limite_do_dia" | "conta_indisponivel" | "erro" | "voltou_para_template";
};

const MAX_TENTATIVAS = 3;

/**
 * T1 personalizado (§9 SDR-15): para cada convite do braço personalizado ainda
 * sem texto, pesquisa o prospect, gera os ângulos, escreve a nota, valida e
 * manda para a fila de aprovação. Nada sai sem humano.
 *
 * A pesquisa é visita de perfil: só na janela do perfil e até `max_por_dia`
 * por perfil. Nota barrada pelo validador ganha uma reescrita com os problemas
 * apontados; se ainda falhar, vai para a fila com o motivo. Depois de 3 falhas
 * de pesquisa ou de modelo, o lead volta para o template (e o A/B registra).
 */
export async function processarPesquisasPendentes(
  deps: { db: Db; unipile: ClienteUnipile; modelo: ModeloDeLinguagem; agora: Date },
  limite = 3,
): Promise<ResultadoDaPesquisa[]> {
  const { db, agora } = deps;
  const config = await lerConfiguracao(db, "pesquisa");
  const pendentes = await db.query<Pendente>(
    `select a.id as acao_id, a.lead_id, a.perfil_id, a.tentativas, l.pesquisa, pe.provider_id, pe.primeiro_nome,
            pe.nome, pe.cargo, pe.empresa, pe.localizacao, c.angulo, a.toque,
            pf.unipile_account_id as account_id, pf.unipile_status, pf.nome as perfil_nome, pf.praca, pf.idioma,
            pf.fuso, pf.janela, pf.voz_md, pf.regras_md, pf.palavras_proibidas, pf.rodape_obrigatorio,
            pf.limite_nota_convite
       from public.acoes a
       join public.leads l on l.id = a.lead_id
       join public.pessoas pe on pe.id = l.pessoa_id
       join public.campanhas c on c.id = l.campanha_id
       join public.perfis pf on pf.id = a.perfil_id
      where a.tipo = 'convite' and a.origem = 'ia' and a.status = 'pendente' and a.texto_gerado is null
        and a.agendada_para <= $2 and pf.status = 'ativo' and pf.unipile_account_id is not null
      order by a.agendada_para, a.criada_em
      limit $1`,
    [limite, agora],
  );

  const resultados: ResultadoDaPesquisa[] = [];
  const perfisIndisponiveis = new Set<string>();
  for (const p of pendentes) {
    const registrar = (resultado: ResultadoDaPesquisa["resultado"]) => resultados.push({ acaoId: p.acao_id, resultado });
    if (perfisIndisponiveis.has(p.perfil_id) || (p.unipile_status && !STATUS_SAUDAVEIS.has(p.unipile_status))) {
      registrar("conta_indisponivel");
      continue;
    }

    let pesquisa = p.pesquisa;
    if (!pesquisa) {
      if (!dentroDaJanela(agora, p.fuso, p.janela, await feriadosDaPraca(db, p.praca))) {
        registrar("fora_da_janela");
        continue;
      }
      const { inicio, fim } = limitesDoDia(agora, p.fuso);
      const [feitas] = await db.query<{ n: number }>(
        `select count(*)::int as n from public.eventos
          where perfil_id = $1::uuid and tipo = 'pesquisa_feita' and em >= $2 and em < $3`,
        [p.perfil_id, inicio, fim],
      );
      if (feitas!.n >= config.max_por_dia) {
        registrar("limite_do_dia");
        continue;
      }
    }

    try {
      if (!pesquisa) {
        pesquisa = await pesquisarProspect(deps.unipile, p.account_id, p.provider_id, agora);
        await db.query("update public.leads set pesquisa = $2::jsonb where id = $1::uuid", [
          p.lead_id,
          JSON.stringify(pesquisa),
        ]);
        await registrarEvento(db, {
          tipo: "pesquisa_feita",
          entidade: "lead",
          entidadeId: p.lead_id,
          perfilId: p.perfil_id,
          em: agora,
        });
      }
      await escreverT1(deps, p, pesquisa);
      registrar("na_fila");
    } catch (erro) {
      const classe = classificarErro(erro);
      // Conta ou limite do LinkedIn: não gasta tentativa e para o perfil neste tick.
      if (classe === "conta" || classe === "limite") {
        perfisIndisponiveis.add(p.perfil_id);
        registrar("conta_indisponivel");
        continue;
      }
      const mensagem = (erro as Error).message;
      const tentativas = p.tentativas + 1;
      if (tentativas < MAX_TENTATIVAS) {
        await db.query("update public.acoes set tentativas = $2, erro = $3 where id = $1::uuid", [
          p.acao_id,
          tentativas,
          mensagem,
        ]);
        registrar("erro");
        continue;
      }
      await db.transacao(async (tx) => {
        await tx.query("update public.acoes set origem = 'template', tentativas = 0, erro = $2 where id = $1::uuid", [
          p.acao_id,
          `T1 personalizado desistiu depois de ${MAX_TENTATIVAS} tentativas: ${mensagem}`,
        ]);
        await tx.query("update public.leads set variante_copy = 'template' where id = $1::uuid", [p.lead_id]);
        await registrarEvento(tx, {
          tipo: "t1_personalizado_desistiu",
          entidade: "acao",
          entidadeId: p.acao_id,
          perfilId: p.perfil_id,
          payload: { lead_id: p.lead_id, erro: mensagem },
          em: agora,
        });
      });
      registrar("voltou_para_template");
    }
  }
  return resultados;
}

async function escreverT1(
  deps: { db: Db; modelo: ModeloDeLinguagem; agora: Date },
  p: Pendente,
  pesquisa: Pesquisa,
): Promise<void> {
  // O bloco de convite do fluxo do lead: referência de estilo e teto da nota.
  const t1 = await passoDoLead(deps.db, p.lead_id, p.toque ?? "T1");
  const perfilDeValidacao = {
    praca: p.praca,
    palavrasProibidas: p.palavras_proibidas,
    rodapeObrigatorio: p.rodape_obrigatorio,
    limiteNotaConvite: p.limite_nota_convite,
  };
  const contexto = { ...contextoDeValidacao(perfilDeValidacao, t1, "ia"), tipo: "convite" as const };
  const sistema = promptDoConvite({
    perfil: {
      nome: p.perfil_nome,
      praca: p.praca,
      idioma: p.idioma,
      voz: p.voz_md,
      regras: p.regras_md,
      palavrasProibidas: p.palavras_proibidas,
      rodape: p.rodape_obrigatorio,
    },
    angulo: p.angulo,
    tetoCaracteres: Math.min(contexto.tetoCaracteres ?? p.limite_nota_convite, p.limite_nota_convite),
    limiteDoLinkedIn: p.limite_nota_convite,
    referencia: t1?.template ?? null,
  });
  const prospect = {
    nome: p.nome,
    primeiroNome: p.primeiro_nome,
    cargo: p.cargo,
    empresa: p.empresa,
    localizacao: p.localizacao,
  };

  const respostas: Resposta<ConviteT1>[] = [];
  let validacao: ResultadoDaValidacao;
  let nota: string;
  let barrada: { nota: string; problemas: string[] } | undefined;
  do {
    const resposta = await deps.modelo.escreverConvite({ sistema, entrada: entradaDoConvite({ prospect, pesquisa, barrada }) });
    respostas.push(resposta);
    nota = resposta.saida.nota.trim();
    validacao = validarMensagem(nota, contexto);
    barrada = { nota, problemas: validacao.violacoes.map((v) => v.mensagem) };
  } while (!validacao.ok && respostas.length < 2);

  const final = respostas.at(-1)!;
  const avisos = [
    ...validacao.violacoes.map((v) => v.mensagem),
    ...(final.saida.confianca < 0.6 ? [`Confiança baixa da IA (${final.saida.confianca.toFixed(2)}).`] : []),
  ];
  await deps.db.transacao(async (tx) => {
    const [atualizada] = await tx.query(
      `update public.acoes
          set status = 'aguardando_aprovacao', texto_gerado = $2, motivo_revisao = $3, validacao = $4::jsonb, erro = null
        where id = $1::uuid and status = 'pendente' and texto_gerado is null
        returning id`,
      [p.acao_id, nota, avisos.length ? avisos.join(" ") : null, JSON.stringify(validacao)],
    );
    if (!atualizada) return; // cancelada no meio (resposta, opt-out, pausa)
    await registrarEvento(tx, {
      tipo: "t1_personalizado",
      entidade: "acao",
      entidadeId: p.acao_id,
      perfilId: p.perfil_id,
      payload: {
        lead_id: p.lead_id,
        ganchos: final.saida.ganchos,
        gancho: final.saida.gancho,
        motivo: final.saida.motivo,
        confianca: final.saida.confianca,
        reescritas: respostas.length - 1,
        validador_ok: validacao.ok,
        modelo: final.modelo,
        prompts: VERSAO_DOS_PROMPTS,
        uso: respostas.map((r) => r.uso),
      },
      em: deps.agora,
    });
  });
}
