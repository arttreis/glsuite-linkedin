-- Objetivo da organização (SDR-67, §4.2.1 do épico): o que vender pelo
-- LinkedIn e o que o SDR deve fazer, respondido no primeiro acesso entre a
-- análise e o SDR. Um por organização. As respostas são rascunho até a pessoa
-- confirmar o resumo; a versão confirmada fica à parte, como na análise do
-- site. Aditiva e idempotente.

create table if not exists public.objetivos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null unique references public.organizacoes (id),
  respostas jsonb not null,                       -- rascunho: {produtos, principal, acao, quem_atende, duracao, nunca}
  resumo text,                                    -- o resumo da IA para as respostas do rascunho; null quando elas mudam
  confirmado jsonb,                               -- respostas confirmadas + resumo; é o que o SDR usa
  confirmado_em timestamptz,
  confirmado_por uuid references public.operadores (id),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.operadores (id)
);

grant select, insert, update on public.objetivos to authenticated;
revoke all on public.objetivos from anon;
alter table public.objetivos enable row level security;
drop policy if exists objetivos_da_organizacao on public.objetivos;
create policy objetivos_da_organizacao on public.objetivos
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

-- Que confirmação do objetivo o SDR levou em conta: mudou depois, a tela
-- oferece gerar o SDR de novo (nunca gera sozinha).
alter table public.sdrs add column if not exists gerado_de_objetivo_em timestamptz;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.objetivos to sdr_servidor;
  end if;
end $$;
