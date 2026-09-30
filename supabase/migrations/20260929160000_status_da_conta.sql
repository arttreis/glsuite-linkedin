-- SDR-03 · Quando o status da conta na Unipile mudou pela última vez.
alter table public.perfis add column if not exists unipile_status_em timestamptz;
