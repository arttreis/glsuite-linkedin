import type { ContextoDoPerfil } from "@/domain/campanha";
import type { ConcorrenteComAnalise } from "@/domain/concorrentes";
import { dossie as esquemaDoDossie } from "@/domain/dossie";
import { fluxoComTextos, problemasDoFluxoGerado, textosDoFluxo, type ProblemaDoTexto, type TextosDoFluxo } from "@/domain/fluxo-gerado";
import type { ValoresDoTemplate } from "@/domain/template";
import { ErroDoModelo } from "@/server/agente/modelo";
import { concorrentesConfirmados } from "@/server/concorrentes/concorrentes";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { custoDaChamada } from "@/server/eval/custo";
import { registrarEvento } from "@/server/eventos";
import { confirmarPrevia, obterPrevia } from "@/server/previa/previa";
import type { EscritorDeFluxo } from "@/server/publicos/escritor";
import { escreverComRevisao, usoSomado } from "@/server/publicos/fluxo";
import { promptDoFluxo, VERSAO_DO_PROMPT_DO_FLUXO } from "@/server/publicos/prompts-do-fluxo";
import { obterPublico, type PublicoSalvo } from "@/server/publicos/publicos";
import { obterSdr } from "@/server/sdr/sdr";

/** A abordagem do primeiro acesso (§4.5): o convite e as três mensagens, e a permissão. */
export type Abordagem = {
  publicoId: string;
  textos: TextosDoFluxo;
  problemas: ProblemaDoTexto[];
  permitida: { em: Date; por: string | null } | null;
};

export type ResultadoDaAbordagem = { ok: true; abordagem: Abordagem } | { ok: false; erro: string };

/** Limite da nota de convite numa conta gratuita do LinkedIn. */
const LIMITE_DA_CONTA_GRATUITA = 200;

/** Os toques que a pessoa edita, na ordem do fluxo padrão (§4.1). */
export const TOQUES = ["T1", "T2", "T3", "T4"] as const;
export type Toque = (typeof TOQUES)[number];

/**
 * Validação de quem ainda não tem conta: Brasil (§3), sem palavras proibidas
 * de perfil. A nota do convite fica no limite da conta gratuita do LinkedIn
 * (200 caracteres): ainda não se sabe o tipo da conta, e a abordagem não pode
 * travar ao ativar. O envio valida de novo, com o perfil de verdade.
 */
export function contextoDoPrimeiroAcesso(linkDeAgenda: string | null): ContextoDoPerfil {
  return { praca: "domestico", palavrasProibidas: [], limiteNotaConvite: LIMITE_DA_CONTA_GRATUITA, linkDeAgenda };
}

type LinhaDaAbordagem = {
  publico_id: string;
  textos: unknown;
  problemas: ProblemaDoTexto[];
  permitida_em: Date | null;
  permitida_por: string | null;
};

/** A abordagem da organização, ou null. Roda como o operador ou como sistema. */
export async function obterAbordagem(db: Db, organizacaoId: string): Promise<Abordagem | null> {
  const [linha] = await db.query<LinhaDaAbordagem>(
    `select a.publico_id, a.textos, a.problemas, a.permitida_em, o.nome as permitida_por
       from public.abordagens a left join public.operadores o on o.id = a.permitida_por
      where a.organizacao_id = $1::uuid`,
    [organizacaoId],
  );
  const textos = textosDoFluxo.safeParse(linha?.textos);
  if (!linha || !textos.success) return null;
  return {
    publicoId: linha.publico_id,
    textos: textos.data,
    problemas: linha.problemas,
    permitida: linha.permitida_em ? { em: linha.permitida_em, por: linha.permitida_por } : null,
  };
}

type Entrada = {
  publico: PublicoSalvo;
  analise: ReturnType<typeof esquemaDoDossie.parse>;
  concorrentes: ConcorrenteComAnalise[] | null;
  contexto: ContextoDoPerfil;
  voz: string;
};

