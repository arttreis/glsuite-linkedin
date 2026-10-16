-- Marcas (SDR-105, §4.30, D30 a D44). A organização passa a ter marcas, e a
-- marca vira a fronteira dos dados: a GuessLess opera marcas de clientes
-- diferentes dentro de uma organização só (D42). O papel continua por
-- organização (operadores.papel); o acesso é por marca (D30): o admin vê todas
-- as da organização, o operador só as de acessos_das_marcas.
--
-- Aqui nasce só a fundação: a marca 1 de cada organização, a marca atual de
-- cada operador e as funções que os tickets seguintes ligam nas tabelas deles
-- (pode_ver_marca, marca_atual, preencher_marca). Nenhuma policy que já existe
-- muda. Idempotente.

-- Banco dividido com o GL Suite: tabela de mesmo nome que não é do Kakou para
-- tudo antes de qualquer `create table if not exists` pular em silêncio.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('marcas', 'analise_e_sdr_em'),
    ('acessos_das_marcas', 'marca_id')
  ) as v (tabela, coluna) loop
    if to_regclass('public.' || t.tabela) is not null and not exists (
      select 1 from pg_attribute
       where attrelid = to_regclass('public.' || t.tabela) and attname = t.coluna and not attisdropped
    ) then
      raise exception 'public.% já existe e não é do Kakou. Escolha outro nome antes de aplicar.', t.tabela;
    end if;
  end loop;
end $$;

create table if not exists public.marcas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null check (char_length(btrim(nome)) between 2 and 80),
  cor text not null default 'verde' check (cor in ('cinza','verde','azul','roxo','amarelo','laranja','vermelho','rosa')),
  status text not null default 'ativa' check (status in ('ativa','pausada','arquivada')),
  analise_e_sdr_em timestamptz,                     -- concluiu os 3 passos de criar marca (SDR-115); a marca 1 nasce com now()
  criado_em timestamptz not null default now(), criado_por uuid references public.operadores (id),
  pausada_em timestamptz, pausada_por uuid references public.operadores (id),
  arquivada_em timestamptz, arquivada_por uuid references public.operadores (id),
  unique (organizacao_id, id)
);
create unique index if not exists marcas_nome_unico on public.marcas (organizacao_id, lower(btrim(nome)));

create table if not exists public.acessos_das_marcas (
  operador_id uuid not null references public.operadores (id) on delete cascade,
  marca_id uuid not null references public.marcas (id),
  criado_em timestamptz not null default now(), criado_por uuid references public.operadores (id),
  primary key (operador_id, marca_id)
);
create index if not exists acessos_das_marcas_marca_idx on public.acessos_das_marcas (marca_id);

alter table public.operadores add column if not exists marca_atual_id uuid references public.marcas (id);

-- Backfill (§4.30, "Organização que já existe"): cada organização vira uma
-- marca só, com o nome dela, e todo operador ganha acesso a ela e entra nela.
-- O acesso e a marca atual só se preenchem onde a organização tem uma marca:
-- rodar de novo depois do SDR-115 não devolve acesso que o admin tirou.
insert into public.marcas (organizacao_id, nome, cor, analise_e_sdr_em, criado_em)
select g.id, g.nome, 'verde', now(), g.criado_em from public.organizacoes g
 where not exists (select 1 from public.marcas m where m.organizacao_id = g.id);

insert into public.acessos_das_marcas (operador_id, marca_id)
select o.id, m.id from public.operadores o join public.marcas m on m.organizacao_id = o.organizacao_id
 where (select count(*) from public.marcas u where u.organizacao_id = o.organizacao_id) = 1
on conflict (operador_id, marca_id) do nothing;

update public.operadores o set marca_atual_id = m.id
  from public.marcas m
 where o.marca_atual_id is null and m.organizacao_id = o.organizacao_id
   and (select count(*) from public.marcas u where u.organizacao_id = o.organizacao_id) = 1;

-- Organização nova nasce com a marca 1 (§4.30), por qualquer caminho que a
-- crie: o primeiro acesso (garantirOperadorDoPrimeiroAcesso), o SQL do README,
-- as fixtures.
create or replace function public.criar_marca_1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.marcas (organizacao_id, nome, cor, analise_e_sdr_em, criado_em)
  values (new.id, new.nome, 'verde', new.criado_em, new.criado_em);
  return new;
end;
$$;

drop trigger if exists organizacoes_marca_1 on public.organizacoes;
create trigger organizacoes_marca_1 after insert on public.organizacoes
  for each row execute function public.criar_marca_1();

