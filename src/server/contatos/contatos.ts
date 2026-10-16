import { z } from "zod";
import { chaveDaTag, MAX_NOME_DO_CONTATO, type CorDaTag, type OrigemDoContato } from "@/domain/contatos";
import type { EstadoDoLead } from "@/domain/estados";
import { sqlDoFiltro, type FiltroDeContatos } from "@/domain/filtro-de-contatos";
import { registrarOptout } from "@/server/conversas/optout";
import type { Db } from "@/server/db/tipos";
import { registrarEvento } from "@/server/eventos";
import type { Resultado } from "@/server/publicos/publicos";
import { garantirTags } from "./tags";

export type TagCurta = { id: string; nome: string; cor: CorDaTag };

/** O WhatsApp do contato: pode receber disparo, falta a autorização, ou saiu (§4.15). */
export type SituacaoNoWhatsapp = "pode" | "sem_autorizacao" | "saiu";

export type ContatoDaLista = {
  id: string;
  nome: string;
  empresa: string | null;
  cargo: string | null;
  origem: OrigemDoContato;
  telefone: string | null;
  email: string | null;
  whatsapp: SituacaoNoWhatsapp | null;
  /** No Telegram: pode receber, ou saiu (bloqueou o bot ou mandou /sair). */
  telegram: "pode" | "saiu" | null;
  linkedin: boolean;
  naoContatar: boolean;
  criadoEm: Date;
  tags: TagCurta[];
};

export const CONTATOS_POR_PAGINA = 50;

const COLUNAS_DA_LISTA = `
  c.id, c.nome, c.empresa, c.cargo, c.origem, c.telefone, c.email, c.criado_em as "criadoEm",
  c.nao_contatar_em is not null as "naoContatar",
  c.pessoa_id is not null as linkedin,
  case when c.telefone is null then null
       when c.whatsapp_saiu_em is not null then 'saiu'
       when c.whatsapp_autorizado_em is null then 'sem_autorizacao'
       else 'pode' end as whatsapp,
  case when c.telegram_id is null then null when c.telegram_saiu_em is not null then 'saiu' else 'pode' end as telegram,
  coalesce((select json_agg(json_build_object('id', t.id, 'nome', t.nome, 'cor', t.cor) order by t.chave)
              from public.contato_tags ct join public.tags t on t.id = ct.tag_id
             where ct.contato_id = c.id), '[]'::json) as tags`;

/** O `where` da lista: a organização e o filtro, com os parâmetros depois de `$1` (a organização). */
function ondeDoFiltro(filtro: FiltroDeContatos): { where: string; parametros: unknown[] } {
  const { condicoes, parametros } = sqlDoFiltro(filtro, 2);
  return { where: ["c.organizacao_id = $1::uuid", ...condicoes].join(" and "), parametros };
}

/**
 * Os contatos do filtro, os mais novos primeiro, de 50 em 50, e quantos são ao
 * todo. Roda como o operador: o RLS esconde os leads do LinkedIn das contas
 * que ele não opera.
 */
export async function listarContatos(
  db: Db,
  p: { organizacaoId: string; filtro: FiltroDeContatos; pagina?: number },
): Promise<{ contatos: ContatoDaLista[]; total: number }> {
  const { where, parametros } = ondeDoFiltro(p.filtro);
  const pagina = Math.max(1, Math.floor(p.pagina ?? 1));
  const deslocamento = (pagina - 1) * CONTATOS_POR_PAGINA;
  const contatos = await db.query<ContatoDaLista>(
    `select ${COLUNAS_DA_LISTA} from public.contatos c where ${where}
      order by c.criado_em desc, c.id
      limit ${CONTATOS_POR_PAGINA} offset ${deslocamento}`,
    [p.organizacaoId, ...parametros],
  );
  return { contatos, total: await contarContatos(db, p) };
}

