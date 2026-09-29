import type { LinhaInvalida, PessoaImportada } from "@/domain/importacao";
import { chaveDaEmpresa, primeiroNome } from "@/domain/texto";
import { lerConfiguracao } from "@/server/configuracoes";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { ClienteUnipile } from "@/server/unipile/cliente";
import { alertaDeCooldown, motivoDeBloqueio, temOptout, type CampanhaAlvo } from "@/server/triagem/regras";

export type FonteDeImportacao = "csv" | "apify" | "unipile_busca";

export type ResumoDaImportacao = {
  total: number;
  novos: number;
  bloqueados: number;
  comAlerta: number;
  duplicados: number;
  optouts: number;
  semProviderId: number;
  invalidas: LinhaInvalida[];
};

type Resultado = "novo" | "bloqueado" | "duplicado" | "optout";

type Campanha = CampanhaAlvo & { accountId: string | null; perfilNome: string };

/** Busca na Unipile o provider_id de quem veio só com URL. Cada busca é uma visita de perfil: tem teto. */
async function resolverProviderIds(
  pessoas: PessoaImportada[],
  unipile: ClienteUnipile | undefined,
  accountId: string | null,
  limite: number,
): Promise<{ resolvidas: PessoaImportada[]; semProviderId: number }> {
  const resolvidas: PessoaImportada[] = [];
  let semProviderId = 0;
  let tentativas = 0;
  for (const pessoa of pessoas) {
    if (pessoa.providerId) {
      resolvidas.push(pessoa);
      continue;
    }
    if (!unipile || !accountId || !pessoa.publicIdentifier || tentativas >= limite) {
      semProviderId += 1;
      continue;
    }
    tentativas += 1;
    try {
      const perfil = await unipile.obterPerfil(accountId, pessoa.publicIdentifier);
      resolvidas.push({ ...pessoa, providerId: perfil.providerId });
    } catch {
      semProviderId += 1;
    }
  }
  return { resolvidas, semProviderId };
}

async function importarUma(
  db: Db,
  pessoa: PessoaImportada & { providerId: string },
  contexto: { campanha: Campanha; importacaoId: string; fonte: FonteDeImportacao; agora: Date; cooldownDias: number },
): Promise<{ resultado: Resultado; alerta: boolean }> {
  const { campanha, agora } = contexto;
  return db.transacao(async (tx) => {
    if (await temOptout(tx, pessoa.providerId)) return { resultado: "optout" as const, alerta: false };

    const [existente] = await tx.query<{ id: string; dono_perfil_id: string }>(
      "select id, dono_perfil_id from public.pessoas where provider_id = $1 for update",
      [pessoa.providerId],
    );

    let pessoaId: string;
    let bloqueio: string | null = null;
    if (existente) {
      pessoaId = existente.id;
      const [jaNaCampanha] = await tx.query(
        "select 1 from public.leads where pessoa_id = $1::uuid and campanha_id = $2::uuid",
        [pessoaId, campanha.id],
      );
      if (jaNaCampanha) return { resultado: "duplicado" as const, alerta: false };
      bloqueio = await motivoDeBloqueio(tx, {
        pessoaId,
        donoPerfilId: existente.dono_perfil_id,
        campanha,
        hoje: agora.toISOString().slice(0, 10),
      });
      // Completa o que faltava sem apagar a coleta original.
      await tx.query(
        `update public.pessoas set
           cargo = coalesce(cargo, $2), empresa = coalesce(empresa, $3),
           empresa_chave = coalesce(empresa_chave, $4), localizacao = coalesce(localizacao, $5),
           public_identifier = coalesce(public_identifier, $6)
         where id = $1::uuid`,
        [pessoaId, pessoa.cargo, pessoa.empresa, pessoa.empresaChave, pessoa.localizacao, pessoa.publicIdentifier],
      );
    } else {
      const [nova] = await tx.query<{ id: string }>(
        `insert into public.pessoas (
           provider_id, public_identifier, url_publica, nome, primeiro_nome, cargo, empresa,
           empresa_dominio, empresa_chave, localizacao, fonte, coletado_em, dono_perfil_id, praca
         )
         select $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, p.id, p.praca
           from public.perfis p where p.id = $13::uuid
         returning id`,
        [
          pessoa.providerId,
          pessoa.publicIdentifier,
          pessoa.urlPublica,
          pessoa.nome,
          pessoa.primeiroNome ?? primeiroNome(pessoa.nome),
          pessoa.cargo,
          pessoa.empresa,
          pessoa.empresaDominio,
          pessoa.empresaChave ?? chaveDaEmpresa(pessoa.empresa, pessoa.empresaDominio),
          pessoa.localizacao,
          contexto.fonte,
          pessoa.coletadoEm ?? agora.toISOString(),
          campanha.perfilId,
        ],
      );
      pessoaId = nova!.id;
    }

    const alerta = await alertaDeCooldown(tx, {
      empresaChave: pessoa.empresaChave,
      perfilId: campanha.perfilId,
      agora,
      dias: contexto.cooldownDias,
    });

    await tx.query(
      `insert into public.leads (
         pessoa_id, campanha_id, perfil_id, importacao_id, estado, angulo, bloqueio_motivo, alerta_triagem
       ) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'triagem', $5, $6, $7)`,
      [pessoaId, campanha.id, campanha.perfilId, contexto.importacaoId, campanha.angulo, bloqueio, alerta],
    );
    return { resultado: bloqueio ? ("bloqueado" as const) : ("novo" as const), alerta: Boolean(alerta) };
  });
}

