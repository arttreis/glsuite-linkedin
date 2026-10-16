-- Agenda a fila dos disparos (§4.18) a cada minuto pelo pg_cron do Supabase.
-- Rode uma vez por ambiente no SQL Editor, trocando os dois valores abaixo.
-- Não é migration: a URL e o segredo mudam por ambiente e ficam no Vault. O
-- segredo é o mesmo CRON_SECRET do tick.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://SEU-DOMINIO/api/cron/disparos', 'sdr_disparos_url');
-- Se o tick já está agendado, o segredo já existe no Vault como 'sdr_tick_segredo': pule esta linha.
select vault.create_secret('VALOR_DO_CRON_SECRET', 'sdr_tick_segredo');

select cron.schedule(
  'sdr-disparos',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sdr_disparos_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sdr_tick_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);

-- Acompanhar:
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'sdr-disparos')
--    order by start_time desc limit 10;
-- Remover:
--   select cron.unschedule('sdr-disparos');
