-- SDR-08 · Alertas (pausa de perfil, SLA) por e-mail, com fila transacional.
-- O alerta nasce na mesma transação do fato (ex.: a pausa) e o tick envia.
create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  tipo text not null,
  perfil_id uuid references public.perfis (id),
  destinatarios text[] not null default '{}',
  assunto text not null,
  texto text not null,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  tentativas integer not null default 0,
  erro text,
  provider_id text
);

create index if not exists alertas_pendentes_idx on public.alertas (criado_em) where enviado_em is null;

alter table public.alertas enable row level security;
grant select on public.alertas to authenticated;

drop policy if exists alertas_leitura on public.alertas;
create policy alertas_leitura on public.alertas
  for select to authenticated
  using (public.eh_admin() or (perfil_id is not null and public.pode_ver_perfil(perfil_id)));
