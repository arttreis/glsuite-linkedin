-- Passagem de bastão (SDR-66, §4.7): quando o SDR passa a conversa para a
-- pessoa, o rascunho que passou guarda o que ela recebe e os prazos.
-- - passada_em: o lead foi para escalado_humano por esta decisão (o relógio
--   do lembrete e do aviso ao admin começa aqui);
-- - resumo (até 3 linhas) e sugestao (resposta sugerida pelo SDR);
-- - ponte: o texto curto que o SDR manda antes de parar; ponte_excecao diz por
--   que ela não saiu (caso sem ponte, validador). A ação da ponte fica em acao_id;
-- - lembrete_em e admin_avisado_em: cada aviso sai uma vez por passagem.
-- Aditiva e idempotente.

alter table public.rascunhos add column if not exists passada_em timestamptz;
alter table public.rascunhos add column if not exists resumo text;
alter table public.rascunhos add column if not exists sugestao text;
alter table public.rascunhos add column if not exists ponte text;
alter table public.rascunhos add column if not exists ponte_excecao text;
alter table public.rascunhos add column if not exists lembrete_em timestamptz;
alter table public.rascunhos add column if not exists admin_avisado_em timestamptz;

create index if not exists rascunhos_passagens on public.rascunhos (lead_id, passada_em) where passada_em is not null;
