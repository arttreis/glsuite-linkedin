-- SDR-02 · Modelo de dados (docs/epico.md §6).
-- Idempotente: rodar de novo não falha nem duplica nada.

create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- Operadores do painel: usuários do Supabase Auth liberados pelo admin.
create table if not exists public.operadores (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  papel text not null default 'operador' check (papel in ('admin', 'operador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Perfis do LinkedIn da casa. O teto é do perfil, não da campanha (§4.3).
create table if not exists public.perfis (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  operador_id uuid references public.operadores (id) on delete set null,
  email_alerta text,
  unipile_account_id text unique,
  unipile_status text,
  linkedin_provider_id text,
  tipo_conta text not null default 'premium'
    check (tipo_conta in ('gratuita', 'premium', 'sales_navigator')),
  limite_nota_convite integer not null default 300 check (limite_nota_convite between 0 and 300),
  praca text not null check (praca in ('domestico', 'canada', 'espanha')),
  fuso text not null,
  idioma text not null check (idioma in ('pt', 'en', 'es')),
  modo_resposta text not null default 'aprovacao'
    check (modo_resposta in ('manual', 'aprovacao', 'automatico')),
  rampa jsonb not null check (jsonb_typeof(rampa) = 'array'),
  teto_convites_semana integer not null check (teto_convites_semana >= 0),
  janela jsonb not null default '{"inicio": "09:00", "fim": "18:00", "jitter_min": [3, 12]}'
    check (jsonb_typeof(janela) = 'object'),
  palavras_proibidas text[] not null default '{}',
  rodape_obrigatorio text,
  link_agenda text,
  voz_md text,
  regras_md text,
  ativado_em timestamptz,
  status text not null default 'pausado' check (status in ('ativo', 'pausado')),
  motivo_pausa text,
  pausado_em timestamptz,
  despausado_em timestamptz,
  proxima_acao_apos timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint perfis_pausado_tem_motivo check (status = 'ativo' or motivo_pausa is not null),
  constraint perfis_ativo_tem_conta check (
    status = 'pausado' or (ativado_em is not null and unipile_account_id is not null)
  )
);

create or replace trigger perfis_atualizado_em
  before update on public.perfis
  for each row execute function public.tocar_atualizado_em();

-- Quais perfis cada operador enxerga (o admin enxerga todos).
create table if not exists public.operador_perfis (
  operador_id uuid not null references public.operadores (id) on delete cascade,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  primary key (operador_id, perfil_id)
);

-- Lista fechada de ângulos (§4.9). Configuração, não código.
create table if not exists public.angulos (
  nome text primary key,
  grupo text not null default 'servico',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.campanhas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id),
  nome text not null,
  angulo text not null references public.angulos (nome) on update cascade,
  nicho text,
  modo_copy text not null default 'template' check (modo_copy in ('template', 'personalizada')),
  sequencia jsonb not null check (jsonb_typeof(sequencia) = 'array'),
  pos_t4 text not null check (pos_t4 in ('conexao', 'pausa_60_novo_angulo')),
  max_leads integer check (max_leads is null or max_leads > 0),
  status text not null default 'rascunho' check (status in ('rascunho', 'ativa', 'pausada', 'encerrada')),
  criado_por uuid references public.operadores (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (perfil_id, nome)
);

create or replace trigger campanhas_atualizado_em
  before update on public.campanhas
  for each row execute function public.tocar_atualizado_em();

-- Pessoas do LinkedIn. Um alvo, um dono (§4.7): provider_id é único e
-- URL, fonte e data da coleta são obrigatórias (base do legítimo interesse).
create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null unique,
  public_identifier text,
  url_publica text not null,
  nome text not null,
  primeiro_nome text,
  cargo text,
  empresa text,
  empresa_dominio text,
  empresa_chave text,
  localizacao text,
  fonte text not null,
  coletado_em timestamptz not null,
  dono_perfil_id uuid not null references public.perfis (id),
  optout_em timestamptz,
  praca text check (praca in ('domestico', 'canada', 'espanha')),
  dados_brutos jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists pessoas_empresa_chave_idx on public.pessoas (empresa_chave);
create index if not exists pessoas_dono_idx on public.pessoas (dono_perfil_id);

create or replace trigger pessoas_atualizado_em
  before update on public.pessoas
  for each row execute function public.tocar_atualizado_em();

create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id),
  perfil_id uuid not null references public.perfis (id),
  fonte text not null,
  arquivo_nome text,
  resumo jsonb not null default '{}',
  criado_por uuid references public.operadores (id),
  criado_em timestamptz not null default now()
);

-- Estados do lead (§6.1).
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references public.pessoas (id),
  campanha_id uuid not null references public.campanhas (id),
  perfil_id uuid not null references public.perfis (id),
  importacao_id uuid references public.importacoes (id),
  estado text not null default 'importado' check (estado in (
    'importado', 'triagem', 'rejeitado', 'na_fila', 'convite_enviado', 'aceito',
    'em_sequencia', 'sem_resposta', 'convite_retirado', 'em_conversa', 'qualificado',
    'reuniao_marcada', 'encerrado_nao', 'optout', 'escalado_humano'
  )),
  angulo text references public.angulos (nome) on update cascade,
  passo_atual text check (passo_atual in ('T1', 'T2', 'T3', 'T4')),
  variante_copy text check (variante_copy in ('template', 'personalizada')),
  bloqueio_motivo text,
  alerta_triagem text,
  revisao_motivo text,
  pesquisa jsonb,
  rd_deal_id text,
  chat_id text,
  convite_id text,
  convite_enviado_em timestamptz,
  aceito_em timestamptz,
  respondeu_em timestamptz,
  ultimo_toque_em timestamptz,
  proximo_passo text,
  proximo_passo_em date,
  retorno_apos date,
  dono_conversa_id uuid references public.operadores (id),
  reuniao_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pessoa_id, campanha_id),
  -- "Toque sem ângulo registrado é bug" (§4.9).
  constraint leads_toque_exige_angulo check (
    estado in ('importado', 'triagem', 'rejeitado') or angulo is not null
  )
);

