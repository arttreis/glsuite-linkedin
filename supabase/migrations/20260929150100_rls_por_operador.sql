-- SDR-02 · RLS por operador.
-- O painel consulta como o operador logado (role authenticated + claims do JWT).
-- Os jobs do sistema (despachante, webhooks) usam a conexão do dono das tabelas
-- e não passam pelo RLS.
-- Idempotente.

create or replace function public.eh_operador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operadores o
    where o.id = (select auth.uid()) and o.ativo
  );
$$;

create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operadores o
    where o.id = (select auth.uid()) and o.ativo and o.papel = 'admin'
  );
$$;

-- Admin enxerga todos os perfis; operador, os que recebeu em operador_perfis.
create or replace function public.pode_ver_perfil(p_perfil_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_admin() or exists (
    select 1
    from public.operador_perfis op
    join public.operadores o on o.id = op.operador_id
    where op.operador_id = (select auth.uid())
      and op.perfil_id = p_perfil_id
      and o.ativo
  );
$$;

-- Permissões só nas tabelas do SDR, nunca no schema inteiro: o banco pode ser
-- dividido com outro produto (o GL Suite), e um grant ou revoke em "all tables"
-- mexeria nas tabelas dele. Tabela nova do SDR declara o próprio grant.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.operadores, public.perfis, public.operador_perfis, public.angulos, public.campanhas,
  public.pessoas, public.importacoes, public.leads, public.acoes, public.mensagens,
  public.optouts, public.eventos, public.webhooks_recebidos, public.feriados, public.configuracoes
  to authenticated;
grant usage, select on sequence public.eventos_id_seq to authenticated;
revoke all on
  public.operadores, public.perfis, public.operador_perfis, public.angulos, public.campanhas,
  public.pessoas, public.importacoes, public.leads, public.acoes, public.mensagens,
  public.optouts, public.eventos, public.webhooks_recebidos, public.feriados, public.configuracoes
  from anon;

alter table public.operadores enable row level security;
alter table public.operador_perfis enable row level security;
alter table public.perfis enable row level security;
alter table public.angulos enable row level security;
alter table public.campanhas enable row level security;
alter table public.pessoas enable row level security;
alter table public.importacoes enable row level security;
alter table public.leads enable row level security;
alter table public.acoes enable row level security;
alter table public.mensagens enable row level security;
alter table public.optouts enable row level security;
alter table public.eventos enable row level security;
alter table public.webhooks_recebidos enable row level security;
alter table public.feriados enable row level security;
alter table public.configuracoes enable row level security;

-- operadores: todos se enxergam; só o admin cadastra e edita.
drop policy if exists operadores_leitura on public.operadores;
create policy operadores_leitura on public.operadores
  for select to authenticated using (public.eh_operador());
drop policy if exists operadores_escrita on public.operadores;
create policy operadores_escrita on public.operadores
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists operador_perfis_leitura on public.operador_perfis;
create policy operador_perfis_leitura on public.operador_perfis
  for select to authenticated using (operador_id = (select auth.uid()) or public.eh_admin());
drop policy if exists operador_perfis_escrita on public.operador_perfis;
create policy operador_perfis_escrita on public.operador_perfis
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- perfis: qualquer operador vê todos (qualquer um pode pausar, §4.4);
-- configuração só o admin ou o dono do perfil.
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis
  for select to authenticated using (public.eh_operador());
drop policy if exists perfis_edicao on public.perfis;
create policy perfis_edicao on public.perfis
  for update to authenticated
  using (public.eh_admin() or operador_id = (select auth.uid()))
  with check (public.eh_admin() or operador_id = (select auth.uid()));
drop policy if exists perfis_criacao on public.perfis;
create policy perfis_criacao on public.perfis
  for insert to authenticated with check (public.eh_admin());
drop policy if exists perfis_remocao on public.perfis;
create policy perfis_remocao on public.perfis
  for delete to authenticated using (public.eh_admin());

-- Configuração global: leitura para operadores, escrita para o admin.
drop policy if exists angulos_leitura on public.angulos;
create policy angulos_leitura on public.angulos
  for select to authenticated using (public.eh_operador());
drop policy if exists angulos_escrita on public.angulos;
create policy angulos_escrita on public.angulos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists feriados_leitura on public.feriados;
create policy feriados_leitura on public.feriados
  for select to authenticated using (public.eh_operador());
drop policy if exists feriados_escrita on public.feriados;
create policy feriados_escrita on public.feriados
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists configuracoes_leitura on public.configuracoes;
create policy configuracoes_leitura on public.configuracoes
  for select to authenticated using (public.eh_operador());
drop policy if exists configuracoes_escrita on public.configuracoes;
create policy configuracoes_escrita on public.configuracoes
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Dados operacionais: visíveis e editáveis por quem pode ver o perfil.
drop policy if exists campanhas_por_perfil on public.campanhas;
create policy campanhas_por_perfil on public.campanhas
  for all to authenticated
  using (public.pode_ver_perfil(perfil_id)) with check (public.pode_ver_perfil(perfil_id));

drop policy if exists importacoes_por_perfil on public.importacoes;
create policy importacoes_por_perfil on public.importacoes
  for all to authenticated
  using (public.pode_ver_perfil(perfil_id)) with check (public.pode_ver_perfil(perfil_id));

drop policy if exists leads_por_perfil on public.leads;
create policy leads_por_perfil on public.leads
  for all to authenticated
  using (public.pode_ver_perfil(perfil_id)) with check (public.pode_ver_perfil(perfil_id));

drop policy if exists acoes_por_perfil on public.acoes;
create policy acoes_por_perfil on public.acoes
  for all to authenticated
  using (public.pode_ver_perfil(perfil_id)) with check (public.pode_ver_perfil(perfil_id));

drop policy if exists mensagens_por_perfil on public.mensagens;
create policy mensagens_por_perfil on public.mensagens
  for all to authenticated
  using (public.pode_ver_perfil(perfil_id)) with check (public.pode_ver_perfil(perfil_id));

drop policy if exists pessoas_por_perfil on public.pessoas;
create policy pessoas_por_perfil on public.pessoas
  for all to authenticated
  using (public.pode_ver_perfil(dono_perfil_id)) with check (public.pode_ver_perfil(dono_perfil_id));

-- Opt-out: qualquer operador registra (protege todo mundo); leitura por perfil.
drop policy if exists optouts_leitura on public.optouts;
create policy optouts_leitura on public.optouts
  for select to authenticated
  using (public.eh_admin() or (perfil_origem is not null and public.pode_ver_perfil(perfil_origem)));
drop policy if exists optouts_registro on public.optouts;
create policy optouts_registro on public.optouts
  for insert to authenticated with check (public.eh_operador());

-- Eventos: só inserção e leitura. Ninguém edita auditoria.
drop policy if exists eventos_leitura on public.eventos;
create policy eventos_leitura on public.eventos
  for select to authenticated
  using (public.eh_admin() or (perfil_id is not null and public.pode_ver_perfil(perfil_id)));
drop policy if exists eventos_registro on public.eventos;
create policy eventos_registro on public.eventos
  for insert to authenticated
  with check (public.eh_operador() and (perfil_id is null or public.pode_ver_perfil(perfil_id)));

drop policy if exists webhooks_leitura on public.webhooks_recebidos;
create policy webhooks_leitura on public.webhooks_recebidos
  for select to authenticated using (public.eh_admin());
