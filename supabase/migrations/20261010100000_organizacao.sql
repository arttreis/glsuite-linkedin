-- Organização como raiz (jornada do Kakou).
-- Toda organização enxerga só o que é dela: perfis, operadores e, por eles,
-- campanhas, leads, ações, mensagens, eventos, alertas e o que vai para o RD.
-- O admin é admin da própria organização, não do banco.
-- angulos, feriados e configuracoes continuam globais por enquanto.
-- Idempotente.

create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null check (char_length(nome) between 2 and 80),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

insert into public.organizacoes (slug, nome) values ('guessless', 'GuessLess')
on conflict (slug) do nothing;

alter table public.operadores add column if not exists organizacao_id uuid references public.organizacoes (id);
update public.operadores set organizacao_id = (select id from public.organizacoes where slug = 'guessless')
 where organizacao_id is null;
alter table public.operadores alter column organizacao_id set not null;
create index if not exists operadores_organizacao_idx on public.operadores (organizacao_id);

alter table public.perfis add column if not exists organizacao_id uuid references public.organizacoes (id);
update public.perfis set organizacao_id = (select id from public.organizacoes where slug = 'guessless')
 where organizacao_id is null;
alter table public.perfis alter column organizacao_id set not null;
create index if not exists perfis_organizacao_idx on public.perfis (organizacao_id);

-- Perfil ou operador inserido sem organização entra na organização única.
-- Com mais de uma organização, quem insere tem de dizer qual. Mantém o seed e o
-- SQL de "operador novo" do handoff funcionando enquanto só existe a GuessLess.
create or replace function public.preencher_organizacao_unica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if new.organizacao_id is null then
    select array_agg(id) into v_ids from public.organizacoes;
    if coalesce(array_length(v_ids, 1), 0) <> 1 then
      raise exception 'Informe a organização: existem % organizações.', coalesce(array_length(v_ids, 1), 0);
    end if;
    new.organizacao_id := v_ids[1];
  end if;
  return new;
end;
$$;

drop trigger if exists perfis_organizacao_unica on public.perfis;
create trigger perfis_organizacao_unica before insert on public.perfis
  for each row execute function public.preencher_organizacao_unica();
drop trigger if exists operadores_organizacao_unica on public.operadores;
create trigger operadores_organizacao_unica before insert on public.operadores
  for each row execute function public.preencher_organizacao_unica();

-- Organização do operador logado. Null para quem não é operador ativo.
create or replace function public.organizacao_do_operador()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.organizacao_id from public.operadores o
  where o.id = (select auth.uid()) and o.ativo;
$$;

-- Perfil da organização do operador e, para quem não é admin, recebido em
-- operador_perfis.
create or replace function public.pode_ver_perfil(p_perfil_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    where p.id = p_perfil_id and p.organizacao_id = public.organizacao_do_operador()
  ) and (
    public.eh_admin() or exists (
      select 1
      from public.operador_perfis op
      join public.operadores o on o.id = op.operador_id
      where op.operador_id = (select auth.uid())
        and op.perfil_id = p_perfil_id
        and o.ativo
    )
  );
$$;

grant select, update on public.organizacoes to authenticated;
revoke all on public.organizacoes from anon;
alter table public.organizacoes enable row level security;

drop policy if exists organizacoes_leitura on public.organizacoes;
create policy organizacoes_leitura on public.organizacoes
  for select to authenticated using (id = public.organizacao_do_operador());
drop policy if exists organizacoes_edicao on public.organizacoes;
create policy organizacoes_edicao on public.organizacoes
  for update to authenticated
  using (id = public.organizacao_do_operador() and public.eh_admin())
  with check (id = public.organizacao_do_operador() and public.eh_admin());

drop policy if exists operadores_leitura on public.operadores;
create policy operadores_leitura on public.operadores
  for select to authenticated using (organizacao_id = public.organizacao_do_operador());
drop policy if exists operadores_escrita on public.operadores;
create policy operadores_escrita on public.operadores
  for all to authenticated
  using (public.eh_admin() and organizacao_id = public.organizacao_do_operador())
  with check (public.eh_admin() and organizacao_id = public.organizacao_do_operador());

drop policy if exists operador_perfis_leitura on public.operador_perfis;
create policy operador_perfis_leitura on public.operador_perfis
  for select to authenticated
  using (operador_id = (select auth.uid()) or (public.eh_admin() and public.pode_ver_perfil(perfil_id)));
drop policy if exists operador_perfis_escrita on public.operador_perfis;
create policy operador_perfis_escrita on public.operador_perfis
  for all to authenticated
  using (public.eh_admin() and public.pode_ver_perfil(perfil_id))
  with check (public.eh_admin() and public.pode_ver_perfil(perfil_id));

-- perfis: todo operador vê os da organização (qualquer um pode pausar, §4.4);
-- configuração só o admin ou o dono do perfil.
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis
  for select to authenticated using (organizacao_id = public.organizacao_do_operador());
drop policy if exists perfis_edicao on public.perfis;
create policy perfis_edicao on public.perfis
  for update to authenticated
  using (organizacao_id = public.organizacao_do_operador() and (public.eh_admin() or operador_id = (select auth.uid())))
  with check (organizacao_id = public.organizacao_do_operador() and (public.eh_admin() or operador_id = (select auth.uid())));
drop policy if exists perfis_criacao on public.perfis;
create policy perfis_criacao on public.perfis
  for insert to authenticated
  with check (public.eh_admin() and organizacao_id = public.organizacao_do_operador());
drop policy if exists perfis_remocao on public.perfis;
create policy perfis_remocao on public.perfis
  for delete to authenticated
  using (public.eh_admin() and organizacao_id = public.organizacao_do_operador());

-- Auditoria e alertas: o admin deixa de ver tudo do banco e passa a ver o da
-- organização, que pode_ver_perfil já cobre.
drop policy if exists optouts_leitura on public.optouts;
create policy optouts_leitura on public.optouts
  for select to authenticated
  using (perfil_origem is not null and public.pode_ver_perfil(perfil_origem));

drop policy if exists eventos_leitura on public.eventos;
create policy eventos_leitura on public.eventos
  for select to authenticated
  using (perfil_id is not null and public.pode_ver_perfil(perfil_id));

drop policy if exists alertas_leitura on public.alertas;
create policy alertas_leitura on public.alertas
  for select to authenticated
  using (perfil_id is not null and public.pode_ver_perfil(perfil_id));

drop policy if exists rd_eventos_leitura on public.rd_eventos;
create policy rd_eventos_leitura on public.rd_eventos
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id and public.pode_ver_perfil(l.perfil_id)));

-- O painel não lê webhooks brutos: sem policy, ninguém logado lê.
drop policy if exists webhooks_leitura on public.webhooks_recebidos;
