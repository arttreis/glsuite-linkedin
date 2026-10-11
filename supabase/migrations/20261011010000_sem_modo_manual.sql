-- O SDR responde sozinho (SDR-52, §4.7 do épico de 10/10/2026): a conta ou
-- responde sozinha (`automatico`) ou a pessoa aprova cada resposta
-- (`aprovacao`). O modo `manual` sai; quem estava nele passa a aprovar.
-- Idempotente.

update public.perfis set modo_resposta = 'aprovacao' where modo_resposta = 'manual';

alter table public.perfis drop constraint if exists perfis_modo_resposta_check;
alter table public.perfis add constraint perfis_modo_resposta_check
  check (modo_resposta in ('aprovacao', 'automatico'));
