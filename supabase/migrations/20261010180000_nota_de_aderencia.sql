-- Nota de aderência (SDR-28, §4.13): cada lead em triagem de um público ganha
-- uma nota de 0 a 100 e o motivo, só com o que a busca trouxe. A nota de corte
-- da aprovação em lote é configuração (D9, padrão 70). Idempotente.

alter table public.leads add column if not exists nota smallint check (nota is null or nota between 0 and 100);
alter table public.leads add column if not exists nota_motivo text;
alter table public.leads add column if not exists nota_em timestamptz;

update public.configuracoes
   set valor = valor || '{"nota_de_corte": 70}'::jsonb
 where chave = 'busca' and not (valor ? 'nota_de_corte');
