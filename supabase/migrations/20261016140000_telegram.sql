-- Telegram (SDR-73, §4.20). O contato ganha o Telegram: o id de quem deu /start
-- no bot (é o id do chat privado), o @usuário, quando entrou e quando saiu. O
-- id vale só para o bot em que a pessoa entrou: trocar de bot zera a lista. Os
-- links de entrada põem uma tag em quem entra por eles. Idempotente.

do $$
begin
  if to_regclass('public.links_de_entrada') is not null and not exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.links_de_entrada') and attname = 'codigo' and not attisdropped
  ) then
    raise exception 'public.links_de_entrada já existe e não é do Kakou. Escolha outro nome antes de aplicar.';
  end if;
end $$;

alter table public.contatos add column if not exists telegram_canal_id uuid references public.canais (id) on delete set null;
alter table public.contatos add column if not exists telegram_id text;
alter table public.contatos add column if not exists telegram_usuario text;
alter table public.contatos add column if not exists telegram_entrou_em timestamptz;
alter table public.contatos add column if not exists telegram_saiu_em timestamptz;
alter table public.contatos add column if not exists telegram_motivo text;
create unique index if not exists contatos_um_por_telegram on public.contatos (organizacao_id, telegram_id) where telegram_id is not null;

-- Um bot é de uma organização só.
create unique index if not exists canais_um_por_bot on public.canais ((dados ->> 'botId'))
  where tipo = 'telegram' and status <> 'desconectado';

create table if not exists public.links_de_entrada (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references public.canais (id) on delete cascade,
  codigo text not null unique check (codigo ~ '^[A-Za-z0-9_-]{4,64}$'),   -- o que vai no ?start=
  nome text not null check (char_length(nome) between 1 and 80),
  tag_id uuid references public.tags (id) on delete set null,
  criado_por uuid references public.operadores (id) on delete set null,
  criado_em timestamptz not null default now()
);

grant select, insert, update, delete on public.links_de_entrada to authenticated;
revoke all on public.links_de_entrada from anon;
alter table public.links_de_entrada enable row level security;

drop policy if exists links_de_entrada_da_organizacao on public.links_de_entrada;
create policy links_de_entrada_da_organizacao on public.links_de_entrada
  for all to authenticated
  using (exists (select 1 from public.canais c where c.id = canal_id and c.organizacao_id = public.organizacao_do_operador()))
  with check (exists (select 1 from public.canais c where c.id = canal_id and c.organizacao_id = public.organizacao_do_operador()));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.links_de_entrada to sdr_servidor;
  end if;
end $$;
