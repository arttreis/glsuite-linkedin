import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db/tipos";

/** Sequência padrão da §4.1, no formato de `campanhas.sequencia`. */
export const SEQUENCIA_PADRAO = [
  { toque: "T1", tipo: "convite", offset_dias_uteis: 0, ancora: "inicio", template: "Oi {{first_name}}, tudo bem?" },
  { toque: "T2", tipo: "dm", offset_dias_uteis: 2, ancora: "aceite", template: "Obrigado por aceitar, {{first_name}}." },
  { toque: "T3", tipo: "dm", offset_dias_uteis: 4, ancora: "anterior", template: "Como a {{company}} mede isso hoje?" },
  { toque: "T4", tipo: "dm", offset_dias_uteis: 5, ancora: "anterior", template: "Fico por aqui. Abraço!" },
];

export type SlugPerfil = "arthur" | "juliano" | "luiz" | "jp";

export async function idDoPerfil(db: Db, slug: SlugPerfil): Promise<string> {
  const [perfil] = await db.query<{ id: string }>("select id from public.perfis where slug = $1", [slug]);
  if (!perfil) throw new Error(`perfil ${slug} não existe`);
  return perfil.id;
}

export async function idDaOrganizacaoGuessless(db: Db): Promise<string> {
  const [organizacao] = await db.query<{ id: string }>("select id from public.organizacoes where slug = 'guessless'");
  if (!organizacao) throw new Error("organização guessless não existe");
  return organizacao.id;
}

/** Organização nova, sem perfis nem operadores. */
export async function criarOrganizacao(db: Db, opcoes: { slug?: string; nome?: string } = {}): Promise<string> {
  const slug = opcoes.slug ?? `org-${randomUUID().slice(0, 8)}`;
  const [organizacao] = await db.query<{ id: string }>(
    "insert into public.organizacoes (slug, nome) values ($1, $2) returning id",
    [slug, opcoes.nome ?? "Outra Empresa"],
  );
  return organizacao!.id;
}

/** Perfil pausado numa organização qualquer, com a configuração do perfil do Arthur. */
export async function criarPerfilNaOrganizacao(
  db: Db,
  p: { organizacaoId: string; slug: string; praca?: "domestico" | "canada" | "espanha" },
): Promise<string> {
  const [perfil] = await db.query<{ id: string }>(
    `insert into public.perfis (slug, nome, praca, fuso, idioma, modo_resposta, rampa, teto_convites_semana, janela, motivo_pausa, organizacao_id)
     select $1, $1, coalesce($3, praca), fuso, idioma, modo_resposta, rampa, teto_convites_semana, janela, motivo_pausa, $2::uuid
       from public.perfis where slug = 'arthur'
     returning id`,
    [p.slug, p.organizacaoId, p.praca ?? null],
  );
  return perfil!.id;
}

export async function criarOperador(
  db: Db,
  opcoes: {
    email?: string;
    nome?: string;
    papel?: "admin" | "operador";
    perfis?: SlugPerfil[];
    perfilIds?: string[];
    ativo?: boolean;
    organizacaoId?: string;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const email = opcoes.email ?? `${id}@guessless.com.br`;
  const organizacaoId = opcoes.organizacaoId ?? (await idDaOrganizacaoGuessless(db));
  await db.query("insert into auth.users (id, email) values ($1::uuid, $2)", [id, email]);
  await db.query(
    "insert into public.operadores (id, nome, email, papel, ativo, organizacao_id) values ($1::uuid, $2, $3, $4, $5, $6::uuid)",
    [id, opcoes.nome ?? "Operador", email, opcoes.papel ?? "operador", opcoes.ativo ?? true, organizacaoId],
  );
  const perfilIds = [...(opcoes.perfilIds ?? [])];
  for (const slug of opcoes.perfis ?? []) perfilIds.push(await idDoPerfil(db, slug));
  for (const perfilId of perfilIds) {
    await db.query(
      "insert into public.operador_perfis (operador_id, perfil_id) values ($1::uuid, $2::uuid)",
      [id, perfilId],
    );
  }
  return id;
}

/** Usuário logado no Supabase que não está na tabela de operadores. */
export async function criarUsuarioSemAcesso(db: Db): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1::uuid, $2)", [id, `${id}@externo.com`]);
  return id;
}

