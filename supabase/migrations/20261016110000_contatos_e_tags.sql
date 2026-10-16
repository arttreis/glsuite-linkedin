-- Contatos e tags (SDR-70, §4.15 e §4.16). Contato é qualquer pessoa com quem
-- a organização pode falar, em qualquer canal. Toda pessoa do LinkedIn vira
-- contato da organização do perfil dono dela (as que já existem, aqui; as
-- novas, pela trigger), e o opt-out do LinkedIn vira "não contatar mais". As
-- tags são da organização e ficam nos contatos. Idempotente.

-- Banco dividido com o GL Suite: tabela de mesmo nome que não é do Kakou para
-- tudo antes de qualquer `create table if not exists` pular em silêncio.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('contatos', 'nao_contatar_em'),
    ('tags', 'chave'),
    ('contato_tags', 'tag_id'),
    ('importacoes_de_contatos', 'autorizacao_whatsapp')
  ) as v (tabela, coluna) loop
    if to_regclass('public.' || t.tabela) is not null and not exists (
      select 1 from pg_attribute
       where attrelid = to_regclass('public.' || t.tabela) and attname = t.coluna and not attisdropped
    ) then
      raise exception 'public.% já existe e não é do Kakou. Escolha outro nome antes de aplicar.', t.tabela;
    end if;
  end loop;
end $$;

create table if not exists public.importacoes_de_contatos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  arquivo_nome text,
  autorizacao_whatsapp boolean not null default false,  -- quem importou marcou que as pessoas autorizaram o WhatsApp
  resumo jsonb not null default '{}',
  criado_por uuid references public.operadores (id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 200),
  primeiro_nome text,
  empresa text,
  cargo text,
  email text,
  origem text not null check (origem in ('linkedin', 'importacao', 'telegram', 'whatsapp')),
  pessoa_id uuid unique references public.pessoas (id) on delete set null,   -- o lead do LinkedIn
  importacao_id uuid references public.importacoes_de_contatos (id) on delete set null,
  telefone text check (telefone ~ '^\+[1-9][0-9]{7,14}$'),                   -- E.164
  whatsapp_autorizado_em timestamptz,
  whatsapp_autorizacao jsonb,                                                -- quem marcou, quando e em qual importação
  whatsapp_saiu_em timestamptz,
  whatsapp_motivo text,
  nao_contatar_em timestamptz,                                               -- não recebe mais nada da organização
  nao_contatar_motivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists contatos_um_por_telefone on public.contatos (organizacao_id, telefone) where telefone is not null;
create index if not exists contatos_por_organizacao on public.contatos (organizacao_id, criado_em desc);
create index if not exists contatos_por_email on public.contatos (organizacao_id, lower(email)) where email is not null;

drop trigger if exists contatos_atualizado_em on public.contatos;
create trigger contatos_atualizado_em before update on public.contatos
  for each row execute function public.tocar_atualizado_em();

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 40),
  chave text not null,                                                      -- sem acento e caixa: a mesma tag não repete
  cor text not null default 'cinza' check (cor in ('cinza', 'verde', 'azul', 'roxo', 'amarelo', 'laranja', 'vermelho', 'rosa')),
  criado_por uuid references public.operadores (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (organizacao_id, chave)
);

create table if not exists public.contato_tags (
  contato_id uuid not null references public.contatos (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  em timestamptz not null default now(),
  por text not null default 'sistema',                                      -- id do operador, 'importacao' ou 'sistema'
  primary key (contato_id, tag_id)
);

create index if not exists contato_tags_por_tag on public.contato_tags (tag_id);

-- A tag e o contato são da mesma organização, venha a escrita de onde vier.
create or replace function public.conferir_tag_do_contato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select organizacao_id from public.contatos where id = new.contato_id)
     is distinct from (select organizacao_id from public.tags where id = new.tag_id) then
    raise exception 'A tag e o contato são de organizações diferentes.';
  end if;
  return new;
end;
$$;

drop trigger if exists contato_tags_mesma_organizacao on public.contato_tags;
create trigger contato_tags_mesma_organizacao before insert or update on public.contato_tags
  for each row execute function public.conferir_tag_do_contato();

