-- Abordagem recomendada e permissão (SDR-45, §4.5 do épico de 10/10/2026).
-- No primeiro acesso ainda não há conta nem campanha: a abordagem fica
-- guardada à parte, uma por organização, com a permissão de quem disse "pode
-- entrar em contato". Ela vira o fluxo da campanha quando a organização
-- vincula o LinkedIn (SDR-46), e a permissão vai junto para a campanha.
-- Idempotente.

create table if not exists public.abordagens (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null unique references public.organizacoes (id),
  publico_id uuid not null references public.publicos (id),
  textos jsonb not null,                          -- {convite, mensagens: [T2, T3, T4], motivo}
  problemas jsonb not null default '[]' check (jsonb_typeof(problemas) = 'array'),  -- o que ainda impede de seguir
  gerada_em timestamptz,
  editada_em timestamptz,
  editada_por uuid references public.operadores (id),
  permitida_em timestamptz,                       -- "pode entrar em contato"
  permitida_por uuid references public.operadores (id),
  atualizado_em timestamptz not null default now()
);

grant select, insert, update on public.abordagens to authenticated;
revoke all on public.abordagens from anon;
alter table public.abordagens enable row level security;
drop policy if exists abordagens_da_organizacao on public.abordagens;
create policy abordagens_da_organizacao on public.abordagens
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

-- Nada sai sem permissão (§4.5): quem permitiu e quando, na campanha.
alter table public.campanhas add column if not exists permitida_em timestamptz;
alter table public.campanhas add column if not exists permitida_por uuid references public.operadores (id);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.abordagens to sdr_servidor;
  end if;
end $$;
