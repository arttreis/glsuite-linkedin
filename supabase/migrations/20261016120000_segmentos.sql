-- Segmentos (SDR-71, §4.17): um filtro de contatos com nome, salvo para usar
-- de novo. O filtro é recalculado a cada uso (nada de lista congelada aqui:
-- quem congela é o disparo, na confirmação). `filtros` tem o formato de
-- `domain/filtro-de-contatos.ts`. Idempotente.

do $$
begin
  if to_regclass('public.segmentos') is not null and not exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.segmentos') and attname = 'filtros' and not attisdropped
  ) then
    raise exception 'public.segmentos já existe e não é do Kakou. Escolha outro nome antes de aplicar.';
  end if;
end $$;

create table if not exists public.segmentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  chave text not null,                               -- nome sem acento e caixa: não repete na organização
  filtros jsonb not null default '{}' check (jsonb_typeof(filtros) = 'object'),
  criado_por uuid references public.operadores (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, chave)
);

drop trigger if exists segmentos_atualizado_em on public.segmentos;
create trigger segmentos_atualizado_em before update on public.segmentos
  for each row execute function public.tocar_atualizado_em();

grant select, insert, update, delete on public.segmentos to authenticated;
revoke all on public.segmentos from anon;
alter table public.segmentos enable row level security;

drop policy if exists segmentos_da_organizacao on public.segmentos;
create policy segmentos_da_organizacao on public.segmentos
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.segmentos to sdr_servidor;
  end if;
end $$;
