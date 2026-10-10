-- Primeiro acesso (SDR-40, §4.1 do épico de 10/10/2026).
-- Organização sem primeiro_acesso_em só vê o primeiro acesso (/comecar).
-- Quem já existia e tem conta do LinkedIn conectada entra direto no app.
-- Idempotente.

alter table public.organizacoes add column if not exists primeiro_acesso_em timestamptz;

update public.organizacoes o
   set primeiro_acesso_em = now()
 where o.primeiro_acesso_em is null
   and exists (select 1 from public.perfis p where p.organizacao_id = o.id and p.unipile_account_id is not null);
