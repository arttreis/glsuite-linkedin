-- Oferta da organização (jornada do Kakou, passo 1): o site lido e o dossiê
-- que a IA monta a partir dele. Uma oferta por organização.
-- Idempotente.

create table if not exists public.ofertas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null unique references public.organizacoes (id),
  url text not null check (url ~ '^https?://'),
  status text not null default 'lendo' check (status in ('lendo', 'pronta', 'erro')),
  dossie jsonb,                                   -- último dossiê bom; uma leitura que falha não apaga
  fontes jsonb not null default '[]' check (jsonb_typeof(fontes) = 'array'),
  erro text,
  modelo text,
  uso jsonb,
  custo_usd numeric(10, 4),
  leitura_iniciada_em timestamptz not null default now(),
  gerado_em timestamptz,
  editado_por uuid references public.operadores (id),
  editado_em timestamptz,
  criado_por uuid references public.operadores (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

grant select, insert, update on public.ofertas to authenticated;
revoke all on public.ofertas from anon;
alter table public.ofertas enable row level security;

drop policy if exists ofertas_da_organizacao on public.ofertas;
create policy ofertas_da_organizacao on public.ofertas
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

insert into public.configuracoes (chave, valor, descricao) values
  ('dossie', '{"ativo": true, "max_paginas": 8}',
   'Leitura do site para o dossiê da oferta: liga e desliga, e quantas páginas a IA pode abrir por leitura')
on conflict (chave) do nothing;