export async function ativarPerfil(
  db: Db,
  slug: SlugPerfil,
  opcoes: { ativadoEm?: string; accountId?: string } = {},
): Promise<string> {
  const id = await idDoPerfil(db, slug);
  await db.query(
    `update public.perfis
       set status = 'ativo', motivo_pausa = null,
           ativado_em = $2::timestamptz, unipile_account_id = $3
     where id = $1::uuid`,
    [id, opcoes.ativadoEm ?? "2026-09-01T12:00:00Z", opcoes.accountId ?? `conta-${slug}`],
  );
  return id;
}

export async function criarCampanha(
  db: Db,
  opcoes: {
    perfil?: SlugPerfil;
    nome?: string;
    angulo?: string;
    sequencia?: unknown;
    posT4?: "conexao" | "pausa_60_novo_angulo";
    status?: "rascunho" | "ativa" | "pausada" | "encerrada";
    modoCopy?: "template" | "personalizada";
  } = {},
): Promise<string> {
  const [campanha] = await db.query<{ id: string }>(
    `insert into public.campanhas (perfil_id, nome, angulo, sequencia, pos_t4, status, modo_copy)
     values ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7)
     returning id`,
    [
      await idDoPerfil(db, opcoes.perfil ?? "arthur"),
      opcoes.nome ?? `Campanha ${randomUUID().slice(0, 8)}`,
      opcoes.angulo ?? "Margem invisível",
      JSON.stringify(opcoes.sequencia ?? SEQUENCIA_PADRAO),
      opcoes.posT4 ?? "conexao",
      opcoes.status ?? "ativa",
      opcoes.modoCopy ?? "template",
    ],
  );
  return campanha!.id;
}

export async function criarPessoa(
  db: Db,
  opcoes: {
    dono?: SlugPerfil;
    providerId?: string;
    nome?: string;
    empresa?: string;
    empresaChave?: string;
    optoutEm?: string;
  } = {},
): Promise<string> {
  const providerId = opcoes.providerId ?? `ACo${randomUUID().replaceAll("-", "")}`;
  const [pessoa] = await db.query<{ id: string }>(
    `insert into public.pessoas (
       provider_id, url_publica, nome, primeiro_nome, empresa, empresa_chave,
       fonte, coletado_em, dono_perfil_id, optout_em
     ) values ($1, $2, $3, $4, $5, $6, 'csv', '2026-09-20T12:00:00Z', $7::uuid, $8::timestamptz)
     returning id`,
    [
      providerId,
      `https://www.linkedin.com/in/${providerId}`,
      opcoes.nome ?? "Maria Souza",
      (opcoes.nome ?? "Maria Souza").split(" ")[0],
      opcoes.empresa ?? "Acme",
      opcoes.empresaChave ?? (opcoes.empresa ?? "Acme").toLowerCase(),
      await idDoPerfil(db, opcoes.dono ?? "arthur"),
      opcoes.optoutEm ?? null,
    ],
  );
  return pessoa!.id;
}

export async function criarLead(
  db: Db,
  opcoes: { pessoaId: string; campanhaId: string; estado?: string; angulo?: string | null },
): Promise<string> {
  const [lead] = await db.query<{ id: string }>(
    `insert into public.leads (pessoa_id, campanha_id, perfil_id, estado, angulo)
     select $1::uuid, c.id, c.perfil_id, $3, coalesce($4, c.angulo)
       from public.campanhas c where c.id = $2::uuid
     returning id`,
    [opcoes.pessoaId, opcoes.campanhaId, opcoes.estado ?? "triagem", opcoes.angulo ?? null],
  );
  return lead!.id;
}
