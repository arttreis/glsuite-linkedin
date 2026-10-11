-- Sai o RD Station (SDR-53, §3 e §6 do épico de 10/10/2026): o Pipeline é o
-- CRM do Kakou. Saem a fila de eventos para o RD, o id da negociação no lead e
-- a configuração da integração. Idempotente.

drop table if exists public.rd_eventos;
alter table public.leads drop column if exists rd_deal_id;
delete from public.configuracoes where chave = 'rd_station';
