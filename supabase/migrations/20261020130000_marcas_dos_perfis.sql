-- Contas do LinkedIn por marca (SDR-108, §4.30, D36). A conta se conecta numa
-- marca e pode estar em mais de uma: a relação perfil e marca é N:N. O perfil
-- continua da organização (o RLS de perfis e pode_ver_perfil() não mudam), e o
-- teto continua do perfil, somando todas as marcas (§4.13). A conta da casa
-- nunca entra numa marca.
--
-- Aqui nascem a tabela, o backfill (cada perfil na marca 1 da organização), a
-- trigger que liga o perfil novo à marca de quem vincula e o índice que impede
-- o mesmo LinkedIn de virar dois perfis. Idempotente.

-- Banco dividido com o GL Suite: tabela de mesmo nome que não é do Kakou para
-- tudo antes de qualquer `create table if not exists` pular em silêncio.
do $$
begin
  if to_regclass('public.marcas_dos_perfis') is not null and not exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.marcas_dos_perfis') and attname = 'ligado_por' and not attisdropped
  ) then
    raise exception 'public.marcas_dos_perfis já existe e não é do Kakou. Escolha outro nome antes de aplicar.';
  end if;
end $$;

create table if not exists public.marcas_dos_perfis (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  marca_id uuid not null references public.marcas (id),
  ligado_em timestamptz not null default now(),
  ligado_por uuid references public.operadores (id),
  primary key (perfil_id, marca_id)
);
create index if not exists marcas_dos_perfis_marca_idx on public.marcas_dos_perfis (marca_id);

-- Backfill: cada perfil que não é a casa entra na marca 1 da organização (a
-- mais antiga). Só o perfil sem marca nenhuma: rodar de novo depois de alguém
-- tirar a conta de uma marca não a devolve.
insert into public.marcas_dos_perfis (perfil_id, marca_id, ligado_em)
select p.id, m1.id, p.criado_em
  from public.perfis p
  cross join lateral (
    select m.id from public.marcas m where m.organizacao_id = p.organizacao_id order by m.criado_em, m.id limit 1
  ) m1
 where not p.casa
   and not exists (select 1 from public.marcas_dos_perfis mp where mp.perfil_id = p.id)
on conflict (perfil_id, marca_id) do nothing;

-- Perfil novo entra na marca de quem vincula (§4.30): a marca atual do
-- operador logado; pela conexão do sistema (contaNovaDoLinkedin,
-- perfilDoPrimeiroAcesso), a marca atual de quem opera o perfil; sem nenhuma
-- das duas, a única marca da organização. Com mais de uma e sem contexto, o
-- perfil fica sem marca e alguém o liga em Configurações › LinkedIn. A casa
-- nunca entra, e o perfil que vira casa sai das marcas.
create or replace function public.ligar_perfil_na_marca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marca uuid;
  v_ids uuid[];
begin
  if new.casa then
    if tg_op = 'UPDATE' then
      delete from public.marcas_dos_perfis where perfil_id = new.id;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    return new;
  end if;

  v_marca := public.marca_atual();
  if v_marca is not null and not exists (
    select 1 from public.marcas m where m.id = v_marca and m.organizacao_id = new.organizacao_id
  ) then
    v_marca := null;
  end if;

  if v_marca is null and new.operador_id is not null then
    select o.marca_atual_id into v_marca
      from public.operadores o join public.marcas m on m.id = o.marca_atual_id
     where o.id = new.operador_id and o.ativo and m.organizacao_id = new.organizacao_id
       and (o.papel = 'admin' or exists (
             select 1 from public.acessos_das_marcas a where a.operador_id = o.id and a.marca_id = m.id));
  end if;

  if v_marca is null then
    select array_agg(id) into v_ids from public.marcas where organizacao_id = new.organizacao_id;
    if coalesce(array_length(v_ids, 1), 0) = 1 then
      v_marca := v_ids[1];
    end if;
  end if;

  if v_marca is not null then
    insert into public.marcas_dos_perfis (perfil_id, marca_id, ligado_por)
    values (new.id, v_marca, new.operador_id)
    on conflict (perfil_id, marca_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists perfis_na_marca on public.perfis;
create trigger perfis_na_marca after insert or update of casa on public.perfis
  for each row execute function public.ligar_perfil_na_marca();

-- Quantas marcas a conta tem, contando as que o operador não vê. A tela usa
-- para o "e mais N" e para não deixar tirar a última marca, sem mostrar quais
-- são as outras (§4.30, LGPD). Zero para conta que o operador não vê.
create or replace function public.total_de_marcas_do_perfil(p_perfil_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.pode_ver_perfil(p_perfil_id)
    then (select count(*)::int from public.marcas_dos_perfis where perfil_id = p_perfil_id)
    else 0 end;
$$;

-- O mesmo LinkedIn nunca vira dois perfis (§4.30): o teto é por conta (§4.13).
-- A casa fica de fora. Com duplicata no banco, para com a lista: escolher qual
-- perfil fica é decisão humana.
do $$
declare
  v_lista text;
begin
  if to_regclass('public.perfis_um_linkedin') is null then
    select string_agg(format('%s (%s perfis)', linkedin_provider_id, n), ', ') into v_lista
      from (
        select linkedin_provider_id, count(*) as n from public.perfis
         where not casa and linkedin_provider_id is not null
         group by 1 having count(*) > 1
      ) d;
    if v_lista is not null then
      raise exception 'O mesmo LinkedIn está em mais de um perfil: %. Escolha qual perfil fica antes de aplicar.', v_lista;
    end if;
    create unique index perfis_um_linkedin on public.perfis (linkedin_provider_id)
      where not casa and linkedin_provider_id is not null;
  end if;
end $$;

-- Quem vê a marca e a conta lê a ligação; quem liga e tira é o admin ou quem
-- vinculou a conta (operador_id), sempre numa marca e numa conta que vê, da
-- mesma organização, e nunca a casa.
grant select, insert, delete on public.marcas_dos_perfis to authenticated;
revoke all on public.marcas_dos_perfis from anon;
alter table public.marcas_dos_perfis enable row level security;

drop policy if exists marcas_dos_perfis_leitura on public.marcas_dos_perfis;
create policy marcas_dos_perfis_leitura on public.marcas_dos_perfis
  for select to authenticated
  using (public.pode_ver_marca(marca_id) and public.pode_ver_perfil(perfil_id));

drop policy if exists marcas_dos_perfis_ligar on public.marcas_dos_perfis;
create policy marcas_dos_perfis_ligar on public.marcas_dos_perfis
  for insert to authenticated
  with check (
    public.pode_ver_marca(marca_id) and public.pode_ver_perfil(perfil_id)
    and exists (
      select 1 from public.perfis p join public.marcas m on m.id = marca_id
       where p.id = perfil_id and not p.casa and m.organizacao_id = p.organizacao_id
         and (public.eh_admin() or p.operador_id = (select auth.uid()))
    )
  );

drop policy if exists marcas_dos_perfis_tirar on public.marcas_dos_perfis;
create policy marcas_dos_perfis_tirar on public.marcas_dos_perfis
  for delete to authenticated
  using (
    public.pode_ver_marca(marca_id) and public.pode_ver_perfil(perfil_id)
    and (public.eh_admin() or exists (
      select 1 from public.perfis p where p.id = perfil_id and p.operador_id = (select auth.uid())
    ))
  );

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.marcas_dos_perfis to sdr_servidor;
  end if;
end $$;