async function entradaDaAbordagem(db: Db, organizacaoId: string): Promise<Entrada | { erro: string }> {
  const [publico] = await db.query<{ id: string }>(
    "select id from public.publicos where organizacao_id = $1::uuid and status = 'ativo' order by escolhido_em desc nulls last limit 1",
    [organizacaoId],
  );
  const salvo = publico ? await obterPublico(db, publico.id) : null;
  if (!salvo) return { erro: "Escolha o perfil do lead antes da abordagem." };
  const [oferta] = await db.query<{ dossie_confirmado: unknown }>(
    "select dossie_confirmado from public.ofertas where organizacao_id = $1::uuid",
    [organizacaoId],
  );
  const analise = esquemaDoDossie.safeParse(oferta?.dossie_confirmado);
  if (!analise.success) return { erro: "Confirme a análise do site antes da abordagem." };
  const sdr = await obterSdr(db, organizacaoId);
  if (!sdr) return { erro: "Monte o SDR antes da abordagem." };
  return {
    publico: salvo,
    analise: analise.data,
    concorrentes: await concorrentesConfirmados(db, organizacaoId),
    contexto: contextoDoPrimeiroAcesso(sdr.sdr.link_agenda),
    // A abordagem fala na voz do SDR (§4.5): a voz e o jeito de abrir.
    voz: `${sdr.sdr.voz}\nComo abre a conversa: ${sdr.sdr.abertura}`,
  };
}

/** Avalia os textos no fluxo padrão do Brasil: forma, validador (§4.2) e números fora das provas do público. */
const avaliador =
  (contexto: ContextoDoPerfil, exemplo: ValoresDoTemplate, provas: readonly string[]) =>
  (textos: TextosDoFluxo): { textos: TextosDoFluxo; problemas: ProblemaDoTexto[] } => ({
    textos,
    problemas: problemasDoFluxoGerado(fluxoComTextos("domestico", textos), contexto, exemplo, provas),
  });

/**
 * Escreve a abordagem recomendada (§4.5): o fluxo padrão de 4 toques com os
 * textos para o público escolhido, na voz do SDR, citando só prova do
 * público. Texto barrado ganha uma reescrita; o que sobrar fica marcado e não
 * deixa seguir. Gerar de novo apaga a permissão: a pessoa permite o que vê.
 * Roda com a conexão do sistema, na organização de quem chama.
 */
export async function gerarAbordagem(
  deps: { db: Db; escritor: EscritorDeFluxo; agora: Date },
  p: { organizacaoId: string; nome: string; operadorId: string },
): Promise<ResultadoDaAbordagem> {
  const entrada = await entradaDaAbordagem(deps.db, p.organizacaoId);
  if ("erro" in entrada) return { ok: false, erro: entrada.erro };
  const { publico, analise, concorrentes, contexto, voz } = entrada;
  const exemplo = await lerConfiguracao(deps.db, "template_exemplo");
  const sistema = promptDoFluxo({
    publico,
    dossie: analise,
    concorrentes,
    estilo: "casa",
    perfil: { nome: p.nome, praca: "domestico", voz, palavrasProibidas: [], limiteNotaConvite: contexto.limiteNotaConvite },
  });

  let escrita;
  try {
    escrita = await escreverComRevisao(deps.escritor, sistema, avaliador(contexto, exemplo, publico.provas));
  } catch (erro) {
    if (!(erro instanceof ErroDoModelo)) console.error("Abordagem não escrita", erro);
    return { ok: false, erro: "Não consegui escrever a abordagem agora. Tente de novo." };
  }

  const { textos, problemas } = escrita.resultado;
  await deps.db.query(
    `insert into public.abordagens (organizacao_id, publico_id, textos, problemas, gerada_em, atualizado_em)
     values ($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5, $5)
     on conflict (organizacao_id) do update
       set publico_id = excluded.publico_id, textos = excluded.textos, problemas = excluded.problemas,
           gerada_em = excluded.gerada_em, editada_em = null, editada_por = null,
           permitida_em = null, permitida_por = null, atualizado_em = excluded.atualizado_em`,
    [p.organizacaoId, publico.id, JSON.stringify(textos), JSON.stringify(problemas), deps.agora],
  );
  const modelo = escrita.respostas.at(-1)!.modelo;
  await registrarEvento(deps.db, {
    tipo: "abordagem_gerada",
    entidade: "organizacao",
    entidadeId: p.organizacaoId,
    payload: {
      publico_id: publico.id,
      tentativas: escrita.respostas.length,
      problemas: problemas.length,
      modelo,
      custo_usd: Number((custoDaChamada(modelo, usoSomado(escrita.respostas)) ?? 0).toFixed(4)),
      versao_prompt: VERSAO_DO_PROMPT_DO_FLUXO,
    },
    ator: p.operadorId,
    em: deps.agora,
  });
  return { ok: true, abordagem: (await obterAbordagem(deps.db, p.organizacaoId))! };
}