/**
 * Importa uma lista para a triagem de uma campanha (§9 SDR-04).
 * Deduplica por provider_id, barra opt-out (nem entra na base), aplica a regra
 * de um dono e marca o cooldown de empresa. Cada pessoa vai numa transação
 * própria: uma linha ruim não derruba o arquivo.
 *
 * Roda com a conexão do sistema porque as regras cruzam perfis. Quem chama
 * autoriza o operador na campanha antes.
 */
export async function importarPessoas(
  deps: { db: Db; unipile?: ClienteUnipile },
  p: {
    campanhaId: string;
    fonte: FonteDeImportacao;
    pessoas: PessoaImportada[];
    invalidas?: LinhaInvalida[];
    arquivoNome?: string;
    operadorId?: string;
    agora: Date;
    maxResolucoes?: number;
  },
): Promise<{ importacaoId: string; resumo: ResumoDaImportacao }> {
  const { db } = deps;
  const [campanha] = await db.query<Campanha>(
    `select c.id, c.perfil_id as "perfilId", c.angulo, p.unipile_account_id as "accountId", p.nome as "perfilNome"
       from public.campanhas c join public.perfis p on p.id = c.perfil_id
      where c.id = $1::uuid`,
    [p.campanhaId],
  );
  if (!campanha) throw new Error("Campanha não encontrada");

  const { resolvidas, semProviderId } = await resolverProviderIds(
    p.pessoas,
    deps.unipile,
    campanha.accountId,
    p.maxResolucoes ?? 100,
  );
  const unicas = [...new Map(resolvidas.map((pessoa) => [pessoa.providerId!, pessoa])).values()];
  const duplicadasNoArquivo = resolvidas.length - unicas.length;
  const cooldownDias = await lerConfiguracao(db, "cooldown_empresa_dias");

  const [importacao] = await db.query<{ id: string }>(
    `insert into public.importacoes (campanha_id, perfil_id, fonte, arquivo_nome, criado_por)
     values ($1::uuid, $2::uuid, $3, $4, $5::uuid) returning id`,
    [campanha.id, campanha.perfilId, p.fonte, p.arquivoNome ?? null, p.operadorId ?? null],
  );
  const importacaoId = importacao!.id;

  const resumo: ResumoDaImportacao = {
    total: p.pessoas.length + (p.invalidas?.length ?? 0),
    novos: 0,
    bloqueados: 0,
    comAlerta: 0,
    duplicados: duplicadasNoArquivo,
    optouts: 0,
    semProviderId,
    invalidas: p.invalidas ?? [],
  };

  for (const pessoa of unicas) {
    const { resultado, alerta } = await importarUma(db, pessoa as PessoaImportada & { providerId: string }, {
      campanha,
      importacaoId,
      fonte: p.fonte,
      agora: p.agora,
      cooldownDias,
    });
    if (resultado === "novo") resumo.novos += 1;
    else if (resultado === "bloqueado") resumo.bloqueados += 1;
    else if (resultado === "duplicado") resumo.duplicados += 1;
    else resumo.optouts += 1;
    if (alerta) resumo.comAlerta += 1;
  }

  await db.query("update public.importacoes set resumo = $2::jsonb where id = $1::uuid", [
    importacaoId,
    JSON.stringify(resumo),
  ]);
  await registrarEvento(db, {
    tipo: "importacao",
    entidade: "importacao",
    entidadeId: importacaoId,
    perfilId: campanha.perfilId,
    payload: { ...resumo, invalidas: resumo.invalidas.length, campanha_id: campanha.id, fonte: p.fonte },
    ator: p.operadorId ?? "sistema",
    em: p.agora,
  });
  return { importacaoId, resumo };
}
