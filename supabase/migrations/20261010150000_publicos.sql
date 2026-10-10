-- Públicos (SDR-25, §4.12): hipóteses de venda da organização, quem compra e
-- por quê. A IA sugere (status 'sugerido'); só o que um humano escolhe ou cria
-- ('ativo') vira campanha. Idempotente.

create table if not exists public.publicos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id),
  nome text not null,
  quem jsonb not null,                            -- {cargos[], senioridade}
  empresa jsonb not null,                         -- {setores[], porte, regiao}
  por_que jsonb not null,                         -- {dor, gatilho, resultado}
  angulo text not null,
  provas jsonb not null default '[]' check (jsonb_typeof(provas) = 'array'),  -- textos do dossiê confirmado
  quem_nao_e text not null default '',
  praca text not null check (praca in ('domestico', 'canada', 'espanha')),
  origem text not null check (origem in ('ia', 'humano')),
  status text not null check (status in ('sugerido', 'ativo', 'arquivado')),
  dossie_base_em timestamptz,                     -- confirmação do dossiê que o público levou em conta
  escolhido_por uuid references public.operadores (id),
  escolhido_em timestamptz,
  editado_por uuid references public.operadores (id),
  editado_em timestamptz,
  criado_por uuid references public.operadores (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists publicos_por_organizacao on public.publicos (organizacao_id, status);

grant select, insert, update, delete on public.publicos to authenticated;
revoke all on public.publicos from anon;
alter table public.publicos enable row level security;

drop policy if exists publicos_da_organizacao on public.publicos;
create policy publicos_da_organizacao on public.publicos
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

-- Banco dividido com o GL Suite: o papel do app só ganha direito na tabela nova.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.publicos to sdr_servidor;
  end if;
end $$;