-- Uma pessoa só pode estar numa régua ativa por vez.
create unique index if not exists leads_um_ativo_por_pessoa on public.leads (pessoa_id)
  where estado in (
    'na_fila', 'convite_enviado', 'aceito', 'em_sequencia', 'em_conversa',
    'qualificado', 'reuniao_marcada', 'escalado_humano'
  );
create index if not exists leads_perfil_estado_idx on public.leads (perfil_id, estado);
create index if not exists leads_campanha_estado_idx on public.leads (campanha_id, estado);
create index if not exists leads_chat_idx on public.leads (chat_id) where chat_id is not null;

create or replace trigger leads_atualizado_em
  before update on public.leads
  for each row execute function public.tocar_atualizado_em();

-- Fila do despachante (§5.1). idempotency_key impede ação duplicada.
create table if not exists public.acoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  perfil_id uuid not null references public.perfis (id),
  tipo text not null check (tipo in ('convite', 'dm', 'retirar_convite', 'tarefa_manual')),
  toque text check (toque in ('T1', 'T2', 'T3', 'T4')),
  texto_gerado text,
  texto_final text,
  origem text not null check (origem in ('template', 'ia', 'humano')),
  status text not null default 'pendente' check (status in (
    'pendente', 'aguardando_aprovacao', 'enviando', 'enviada', 'falhou', 'cancelada'
  )),
  agendada_para timestamptz not null,
  idempotency_key text not null unique,
  tentativas integer not null default 0,
  erro text,
  motivo_revisao text,
  enviada_em timestamptz,
  provider_message_id text,
  aprovada_por uuid references public.operadores (id),
  aprovada_em timestamptz,
  validacao jsonb,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

create index if not exists acoes_fila_idx on public.acoes (perfil_id, status, agendada_para);
create index if not exists acoes_lead_idx on public.acoes (lead_id, status);
create index if not exists acoes_enviadas_idx on public.acoes (perfil_id, tipo, enviada_em)
  where status = 'enviada';

create or replace function public.tocar_atualizada_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizada_em := now();
  return new;
end;
$$;

create or replace trigger acoes_atualizada_em
  before update on public.acoes
  for each row execute function public.tocar_atualizada_em();

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id),
  perfil_id uuid not null references public.perfis (id),
  pessoa_id uuid references public.pessoas (id),
  acao_id uuid references public.acoes (id),
  chat_id text,
  direcao text not null check (direcao in ('entrada', 'saida')),
  autor text not null check (autor in ('prospect', 'ia', 'humano', 'sistema')),
  texto text not null,
  provider_message_id text unique,
  em timestamptz not null default now()
);

create index if not exists mensagens_lead_idx on public.mensagens (lead_id, em);
create index if not exists mensagens_perfil_idx on public.mensagens (perfil_id, em);

-- Opt-out global: vale para os 4 perfis e bloqueia importações futuras (§4.6).
create table if not exists public.optouts (
  provider_id text primary key,
  em timestamptz not null default now(),
  perfil_origem uuid references public.perfis (id),
  texto_pedido text
);

-- Auditoria de tudo. Só cresce.
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  tipo text not null,
  entidade text not null,
  entidade_id text,
  perfil_id uuid references public.perfis (id),
  payload jsonb not null default '{}',
  ator text not null default 'sistema',
  em timestamptz not null default now()
);

create index if not exists eventos_entidade_idx on public.eventos (entidade, entidade_id, em);
create index if not exists eventos_tipo_idx on public.eventos (tipo, em);
create index if not exists eventos_perfil_idx on public.eventos (perfil_id, em);

-- Idempotência dos webhooks: o mesmo evento entregue 2× gera 1 efeito.
create table if not exists public.webhooks_recebidos (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  fonte text not null,
  tipo text,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas integer not null default 0,
  erro text
);

create index if not exists webhooks_pendentes_idx on public.webhooks_recebidos (recebido_em)
  where processado_em is null;

create table if not exists public.feriados (
  praca text not null check (praca in ('domestico', 'canada', 'espanha')),
  data date not null,
  nome text not null,
  primary key (praca, data)
);

-- Parâmetros globais do sistema (cooldown, SLA, guardas...). Configuração, não código.
create table if not exists public.configuracoes (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);

create or replace trigger configuracoes_atualizado_em
  before update on public.configuracoes
  for each row execute function public.tocar_atualizado_em();