export async function contarContatos(db: Db, p: { organizacaoId: string; filtro: FiltroDeContatos }): Promise<number> {
  const { where, parametros } = ondeDoFiltro(p.filtro);
  const [linha] = await db.query<{ n: number }>(`select count(*)::int as n from public.contatos c where ${where}`, [p.organizacaoId, ...parametros]);
  return linha!.n;
}

export type ContatoCompleto = ContatoDaLista & {
  primeiroNome: string | null;
  naoContatarEm: Date | null;
  naoContatarMotivo: string | null;
  whatsappAutorizadoEm: Date | null;
  whatsappAutorizacao: { por?: string; porNome?: string; arquivo?: string | null } | null;
  whatsappSaiuEm: Date | null;
  whatsappMotivo: string | null;
  telegramUsuario: string | null;
  telegramSaiuEm: Date | null;
  telegramMotivo: string | null;
  importacao: { arquivo: string | null; em: Date } | null;
  lead: { id: string; campanha: string; estado: EstadoDoLead; conta: string } | null;
};

/** O contato com os canais, as tags e o lead do LinkedIn mais recente. Roda como o operador; de fora, null. */
export async function obterContato(db: Db, id: string): Promise<ContatoCompleto | null> {
  const [contato] = await db.query<ContatoCompleto>(
    `select ${COLUNAS_DA_LISTA},
            c.primeiro_nome as "primeiroNome", c.nao_contatar_em as "naoContatarEm", c.nao_contatar_motivo as "naoContatarMotivo",
            c.whatsapp_autorizado_em as "whatsappAutorizadoEm", c.whatsapp_autorizacao as "whatsappAutorizacao",
            c.whatsapp_saiu_em as "whatsappSaiuEm", c.whatsapp_motivo as "whatsappMotivo",
            c.telegram_usuario as "telegramUsuario", c.telegram_saiu_em as "telegramSaiuEm", c.telegram_motivo as "telegramMotivo",
            (select json_build_object('arquivo', i.arquivo_nome, 'em', i.criado_em)
               from public.importacoes_de_contatos i where i.id = c.importacao_id) as importacao,
            (select json_build_object('id', l.id, 'campanha', ca.nome, 'estado', l.estado, 'conta', pf.nome)
               from public.leads l
               join public.campanhas ca on ca.id = l.campanha_id
               join public.perfis pf on pf.id = l.perfil_id
              where l.pessoa_id = c.pessoa_id
              order by l.atualizado_em desc limit 1) as lead
       from public.contatos c where c.id = $1::uuid`,
    [id],
  );
  if (!contato) return null;
  return { ...contato, importacao: contato.importacao ? { ...contato.importacao, em: new Date(contato.importacao.em) } : null };
}

// --- Importação ------------------------------------------------------------------

export const esquemaDoContatoImportado = z.object({
  nome: z.string().trim().min(1).max(MAX_NOME_DO_CONTATO),
  primeiroNome: z.string().trim().max(200).nullable(),
  telefone: z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable(),
  email: z.email().max(200).nullable(),
  empresa: z.string().trim().max(200).nullable(),
  cargo: z.string().trim().max(200).nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});
export type ContatoParaImportar = z.infer<typeof esquemaDoContatoImportado>;

export type ResumoDaImportacao = { criados: number; atualizados: number; tagsCriadas: number };

/**
 * Um por telefone e, sem telefone, um por e-mail, somando as tags: o mesmo
 * comando não pode tocar duas vezes no mesmo contato. O navegador já manda
 * sem repetidos; o servidor não conta com isso.
 */
function semRepetidos(contatos: readonly ContatoParaImportar[]): ContatoParaImportar[] {
  const porChave = new Map<string, ContatoParaImportar>();
  for (const contato of contatos) {
    const chave = contato.telefone ?? `email:${contato.email!.toLowerCase()}`;
    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, { ...contato, email: contato.email?.toLowerCase() ?? null, tags: [...contato.tags] });
      continue;
    }
    for (const tag of contato.tags) {
      if (!existente.tags.some((t) => chaveDaTag(t) === chaveDaTag(tag))) existente.tags.push(tag);
    }
  }
  return [...porChave.values()];
}

