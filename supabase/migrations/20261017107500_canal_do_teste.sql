-- O chat de teste guarda o canal (SDR-75 (#64), §4.3 e §4.26). Idempotente.
do $$
begin
  if to_regclass('public.sdr_testes') is null or not exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.sdr_testes') and attname = 'segmento' and not attisdropped
  ) then
    raise exception 'public.sdr_testes não é a tabela do Kakou. Confira antes de aplicar.';
  end if;
end $$;

alter table public.sdr_testes add column if not exists canal text not null default 'linkedin';
alter table public.sdr_testes drop constraint if exists sdr_testes_canal_check;
alter table public.sdr_testes add constraint sdr_testes_canal_check
  check (canal in ('linkedin', 'instagram', 'facebook', 'telegram'));
