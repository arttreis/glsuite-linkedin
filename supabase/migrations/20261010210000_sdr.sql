-- O SDR da organização (SDR-42, §4.3 e §7 do épico de 10/10/2026): como ela
-- conversa no LinkedIn, gerado da análise confirmada e guardado em versões.
-- O agente passa a usar o SDR no lugar da voz e das regras do perfil.
-- Idempotente.

create table if not exists public.sdrs (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null unique references public.organizacoes (id),
  versao int not null default 1 check (versao >= 1),
  sdr jsonb not null,                             -- objetivo, voz, abertura, qualificação, objeções, regras, quando chamar você, link de agenda
  gerado_de_oferta_em timestamptz,                -- confirmação da análise que o SDR levou em conta
  atualizado_por uuid references public.operadores (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Cada versão do SDR, para o histórico de ajustes e o desfazer.
create table if not exists public.sdr_versoes (
  id uuid primary key default gen_random_uuid(),
  sdr_id uuid not null references public.sdrs (id) on delete cascade,
  versao int not null,
  sdr jsonb not null,
  origem text not null check (origem in ('ia', 'humano', 'ajuste', 'desfazer')),
  pedido text,                                    -- o que a pessoa pediu no ajuste
  resumo text,                                    -- o que mudou, numa linha
  por uuid references public.operadores (id),
  em timestamptz not null default now(),
  unique (sdr_id, versao)
);

grant select, insert, update on public.sdrs to authenticated;
grant select, insert on public.sdr_versoes to authenticated;
revoke all on public.sdrs from anon;
revoke all on public.sdr_versoes from anon;
alter table public.sdrs enable row level security;
alter table public.sdr_versoes enable row level security;

drop policy if exists sdrs_da_organizacao on public.sdrs;
create policy sdrs_da_organizacao on public.sdrs
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

drop policy if exists sdr_versoes_da_organizacao on public.sdr_versoes;
create policy sdr_versoes_da_organizacao on public.sdr_versoes
  for all to authenticated
  using (exists (select 1 from public.sdrs s where s.id = sdr_id and s.organizacao_id = public.organizacao_do_operador()))
  with check (exists (select 1 from public.sdrs s where s.id = sdr_id and s.organizacao_id = public.organizacao_do_operador()));

-- Que versão do SDR escreveu cada rascunho (§7).
alter table public.rascunhos add column if not exists sdr_versao int;

-- Instruções extras do SDR que valem só numa campanha (§4.11).
alter table public.campanhas add column if not exists instrucoes_sdr text
  check (instrucoes_sdr is null or char_length(instrucoes_sdr) <= 1000);

-- Banco dividido com o GL Suite: o papel do app só ganha direito nas tabelas novas.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.sdrs to sdr_servidor;
    grant select, insert, update, delete on public.sdr_versoes to sdr_servidor;
  end if;
end $$;
