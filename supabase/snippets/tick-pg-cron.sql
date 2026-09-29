-- Agenda o tick do despachante a cada 5 minutos pelo pg_cron do Supabase.
-- Rode uma vez por ambiente no SQL Editor, trocando os dois valores abaixo.
-- Não é migration: a URL e o segredo mudam por ambiente e ficam no Vault.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('https://SEU-DOMINIO/api/cron/tick', 'sdr_tick_url');
select vault.create_secret('VALOR_DO_CRON_SECRET', 'sdr_tick_segredo');

select cron.schedule(
  'sdr-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sdr_tick_url'),
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
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'sdr-tick')
--    order by start_time desc limit 10;
--   select id, status_code, timed_out, error_msg, created from net._http_response order by created desc limit 10;
-- Remover:
--   select cron.unschedule('sdr-tick');
-- Limpeza periódica do histórico (a tabela cresce sem limite):
--   delete from cron.job_run_details where end_time < now() - interval '7 days';
