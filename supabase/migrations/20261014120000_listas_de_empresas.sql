-- Listas de empresas (SDR-59, §4.11): nomes de empresas que a organização
-- guarda para a busca de várias campanhas procurar pessoas só nelas. Cada
-- empresa é procurada no LinkedIn: 'achada' (id da página), 'escolher' (até 5
-- opções para o humano), 'sem_pagina' (a busca vai pelo nome) ou ainda
-- 'a_procurar'. Idempotente.

create table if not exists public.listas_de_empresas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null,
  criado_por uuid references public.operadores (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists listas_de_empresas_por_organizacao on public.listas_de_empresas (organizacao_id);

create table if not exists public.empresas_da_lista (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.listas_de_empresas (id) on delete cascade,
  nome text not null,                             -- como veio na planilha
  chave text not null,                            -- chaveDaEmpresa(nome): repetida entra uma vez
  situacao text not null default 'a_procurar' check (situacao in ('a_procurar', 'achada', 'escolher', 'sem_pagina')),
  linkedin_id text,                               -- página escolhida ou achada
  linkedin_nome text,
  opcoes jsonb not null default '[]' check (jsonb_typeof(opcoes) = 'array'),  -- [{id, nome}] da procura
  procurada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (lista_id, chave)
);

grant select, insert, update, delete on public.listas_de_empresas to authenticated;
grant select, insert, update, delete on public.empresas_da_lista to authenticated;
revoke all on public.listas_de_empresas from anon;
revoke all on public.empresas_da_lista from anon;
alter table public.listas_de_empresas enable row level security;
alter table public.empresas_da_lista enable row level security;

drop policy if exists listas_de_empresas_da_organizacao on public.listas_de_empresas;
create policy listas_de_empresas_da_organizacao on public.listas_de_empresas
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

drop policy if exists empresas_da_lista_da_organizacao on public.empresas_da_lista;
create policy empresas_da_lista_da_organizacao on public.empresas_da_lista
  for all to authenticated
  using (exists (
    select 1 from public.listas_de_empresas l
     where l.id = lista_id and l.organizacao_id = public.organizacao_do_operador()
  ))
  with check (exists (
    select 1 from public.listas_de_empresas l
     where l.id = lista_id and l.organizacao_id = public.organizacao_do_operador()
  ));

-- Banco dividido com o GL Suite: o papel do app só ganha direito nas tabelas novas.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.listas_de_empresas to sdr_servidor;
    grant select, insert, update, delete on public.empresas_da_lista to sdr_servidor;
  end if;
end $$;
