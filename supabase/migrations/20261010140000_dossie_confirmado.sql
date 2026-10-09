-- Dossiê confirmado (SDR-24, §4.11): `dossie` passa a ser o rascunho (a última
-- leitura ou a edição humana) e `dossie_confirmado` é o que vale para os
-- públicos, a sequência e o agente. Leitura nova só troca o rascunho.
-- Idempotente.

alter table public.ofertas add column if not exists dossie_confirmado jsonb;
alter table public.ofertas add column if not exists confirmado_em timestamptz;
alter table public.ofertas add column if not exists confirmado_por uuid references public.operadores (id);
