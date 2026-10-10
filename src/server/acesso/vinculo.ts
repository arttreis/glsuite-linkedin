import { randomUUID } from "node:crypto";
import { buscaInicial } from "@/domain/busca";
import { fluxoComTextos } from "@/domain/fluxo-gerado";
import { RAMPA_PADRAO, TETO_SEMANAL_PADRAO } from "@/domain/rampa";
import { obterAbordagem } from "@/server/abordagem/recomendada";
import { ErroDeStatus, mudarStatusDaCampanha } from "@/server/campanhas/campanhas";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import { salvarFluxo } from "@/server/fluxo/fluxos";
import { importarPessoas } from "@/server/importacao/importar";
import { despausarPerfil, ErroDeAtivacao } from "@/server/perfis/pausa";
import { obterPrevia } from "@/server/previa/previa";
import { obterPublico } from "@/server/publicos/publicos";
import { aprovarLeads } from "@/server/triagem/triagem";
import type { ClienteUnipile } from "@/server/unipile/cliente";

/** Quem leva a abordagem para a conta há mais que isso parou no meio: outro pode recomeçar. */
const VINCULO_PARADO = "2 minutes";

/**
 * O perfil do primeiro acesso (§4.6): a conta do LinkedIn de quem está
 * vinculando, como perfil da organização, operado por essa pessoa. Nasce
 * pausado, com a rampa padrão (D3), Brasil, sem palavras proibidas de perfil e
 * com o SDR respondendo sozinho (§4.7). Clicar duas vezes reaproveita o mesmo
 * perfil. Roda com a conexão do sistema, na organização de quem chama.
 */
export async function perfilDoPrimeiroAcesso(
  db: Db,
  p: { organizacaoId: string; operadorId: string; nome: string; idioma: "pt" | "en" | "es"; agora: Date },
): Promise<{ perfilId: string; conectado: boolean }> {
  return db.transacao(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`perfil-do-primeiro-acesso:${p.organizacaoId}`]);
    const [existente] = await tx.query<{ id: string; conectado: boolean }>(
      `select id, unipile_account_id is not null as conectado from public.perfis
        where organizacao_id = $1::uuid and operador_id = $2::uuid and not casa
        order by criado_em limit 1`,
      [p.organizacaoId, p.operadorId],
    );
    if (existente) return { perfilId: existente.id, conectado: existente.conectado };

    const [perfil] = await tx.query<{ id: string }>(
      `insert into public.perfis
         (slug, nome, operador_id, praca, fuso, idioma, modo_resposta, rampa, teto_convites_semana,
          palavras_proibidas, status, motivo_pausa, organizacao_id, criado_em)
       values ($1, $2, $3::uuid, 'domestico', 'America/Sao_Paulo', $4, 'automatico', $5::jsonb, $6,
               '{}', 'pausado', 'Aguardando o LinkedIn do primeiro acesso', $7::uuid, $8)
       returning id`,
      [
        `p-${randomUUID().slice(0, 8)}`,
        p.nome,
        p.operadorId,
        p.idioma,
        JSON.stringify(RAMPA_PADRAO),
        TETO_SEMANAL_PADRAO,
        p.organizacaoId,
        p.agora,
      ],
    );
    await tx.query("insert into public.operador_perfis (operador_id, perfil_id) values ($1::uuid, $2::uuid)", [
      p.operadorId,
      perfil!.id,
    ]);
    await registrarEvento(tx, {
      tipo: "perfil_criado",
      entidade: "perfil",
      entidadeId: perfil!.id,
      perfilId: perfil!.id,
      payload: { origem: "primeiro_acesso" },
      ator: p.operadorId,
      em: p.agora,
    });
    return { perfilId: perfil!.id, conectado: false };
  });
}

export type ResultadoDoVinculo =
  | { ok: true; campanhaId: string; leads: number }
  | { ok: false; erro: string; esperar?: boolean };