/**
 * Importa uma parte da planilha (§4.15), já lida e normalizada no navegador.
 * A primeira parte cria a importação, que guarda se quem importou marcou a
 * autorização do WhatsApp; as outras partes seguem a mesma marca, sem o
 * navegador poder trocar no meio.
 *
 * Telefone igual ou, sem telefone, e-mail igual ao de um contato da
 * organização completa só o que estava vazio e soma as tags. A autorização
 * entra só para quem tem telefone, ainda não tinha e não saiu do WhatsApp.
 *
 * Roda pela conexão do sistema, sempre presa à organização do operador: o
 * contato de mesmo telefone pode ser um lead do LinkedIn de uma conta que ele
 * não opera, e mesmo assim não pode duplicar.
 */
export async function importarContatos(
  db: Db,
  p: {
    organizacaoId: string;
    operadorId: string;
    importacaoId: string | null;
    arquivoNome: string | null;
    autorizacaoWhatsapp: boolean;
    tagsParaTodos: string[];
    contatos: ContatoParaImportar[];
    agora: Date;
  },
): Promise<Resultado<{ importacaoId: string } & ResumoDaImportacao>> {
  const contatos = semRepetidos(p.contatos.filter((c) => c.telefone || c.email));
  return db.transacao(async (tx) => {
    let importacao: { id: string; autorizacao_whatsapp: boolean; arquivo_nome: string | null } | undefined;
    if (p.importacaoId) {
      [importacao] = await tx.query(
        "select id, autorizacao_whatsapp, arquivo_nome from public.importacoes_de_contatos where id = $1::uuid and organizacao_id = $2::uuid for update",
        [p.importacaoId, p.organizacaoId],
      );
      if (!importacao) return { ok: false, erro: "Importação não encontrada. Comece de novo." };
    } else {
      [importacao] = await tx.query(
        `insert into public.importacoes_de_contatos (organizacao_id, arquivo_nome, autorizacao_whatsapp, criado_por, criado_em)
         values ($1::uuid, $2, $3, $4::uuid, $5) returning id, autorizacao_whatsapp, arquivo_nome`,
        [p.organizacaoId, p.arquivoNome?.slice(0, 200) ?? null, p.autorizacaoWhatsapp, p.operadorId, p.agora],
      );
    }
    const importacaoId = importacao!.id;

    const nomesDeTags = [...p.tagsParaTodos, ...contatos.flatMap((c) => c.tags)];
    const tags = await garantirTags(tx, { organizacaoId: p.organizacaoId, nomes: nomesDeTags, operadorId: p.operadorId, agora: p.agora });
    if (!tags.ok) return tags;

    const autorizacao = importacao!.autorizacao_whatsapp
      ? JSON.stringify({ por: p.operadorId, importacao: importacaoId, arquivo: importacao!.arquivo_nome, em: p.agora.toISOString() })
      : null;

    // Contatos de e-mail sem telefone que já existem, para completar em vez de duplicar.
    const emails = contatos.filter((c) => !c.telefone && c.email).map((c) => c.email!.toLowerCase());
    const porEmail = new Map(
      (
        await tx.query<{ id: string; email: string }>(
          `select distinct on (lower(email)) id, lower(email) as email from public.contatos
            where organizacao_id = $1::uuid and lower(email) = any($2::text[])
            order by lower(email), criado_em`,
          [p.organizacaoId, emails],
        )
      ).map((linha) => [linha.email, linha.id]),
    );

    let criados = 0;
    let atualizados = 0;
    const tagsDoContato: { contatoId: string; tags: string[] }[] = [];

    const comTelefone = contatos.filter((c) => c.telefone);
    if (comTelefone.length > 0) {
      const linhas = await tx.query<{ id: string; telefone: string; criado: boolean }>(
        `insert into public.contatos (organizacao_id, nome, primeiro_nome, empresa, cargo, email, telefone, origem, importacao_id,
                                      whatsapp_autorizado_em, whatsapp_autorizacao, criado_em)
         select $1::uuid, r.nome, r."primeiroNome", r.empresa, r.cargo, r.email, r.telefone, 'importacao', $3::uuid,
                case when $4::jsonb is null then null else $5::timestamptz end, $4::jsonb, $5
           from jsonb_to_recordset($2::jsonb) as r (nome text, "primeiroNome" text, empresa text, cargo text, email text, telefone text)
         on conflict (organizacao_id, telefone) where telefone is not null do update
           set primeiro_nome = coalesce(public.contatos.primeiro_nome, excluded.primeiro_nome),
               empresa = coalesce(public.contatos.empresa, excluded.empresa),
               cargo = coalesce(public.contatos.cargo, excluded.cargo),
               email = coalesce(public.contatos.email, excluded.email),
               whatsapp_autorizacao = case when public.contatos.whatsapp_autorizado_em is null and public.contatos.whatsapp_saiu_em is null
                                           then excluded.whatsapp_autorizacao else public.contatos.whatsapp_autorizacao end,
               whatsapp_autorizado_em = case when public.contatos.whatsapp_autorizado_em is null and public.contatos.whatsapp_saiu_em is null
                                             then excluded.whatsapp_autorizado_em else public.contatos.whatsapp_autorizado_em end
         returning id, telefone, (xmax = 0) as criado`,
        [p.organizacaoId, JSON.stringify(comTelefone), importacaoId, autorizacao, p.agora],
      );
      const idPorTelefone = new Map(linhas.map((linha) => [linha.telefone, linha.id]));
      const novosPorTelefone = linhas.filter((linha) => linha.criado).length;
      criados += novosPorTelefone;
      atualizados += linhas.length - novosPorTelefone;
      for (const contato of comTelefone) tagsDoContato.push({ contatoId: idPorTelefone.get(contato.telefone!)!, tags: contato.tags });
    }

    const soEmail = contatos.filter((c) => !c.telefone && c.email);
    const existentes = soEmail.filter((c) => porEmail.has(c.email!.toLowerCase()));
    if (existentes.length > 0) {
      await tx.query(
        `update public.contatos c
            set primeiro_nome = coalesce(c.primeiro_nome, r."primeiroNome"), empresa = coalesce(c.empresa, r.empresa), cargo = coalesce(c.cargo, r.cargo)
           from jsonb_to_recordset($2::jsonb) as r (id uuid, "primeiroNome" text, empresa text, cargo text)
          where c.id = r.id and c.organizacao_id = $1::uuid`,
        [p.organizacaoId, JSON.stringify(existentes.map((c) => ({ ...c, id: porEmail.get(c.email!.toLowerCase()) })))],
      );
      atualizados += existentes.length;
      for (const contato of existentes) tagsDoContato.push({ contatoId: porEmail.get(contato.email!.toLowerCase())!, tags: contato.tags });
    }
    const novos = soEmail.filter((c) => !porEmail.has(c.email!.toLowerCase()));
    if (novos.length > 0) {
      const linhas = await tx.query<{ id: string; email: string }>(
        `insert into public.contatos (organizacao_id, nome, primeiro_nome, empresa, cargo, email, origem, importacao_id, criado_em)
         select $1::uuid, r.nome, r."primeiroNome", r.empresa, r.cargo, r.email, 'importacao', $3::uuid, $4
           from jsonb_to_recordset($2::jsonb) as r (nome text, "primeiroNome" text, empresa text, cargo text, email text)
         returning id, lower(email) as email`,
        [p.organizacaoId, JSON.stringify(novos), importacaoId, p.agora],
      );
      criados += linhas.length;
      const idPorEmail = new Map(linhas.map((linha) => [linha.email, linha.id]));
      for (const contato of novos) tagsDoContato.push({ contatoId: idPorEmail.get(contato.email!.toLowerCase())!, tags: contato.tags });
    }

    const pares = tagsDoContato.flatMap(({ contatoId, tags: nomes }) =>
      [...nomes, ...p.tagsParaTodos].map((nome) => ({ contato_id: contatoId, tag_id: tags.idPorChave.get(chaveDaTag(nome))! })),
    );
    if (pares.length > 0) {
      await tx.query(
        `insert into public.contato_tags (contato_id, tag_id, em, por)
         select r.contato_id, r.tag_id, $2, 'importacao' from jsonb_to_recordset($1::jsonb) as r (contato_id uuid, tag_id uuid)
         on conflict (contato_id, tag_id) do nothing`,
        [JSON.stringify(pares), p.agora],
      );
    }

    const resumo: ResumoDaImportacao = { criados, atualizados, tagsCriadas: tags.criadas };
    await tx.query(
      `update public.importacoes_de_contatos
          set resumo = jsonb_build_object(
                'criados', coalesce((resumo ->> 'criados')::int, 0) + $2,
                'atualizados', coalesce((resumo ->> 'atualizados')::int, 0) + $3,
                'tagsCriadas', coalesce((resumo ->> 'tagsCriadas')::int, 0) + $4)
        where id = $1::uuid`,
      [importacaoId, criados, atualizados, tags.criadas],
    );
    await registrarEvento(tx, {
      tipo: "contatos_importados",
      entidade: "importacao_de_contatos",
      entidadeId: importacaoId,
      payload: { ...resumo, autorizacao_whatsapp: importacao!.autorizacao_whatsapp },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true, importacaoId, ...resumo };
  });
}

// --- Não contatar mais -----------------------------------------------------------

/**
 * "Não contatar mais" (§4.15): o contato não recebe mais nada da organização,
 * por nenhum canal. Se for lead do LinkedIn, vale também o opt-out da §4.13,
 * que fecha os leads e cancela o que ia sair. Não se desfaz pela tela.
 *
 * `db` é a conexão do sistema: o opt-out do LinkedIn mexe nos leads da pessoa
 * em qualquer conta. Quem chama confere antes, pelo RLS, que o operador
 * enxerga o contato.
 */
export async function naoContatarMais(
  db: Db,
  p: { contatoId: string; organizacaoId: string; operadorId: string; operadorNome: string; motivo: string | null; agora: Date },
): Promise<Resultado<{ jaEstava: boolean }>> {
  return db.transacao(async (tx) => {
    const [contato] = await tx.query<{ nao_contatar_em: Date | null; provider_id: string | null; dono_perfil_id: string | null }>(
      `select c.nao_contatar_em, pe.provider_id, pe.dono_perfil_id
         from public.contatos c left join public.pessoas pe on pe.id = c.pessoa_id
        where c.id = $1::uuid and c.organizacao_id = $2::uuid
        for update of c`,
      [p.contatoId, p.organizacaoId],
    );
    if (!contato) return { ok: false, erro: "Contato não encontrado." };
    if (contato.nao_contatar_em) return { ok: true, jaEstava: true };

    const motivo = `Marcado por ${p.operadorNome}${p.motivo ? `: ${p.motivo}` : ""}`;
    await tx.query("update public.contatos set nao_contatar_em = $2, nao_contatar_motivo = $3 where id = $1::uuid", [
      p.contatoId,
      p.agora,
      motivo,
    ]);
    if (contato.provider_id) {
      await registrarOptout(tx, {
        providerId: contato.provider_id,
        perfilOrigem: contato.dono_perfil_id,
        textoPedido: motivo,
        ator: p.operadorId,
        agora: p.agora,
      });
    }
    await registrarEvento(tx, {
      tipo: "contato_nao_contatar",
      entidade: "contato",
      entidadeId: p.contatoId,
      perfilId: contato.dono_perfil_id,
      payload: { motivo },
      ator: p.operadorId,
      em: p.agora,
    });
    return { ok: true, jaEstava: false };
  });
}
