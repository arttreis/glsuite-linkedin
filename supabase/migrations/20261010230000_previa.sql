-- Leads do primeiro acesso pela conta da casa (SDR-44, §4.4 do épico de 10/10/2026).
-- A conta da casa só busca: o despachante, a pesquisa e as campanhas a ignoram.
-- A prévia fica guardada à parte, uma por organização, e só vira lead quando
-- a organização vincula o LinkedIn dela (SDR-46).
-- Idempotente.

alter table public.perfis add column if not exists casa boolean not null default false;

-- A conta da casa é a do Arthur (D1), já conectada. Perfil sem conta não vira casa.
update public.perfis
   set casa = true
 where slug = 'arthur' and unipile_account_id is not null and not casa
   and organizacao_id = (select id from public.organizacoes where slug = 'guessless');

create table if not exists public.previas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null unique references public.organizacoes (id),
  publico_id uuid references public.publicos (id),
  status text not null default 'buscando' check (status in ('buscando', 'pronta', 'sem_nomes')),
  pessoas jsonb not null default '[]' check (jsonb_typeof(pessoas) = 'array'),  -- quem a busca trouxe, com nota e marcação
  buscadas int not null default 0 check (buscadas >= 0),  -- soma de todas as buscas da prévia (teto por organização)
  motivo text,                                    -- por que ficou sem nomes
  regiao jsonb,                                   -- {id, nome} do LinkedIn que a busca usou
  iniciada_em timestamptz not null default now(),
  confirmada_em timestamptz,                      -- "seguir com estas pessoas": passo 4 feito
  atualizado_em timestamptz not null default now()
);

grant select, insert, update on public.previas to authenticated;
revoke all on public.previas from anon;
alter table public.previas enable row level security;
drop policy if exists previas_da_organizacao on public.previas;
create policy previas_da_organizacao on public.previas
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

insert into public.configuracoes (chave, valor, descricao) values
  ('previa', '{"max_pessoas": 25}',
   'Prévia de leads do primeiro acesso pela conta da casa (§4.4, D2): no máximo tantas pessoas por organização, somando todas as buscas')
on conflict (chave) do nothing;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.previas to sdr_servidor;
  end if;
end $$;
