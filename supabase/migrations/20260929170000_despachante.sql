-- SDR-06 · Despachante.

-- Trava com prazo (lease) para dois ticks não rodarem ao mesmo tempo. O pooler
-- em modo transação não segura advisory lock de sessão, por isso uma tabela.
create table if not exists public.travas (
  nome text primary key,
  ate timestamptz not null,
  dono text not null
);
alter table public.travas enable row level security;

-- Contagem do saldo do dia: ações enviadas ou em voo por perfil e tipo.
create index if not exists acoes_saldo_idx on public.acoes (perfil_id, tipo, status, enviada_em);
-- "Nunca dois toques no mesmo dia para a mesma pessoa": toques por lead.
create index if not exists acoes_toques_idx on public.acoes (lead_id, enviada_em) where toque is not null;

insert into public.configuracoes (chave, valor, descricao) values
  ('conta_estavel_minutos', '30',
   'Depois que a conta volta a ficar saudável na Unipile, espera este tempo antes de enviar (as mensagens do período desconectado chegam primeiro)')
on conflict (chave) do nothing;