/**
 * A pessoa corrige um texto (§4.5). O validador roda de novo na abordagem
 * inteira; editar apaga a permissão. Roda como o operador.
 */
export async function editarTextoDaAbordagem(
  db: Db,
  p: { organizacaoId: string; toque: Toque; texto: string; operadorId: string; agora: Date },
): Promise<ResultadoDaAbordagem> {
  const atual = await obterAbordagem(db, p.organizacaoId);
  if (!atual) return { ok: false, erro: "Ainda não há abordagem para editar." };
  const texto = p.texto.trim();
  if (texto.length === 0) return { ok: false, erro: "O texto não pode ficar vazio." };
  const textos: TextosDoFluxo =
    p.toque === "T1"
      ? { ...atual.textos, convite: texto }
      : { ...atual.textos, mensagens: atual.textos.mensagens.map((m, i) => (TOQUES[i + 1] === p.toque ? texto : m)) };

  const [publico] = await db.query<{ provas: string[] }>("select provas from public.publicos where id = $1::uuid", [atual.publicoId]);
  const sdr = await obterSdr(db, p.organizacaoId);
  const exemplo = await lerConfiguracao(db, "template_exemplo");
  const { problemas } = avaliador(contextoDoPrimeiroAcesso(sdr?.sdr.link_agenda ?? null), exemplo, publico?.provas ?? [])(textos);
  await db.query(
    `update public.abordagens
        set textos = $2::jsonb, problemas = $3::jsonb, editada_em = $4, editada_por = $5::uuid,
            permitida_em = null, permitida_por = null, atualizado_em = $4
      where organizacao_id = $1::uuid`,
    [p.organizacaoId, JSON.stringify(textos), JSON.stringify(problemas), p.agora, p.operadorId],
  );
  return { ok: true, abordagem: (await obterAbordagem(db, p.organizacaoId))! };
}

/**
 * "Pode entrar em contato" (§4.5): grava quem permitiu e quando. Sem isso,
 * nada sai. Texto com problema não deixa permitir. A prévia fecha junto
 * (SDR-56): quem abordar e o que dizer estão na mesma tela, e a permissão vale
 * para as pessoas marcadas. Roda como o operador.
 */
export async function permitirContato(
  db: Db,
  p: { organizacaoId: string; operadorId: string; agora: Date },
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const atual = await obterAbordagem(db, p.organizacaoId);
  if (!atual) return { ok: false, erro: "Ainda não há abordagem para permitir." };
  if (atual.problemas.length > 0) {
    const [primeiro] = atual.problemas;
    return { ok: false, erro: `Corrija antes de seguir: ${primeiro!.toque}, ${primeiro!.mensagem}` };
  }
  if (await obterPrevia(db, p.organizacaoId)) {
    const previa = await confirmarPrevia(db, p);
    if (!previa.ok) return previa;
  }
  await db.query(
    "update public.abordagens set permitida_em = $2, permitida_por = $3::uuid, atualizado_em = $2 where organizacao_id = $1::uuid",
    [p.organizacaoId, p.agora, p.operadorId],
  );
  await registrarEvento(db, {
    tipo: "contato_permitido",
    entidade: "organizacao",
    entidadeId: p.organizacaoId,
    payload: { publico_id: atual.publicoId },
    ator: p.operadorId,
    em: p.agora,
  });
  return { ok: true };
}