-- Operador novo sem marca atual entra na marca da organização quando ela tem
-- uma só, com o acesso a ela. Com mais de uma, quem dá o acesso é o admin
-- (SDR-117), e o operador cai na primeira que pode ver (buscarOperadorAtivo).
create or replace function public.entrar_na_marca_unica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if new.marca_atual_id is null then
    select array_agg(id) into v_ids from public.marcas where organizacao_id = new.organizacao_id;
    if coalesce(array_length(v_ids, 1), 0) = 1 then
      insert into public.acessos_das_marcas (operador_id, marca_id) values (new.id, v_ids[1])
      on conflict (operador_id, marca_id) do nothing;
      update public.operadores set marca_atual_id = v_ids[1] where id = new.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists operadores_marca_atual on public.operadores;
create trigger operadores_marca_atual after insert on public.operadores
  for each row execute function public.entrar_na_marca_unica();

-- Mesma organização do operador e (admin ou acesso). Admin vê todas as marcas
-- da organização (D30).
create or replace function public.pode_ver_marca(p_marca_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.marcas m
    where m.id = p_marca_id and m.organizacao_id = public.organizacao_do_operador()
  ) and (
    public.eh_admin() or exists (
      select 1 from public.acessos_das_marcas a
      where a.operador_id = (select auth.uid()) and a.marca_id = p_marca_id
    )
  );
$$;

-- operadores.marca_atual_id quando pode_ver_marca(ela); senão null. Nunca
-- devolve marca de outra organização, mesmo com marca_atual_id adulterado.
create or replace function public.marca_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.marca_atual_id from public.operadores o
  where o.id = (select auth.uid()) and o.ativo and public.pode_ver_marca(o.marca_atual_id);
$$;

-- Linha inserida sem marca entra na marca atual do operador, quando ela é da
-- organização da linha; sem operador (jobs, webhooks), na única marca da
-- organização. Com mais de uma, quem insere tem de dizer qual. Mesmo desenho
-- de preencher_organizacao_unica(); os tickets do Marco F ligam esta trigger
-- nas tabelas deles (before insert), que têm organizacao_id e marca_id.
create or replace function public.preencher_marca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_atual uuid;
  v_ids uuid[];
begin
  if new.marca_id is null then
    v_atual := public.marca_atual();
    if v_atual is not null and exists (
      select 1 from public.marcas m where m.id = v_atual and m.organizacao_id = new.organizacao_id
    ) then
      new.marca_id := v_atual;
    else
      select array_agg(id) into v_ids from public.marcas where organizacao_id = new.organizacao_id;
      if coalesce(array_length(v_ids, 1), 0) <> 1 then
        raise exception 'Informe a marca: a organização tem % marcas.', coalesce(array_length(v_ids, 1), 0);
      end if;
      new.marca_id := v_ids[1];
    end if;
  end if;
  return new;
end;
$$;

-- O painel lê as marcas e o admin muda nome e cor. Criar (SDR-115), pausar e
-- arquivar (SDR-118) passam pela conexão do sistema: o grant de update é só
-- das duas colunas.
grant select, update (nome, cor) on public.marcas to authenticated;
grant select, insert, delete on public.acessos_das_marcas to authenticated;
revoke all on public.marcas, public.acessos_das_marcas from anon;
alter table public.marcas enable row level security;
alter table public.acessos_das_marcas enable row level security;

drop policy if exists marcas_leitura on public.marcas;
create policy marcas_leitura on public.marcas
  for select to authenticated
  using (organizacao_id = public.organizacao_do_operador() and public.pode_ver_marca(id));
drop policy if exists marcas_edicao on public.marcas;
create policy marcas_edicao on public.marcas
  for update to authenticated
  using (organizacao_id = public.organizacao_do_operador() and public.eh_admin())
  with check (organizacao_id = public.organizacao_do_operador() and public.eh_admin());

-- Cada um lê os próprios acessos; o admin lê e muda os da organização.
drop policy if exists acessos_das_marcas_leitura on public.acessos_das_marcas;
create policy acessos_das_marcas_leitura on public.acessos_das_marcas
  for select to authenticated
  using (operador_id = (select auth.uid()) or (public.eh_admin() and public.pode_ver_marca(marca_id)));
drop policy if exists acessos_das_marcas_escrita on public.acessos_das_marcas;
create policy acessos_das_marcas_escrita on public.acessos_das_marcas
  for all to authenticated
  using (public.eh_admin() and public.pode_ver_marca(marca_id))
  with check (
    public.eh_admin() and public.pode_ver_marca(marca_id)
    and exists (
      select 1 from public.operadores o
      where o.id = operador_id and o.organizacao_id = public.organizacao_do_operador()
    )
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.marcas, public.acessos_das_marcas to sdr_servidor;
  end if;
end $$;

insert into public.configuracoes (chave, valor, descricao) values
  ('marcas',
   '{"ativo": true, "criar": false, "max_por_organizacao": 20}',
   'Marcas (§4.30, D39): ativo liga a troca de marca no seletor; criar libera criar marca nova (SDR-115); max_por_organizacao é o limite de marcas por organização')
on conflict (chave) do nothing;
