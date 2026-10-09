-- SDR-21 · Fluxo de campanha com blocos (§4.1).

-- Versões do fluxo de cada campanha. O lead guarda a versão em que entrou:
-- editar o fluxo de uma campanha com leads andando cria versão nova, que vale
-- só para quem entrar depois. Lead sem versão (de antes do SDR-21) segue a
-- `campanhas.sequencia`, convertida para o fluxo equivalente.
create table if not exists public.fluxos (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas (id) on delete cascade,
  versao integer not null,
  grafo jsonb not null check (jsonb_typeof(grafo) = 'object'),
  criado_por uuid references public.operadores (id),
  criado_em timestamptz not null default now(),
  unique (campanha_id, versao)
);

alter table public.campanhas add column if not exists fluxo_id uuid references public.fluxos (id);
alter table public.leads add column if not exists fluxo_id uuid references public.fluxos (id);

-- O toque passa a ser o id do bloco do fluxo (no fluxo padrão, ainda T1 a T4).
alter table public.acoes drop constraint if exists acoes_toque_check;
alter table public.leads drop constraint if exists leads_passo_atual_check;

alter table public.fluxos enable row level security;
grant select, insert, update, delete on public.fluxos to authenticated;
revoke all on public.fluxos from anon;

drop policy if exists fluxos_por_perfil on public.fluxos;
create policy fluxos_por_perfil on public.fluxos
  for all to authenticated
  using (exists (select 1 from public.campanhas c where c.id = campanha_id and public.pode_ver_perfil(c.perfil_id)))
  with check (exists (select 1 from public.campanhas c where c.id = campanha_id and public.pode_ver_perfil(c.perfil_id)));