-- Toda pessoa do LinkedIn vira contato da organização do perfil dono dela, e
-- o contato acompanha o nome, a empresa, o cargo e o opt-out da pessoa.
create or replace function public.contato_da_pessoa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.contatos (organizacao_id, nome, primeiro_nome, empresa, cargo, origem, pessoa_id,
                                 nao_contatar_em, nao_contatar_motivo, criado_em)
    select pf.organizacao_id, coalesce(nullif(left(btrim(new.nome), 200), ''), 'Sem nome'), new.primeiro_nome, new.empresa, new.cargo, 'linkedin', new.id,
           new.optout_em, case when new.optout_em is not null then 'Pediu para não ser contatado pelo LinkedIn' end,
           new.criado_em
      from public.perfis pf where pf.id = new.dono_perfil_id
    on conflict (pessoa_id) do nothing;
  else
    update public.contatos c
       set nome = coalesce(nullif(left(btrim(new.nome), 200), ''), 'Sem nome'), primeiro_nome = new.primeiro_nome, empresa = new.empresa, cargo = new.cargo,
           nao_contatar_motivo = case when c.nao_contatar_em is null and new.optout_em is not null
                                      then 'Pediu para não ser contatado pelo LinkedIn' else c.nao_contatar_motivo end,
           nao_contatar_em = coalesce(c.nao_contatar_em, new.optout_em)
     where c.pessoa_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists pessoas_viram_contatos on public.pessoas;
create trigger pessoas_viram_contatos after insert on public.pessoas
  for each row execute function public.contato_da_pessoa();
drop trigger if exists pessoas_atualizam_contatos on public.pessoas;
create trigger pessoas_atualizam_contatos after update of nome, primeiro_nome, empresa, cargo, optout_em on public.pessoas
  for each row execute function public.contato_da_pessoa();

insert into public.contatos (organizacao_id, nome, primeiro_nome, empresa, cargo, origem, pessoa_id,
                             nao_contatar_em, nao_contatar_motivo, criado_em)
select pf.organizacao_id, coalesce(nullif(left(btrim(pe.nome), 200), ''), 'Sem nome'), pe.primeiro_nome, pe.empresa, pe.cargo, 'linkedin', pe.id,
       pe.optout_em, case when pe.optout_em is not null then 'Pediu para não ser contatado pelo LinkedIn' end,
       pe.criado_em
  from public.pessoas pe join public.perfis pf on pf.id = pe.dono_perfil_id
on conflict (pessoa_id) do nothing;

grant select, insert, update, delete on public.contatos, public.tags, public.contato_tags, public.importacoes_de_contatos to authenticated;
revoke all on public.contatos, public.tags, public.contato_tags, public.importacoes_de_contatos from anon;
alter table public.contatos enable row level security;
alter table public.tags enable row level security;
alter table public.contato_tags enable row level security;
alter table public.importacoes_de_contatos enable row level security;

-- Contato da organização. O que é lead do LinkedIn segue a regra das pessoas:
-- só quem enxerga o perfil dono (a subconsulta passa pelo RLS de pessoas).
drop policy if exists contatos_da_organizacao on public.contatos;
create policy contatos_da_organizacao on public.contatos
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador()
         and (pessoa_id is null or exists (select 1 from public.pessoas pe where pe.id = pessoa_id)))
  with check (organizacao_id = public.organizacao_do_operador()
              and (pessoa_id is null or exists (select 1 from public.pessoas pe where pe.id = pessoa_id)));

drop policy if exists tags_da_organizacao on public.tags;
create policy tags_da_organizacao on public.tags
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

drop policy if exists contato_tags_da_organizacao on public.contato_tags;
create policy contato_tags_da_organizacao on public.contato_tags
  for all to authenticated
  using (exists (select 1 from public.contatos c where c.id = contato_id))
  with check (exists (select 1 from public.contatos c where c.id = contato_id)
              and exists (select 1 from public.tags t where t.id = tag_id));

drop policy if exists importacoes_de_contatos_da_organizacao on public.importacoes_de_contatos;
create policy importacoes_de_contatos_da_organizacao on public.importacoes_de_contatos
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.contatos, public.tags, public.contato_tags, public.importacoes_de_contatos to sdr_servidor;
  end if;
end $$;
