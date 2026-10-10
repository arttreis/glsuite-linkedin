-- Vincular o LinkedIn e começar (SDR-46, §4.6 do épico de 10/10/2026).
-- A abordagem do primeiro acesso guarda a campanha que nasceu dela, e quem
-- está levando ela para a conta, para dois avisos ao mesmo tempo (a Unipile e
-- a volta da pessoa) não criarem duas campanhas.
-- Idempotente.

alter table public.abordagens add column if not exists campanha_id uuid references public.campanhas (id);
alter table public.abordagens add column if not exists vinculando_em timestamptz;
