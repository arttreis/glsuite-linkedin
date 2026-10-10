-- Busca a partir do público (SDR-27, §4.13 e §4.3): a busca editável fica na
-- campanha; o perfil guarda até quando a busca dele está suspensa por erro de
-- limite do LinkedIn (os envios seguem); o teto de resultados por dia é
-- configuração (D8). Idempotente.

alter table public.campanhas add column if not exists busca jsonb;
alter table public.perfis add column if not exists busca_suspensa_ate timestamptz;

insert into public.configuracoes (chave, valor, descricao) values
  ('busca', '{"max_resultados_dia": 100}',
   'Busca de pessoas no LinkedIn a partir do público: quantos resultados cada perfil pode buscar por dia (D8)')
on conflict (chave) do nothing;
