-- SDR-12 · RD Station (funil Comercial · Serviço, §4.9). Só praça Doméstico.
-- Fila transacional: o evento nasce na mesma transação do fato (aprovação,
-- convite, resposta, qualificação, reunião) e o tick sincroniza com o RD.
create table if not exists public.rd_eventos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  etapa text not null check (etapa in ('01', '02', '03', '04', '05')),
  dados jsonb not null default '{}',
  status text not null default 'pendente' check (status in ('pendente', 'feito', 'erro', 'ignorado')),
  tentativas integer not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  processado_em timestamptz,
  unique (lead_id, etapa)
);

create index if not exists rd_eventos_pendentes_idx on public.rd_eventos (criado_em) where status in ('pendente', 'erro');

alter table public.rd_eventos enable row level security;
grant select on public.rd_eventos to authenticated;
drop policy if exists rd_eventos_leitura on public.rd_eventos;
create policy rd_eventos_leitura on public.rd_eventos
  for select to authenticated
  using (public.eh_admin() or exists (
    select 1 from public.leads l where l.id = lead_id and public.pode_ver_perfil(l.perfil_id)
  ));

-- Mapeamento dos ids do RD (trava T-6). Desligado até alguém preencher.
insert into public.configuracoes (chave, valor, descricao) values
  ('rd_station',
   '{"ativo": false, "pipeline_id": null,
     "etapas": {"01": null, "02": null, "03": null, "04": null, "05": null},
     "campos": {"nicho": null, "fonte": null, "praca": null, "originador": null, "angulo": null,
                "dono_conversa": null, "data_reuniao": null},
     "valores": {"fonte": "LinkedIn", "praca": "Doméstico"},
     "usuarios": {}, "deal_source_id": null}',
   'Ids do funil Comercial · Serviço no RD Station (§4.9). "usuarios" liga slug do perfil ou e-mail do operador ao id do usuário no RD.')
on conflict (chave) do nothing;
