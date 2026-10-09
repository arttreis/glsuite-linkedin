-- SDR-20 · Inbox com todas as conversas do LinkedIn (§4.6).

-- Uma linha por chat do LinkedIn de um perfil. Conversa de campanha continua
-- ancorada no lead (`leads.chat_id`); esta tabela guarda as outras, que vêm do
-- histórico da Unipile ou do webhook, e liga-se ao lead se um dia a pessoa
-- entrar numa campanha (`lead_id`).
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis (id),
  chat_id text not null,
  contraparte_provider_id text,
  contraparte_nome text,
  contraparte_url text,
  lead_id uuid references public.leads (id),
  ultima_em timestamptz,
  criada_em timestamptz not null default now(),
  unique (perfil_id, chat_id)
);

create index if not exists conversas_perfil_idx on public.conversas (perfil_id, ultima_em desc);
create index if not exists conversas_contraparte_idx on public.conversas (perfil_id, contraparte_provider_id);

alter table public.mensagens add column if not exists conversa_id uuid references public.conversas (id);
create index if not exists mensagens_conversa_idx on public.mensagens (conversa_id, em);

alter table public.conversas enable row level security;
grant select, insert, update, delete on public.conversas to authenticated;
revoke all on public.conversas from anon;

drop policy if exists conversas_por_perfil on public.conversas;
create policy conversas_por_perfil on public.conversas
  for all to authenticated
  using (public.pode_ver_perfil(perfil_id)) with check (public.pode_ver_perfil(perfil_id));

-- Banco dividido com o GL Suite: o papel do app só ganha direito na tabela nova.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.conversas to sdr_servidor;
  end if;
end $$;
