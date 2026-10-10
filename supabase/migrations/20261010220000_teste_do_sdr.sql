-- Chat de teste do SDR (SDR-43, §4.3 do épico de 10/10/2026): a pessoa
-- conversa com o SDR no papel de lead e ajusta. Um teste por organização; quem
-- volta encontra a conversa onde parou. "Ficou bom" grava a aprovação do SDR,
-- que conclui o passo 3 do primeiro acesso.
-- Idempotente.

create table if not exists public.sdr_testes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null unique references public.organizacoes (id),
  segmento text not null check (char_length(segmento) between 1 and 80),  -- o tipo de lead que a pessoa faz
  mensagens jsonb not null default '[]' check (jsonb_typeof(mensagens) = 'array'),
  sdr_versao int,                                 -- versão do SDR da última resposta
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

grant select, insert, update, delete on public.sdr_testes to authenticated;
revoke all on public.sdr_testes from anon;
alter table public.sdr_testes enable row level security;
drop policy if exists sdr_testes_da_organizacao on public.sdr_testes;
create policy sdr_testes_da_organizacao on public.sdr_testes
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

alter table public.sdrs add column if not exists aprovado_em timestamptz;
alter table public.sdrs add column if not exists aprovado_por uuid references public.operadores (id);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.sdr_testes to sdr_servidor;
  end if;
end $$;