/**
 * Leva o primeiro acesso para a conta vinculada (§4.6). Com a permissão dada:
 * a campanha nasce do público na conta da pessoa, com a abordagem permitida
 * como fluxo e a permissão dela; as pessoas marcadas na prévia entram pelas
 * regras de importação (um alvo um dono, cooldown, URL, fonte e data) e vão
 * para a fila; o perfil e a campanha ativam; o primeiro acesso termina.
 *
 * Roda pelo aviso da Unipile e pela volta da pessoa à tela, o que vier
 * primeiro: é idempotente, e só um leva por vez. Roda com a conexão do
 * sistema.
 */
export async function concluirPrimeiroAcesso(
  deps: { db: Db; unipile?: ClienteUnipile; agora: Date },
  p: { organizacaoId: string },
): Promise<ResultadoDoVinculo> {
  const { db, agora } = deps;
  const [organizacao] = await db.query<{ concluido: boolean }>(
    "select primeiro_acesso_em is not null as concluido from public.organizacoes where id = $1::uuid",
    [p.organizacaoId],
  );
  const abordagem = await obterAbordagem(db, p.organizacaoId);
  const [vinculo] = await db.query<{ campanha_id: string | null; permitida_por: string | null; permitida_em: Date | null }>(
    "select campanha_id, permitida_por, permitida_em from public.abordagens where organizacao_id = $1::uuid",
    [p.organizacaoId],
  );
  if (organizacao?.concluido && vinculo?.campanha_id) return { ok: true, campanhaId: vinculo.campanha_id, leads: 0 };
  if (!abordagem?.permitida || !vinculo?.permitida_em || !vinculo.permitida_por) {
    return { ok: false, erro: "Dê a permissão na abordagem antes de vincular." };
  }
  const operadorId = vinculo.permitida_por;

  const [perfil] = await db.query<{ id: string; conectado: boolean; status: string }>(
    `select pf.id, pf.unipile_account_id is not null as conectado, pf.status from public.perfis pf
      where pf.organizacao_id = $1::uuid and pf.operador_id = $2::uuid and not pf.casa
      order by pf.criado_em limit 1`,
    [p.organizacaoId, operadorId],
  );
  if (!perfil?.conectado) return { ok: false, erro: "O LinkedIn ainda não terminou de conectar.", esperar: true };

  // Só um leva a abordagem para a conta por vez.
  const [vez] = await db.query(
    `update public.abordagens set vinculando_em = $2
      where organizacao_id = $1::uuid and (vinculando_em is null or vinculando_em < $2::timestamptz - $3::interval)
      returning id`,
    [p.organizacaoId, agora, VINCULO_PARADO],
  );
  if (!vez) return { ok: false, erro: "Já estou preparando a sua campanha.", esperar: true };

  try {
    const publico = await obterPublico(db, abordagem.publicoId);
    if (!publico) return { ok: false, erro: "O perfil do lead não existe mais. Volte ao passo 4." };

    // 1. A campanha: o público na conta da pessoa, com a abordagem permitida.
    let campanhaId = vinculo.campanha_id;
    if (!campanhaId) {
      const [criada] = await db.query<{ id: string }>(
        `insert into public.campanhas
           (nome, angulo, nicho, modo_copy, max_leads, perfil_id, pos_t4, criado_por, sequencia, publico_id,
            permitida_em, permitida_por)
         values ($1, $2, $3, 'template', null, $4::uuid, 'conexao', $5::uuid, '[]'::jsonb, $6::uuid, $7, $5::uuid)
         returning id`,
        [publico.nome, publico.angulo, publico.nome, perfil.id, operadorId, publico.id, vinculo.permitida_em],
      );
      campanhaId = criada!.id;
      await salvarFluxo(db, { campanhaId, fluxo: fluxoComTextos("domestico", abordagem.textos), operadorId });
      await db.query("update public.abordagens set campanha_id = $2::uuid where organizacao_id = $1::uuid", [p.organizacaoId, campanhaId]);
      await registrarEvento(db, {
        tipo: "campanha_criada",
        entidade: "campanha",
        entidadeId: campanhaId,
        perfilId: perfil.id,
        payload: { nome: publico.nome, publico_id: publico.id, origem: "primeiro_acesso" },
        ator: operadorId,
        em: agora,
      });
    }

    // 2. As pessoas marcadas na prévia viram leads, pelas regras de importação.
    const previa = await obterPrevia(db, p.organizacaoId);
    const marcadas = previa?.status === "pronta" ? previa.pessoas.filter((pessoa) => pessoa.marcada) : [];
    if (marcadas.length > 0) {
      await importarPessoas(
        { db, unipile: deps.unipile },
        {
          campanhaId,
          fonte: "unipile_busca",
          arquivoNome: "prévia do primeiro acesso",
          pessoas: marcadas.map((pessoa) => ({
            providerId: pessoa.providerId,
            publicIdentifier: pessoa.publicIdentifier,
            urlPublica: pessoa.urlPublica,
            nome: pessoa.nome,
            primeiroNome: pessoa.primeiroNome,
            cargo: pessoa.cargo,
            empresa: pessoa.empresa,
            empresaDominio: null,
            empresaChave: null,
            localizacao: pessoa.localizacao,
            coletadoEm: null,
          })),
          operadorId,
          agora,
        },
      );
      for (const pessoa of marcadas) {
        if (pessoa.nota === null) continue;
        await db.query(
          `update public.leads l set nota = $3, nota_motivo = $4, nota_em = $5
             from public.pessoas pe
            where pe.id = l.pessoa_id and l.campanha_id = $1::uuid and pe.provider_id = $2 and l.nota is null`,
          [campanhaId, pessoa.providerId, pessoa.nota, pessoa.motivo, agora],
        );
      }
    } else {
      // Prévia sem nomes: a busca fica pronta na campanha, pela conta da pessoa (§4.4).
      await db.query("update public.campanhas set busca = $2::jsonb where id = $1::uuid and busca is null", [
        campanhaId,
        JSON.stringify({ ...buscaInicial(publico), regioes: previa?.regiao ? [previa.regiao] : [] }),
      ]);
    }

    // 3. O perfil e a campanha ativam. A primeira ação espera a conta estabilizar (despachante).
    if (perfil.status !== "ativo") await despausarPerfil(db, { perfilId: perfil.id, operadorId, agora });
    const [campanha] = await db.query<{ status: string }>("select status from public.campanhas where id = $1::uuid", [campanhaId]);
    if (campanha?.status !== "ativa") await mudarStatusDaCampanha(db, { campanhaId, status: "ativa", operadorId, agora });

    const emTriagem = await db.query<{ id: string }>(
      "select id from public.leads where campanha_id = $1::uuid and estado = 'triagem' and bloqueio_motivo is null",
      [campanhaId],
    );
    const aprovados = emTriagem.length > 0 ? await aprovarLeads(db, { leadIds: emTriagem.map((l) => l.id), operadorId, agora, unipile: deps.unipile }) : null;

    await db.query("update public.organizacoes set primeiro_acesso_em = $2 where id = $1::uuid and primeiro_acesso_em is null", [
      p.organizacaoId,
      agora,
    ]);
    await registrarEvento(db, {
      tipo: "primeiro_acesso_concluido",
      entidade: "organizacao",
      entidadeId: p.organizacaoId,
      perfilId: perfil.id,
      payload: { campanha_id: campanhaId, leads: aprovados?.aprovados.length ?? 0 },
      ator: operadorId,
      em: agora,
    });
    return { ok: true, campanhaId, leads: aprovados?.aprovados.length ?? 0 };
  } catch (erro) {
    if (erro instanceof ErroDeAtivacao || erro instanceof ErroDeStatus) return { ok: false, erro: erro.message };
    throw erro;
  } finally {
    await db.query("update public.abordagens set vinculando_em = null where organizacao_id = $1::uuid", [p.organizacaoId]);
  }
}

/** A organização do perfil, se ela ainda está no primeiro acesso. Para o aviso da Unipile. */
export async function organizacaoNoPrimeiroAcesso(db: Db, perfilId: string): Promise<string | null> {
  const [linha] = await db.query<{ organizacao_id: string }>(
    `select pf.organizacao_id from public.perfis pf join public.organizacoes o on o.id = pf.organizacao_id
      where pf.id = $1::uuid and o.primeiro_acesso_em is null`,
    [perfilId],
  );
  return linha?.organizacao_id ?? null;
}
