-- Módulos por organização (SDR-69, §4.14): o Kakou é vendido em módulos e a
-- organização contrata só o que usa. 'linkedin' é o SDR no LinkedIn (o
-- primeiro acesso, Chats, Pipeline, Campanhas e o motor); 'whatsapp' e
-- 'telegram' são os disparos. A base (Dashboard, Contatos, Equipe e Plano) não
-- é módulo: toda organização tem. Quem liga e desliga é a GuessLess, pela tela
-- Plataforma, com a conexão do sistema: o operador só lê os da organização
-- dele. Idempotente.

-- Banco dividido com o GL Suite: `create table if not exists` pularia em
-- silêncio uma tabela de mesmo nome de outro produto, e o que vem depois
-- mexeria nela. Para antes.
do $$
begin
  if to_regclass('public.modulos_da_organizacao') is not null and not exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.modulos_da_organizacao') and attname = 'modulo' and not attisdropped
  ) then
    raise exception 'public.modulos_da_organizacao já existe e não é do Kakou. Escolha outro nome antes de aplicar.';
  end if;
end $$;

create table if not exists public.modulos_da_organizacao (
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  modulo text not null check (modulo in ('linkedin', 'whatsapp', 'telegram')),
  ativo boolean not null default true,
  desde timestamptz not null default now(),          -- quando ligou pela última vez
  motivo text,                                       -- por que ligou ou desligou
  alterado_em timestamptz not null default now(),
  alterado_por text not null default 'sistema',      -- e-mail de quem é da plataforma, ou 'sistema'
  primary key (organizacao_id, modulo)
);

-- Toda organização que já existe usa o SDR no LinkedIn; a da GuessLess ganha
-- os três para usar e testar os disparos.
insert into public.modulos_da_organizacao (organizacao_id, modulo, motivo)
select o.id, 'linkedin', 'Já usava o SDR no LinkedIn antes dos módulos' from public.organizacoes o
on conflict (organizacao_id, modulo) do nothing;

insert into public.modulos_da_organizacao (organizacao_id, modulo, motivo)
select o.id, m.modulo, 'Organização da GuessLess' from public.organizacoes o
 cross join (values ('whatsapp'), ('telegram')) as m (modulo)
 where o.slug = 'guessless'
on conflict (organizacao_id, modulo) do nothing;

-- Organização nova nasce com o SDR no LinkedIn (§4.1 e §4.14), por qualquer
-- caminho que a crie.
create or replace function public.ligar_modulo_padrao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.modulos_da_organizacao (organizacao_id, modulo, desde, alterado_em, motivo)
  values (new.id, 'linkedin', new.criado_em, new.criado_em, 'Organização nova')
  on conflict (organizacao_id, modulo) do nothing;
  return new;
end;
$$;

drop trigger if exists organizacoes_modulo_padrao on public.organizacoes;
create trigger organizacoes_modulo_padrao after insert on public.organizacoes
  for each row execute function public.ligar_modulo_padrao();

grant select on public.modulos_da_organizacao to authenticated;
revoke all on public.modulos_da_organizacao from anon;
alter table public.modulos_da_organizacao enable row level security;

-- Leitura para a organização; escrita só pela conexão do sistema (Plataforma).
drop policy if exists modulos_da_organizacao_leitura on public.modulos_da_organizacao;
create policy modulos_da_organizacao_leitura on public.modulos_da_organizacao
  for select to authenticated using (organizacao_id = public.organizacao_do_operador());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.modulos_da_organizacao to sdr_servidor;
  end if;
end $$;
