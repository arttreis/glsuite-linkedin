-- Análise do site (SDR-41, §4.2 do épico de 10/10/2026).
-- O dossiê ganha "mercado" dentro do próprio jsonb (sem coluna nova). A leitura
-- passa a gravar o progresso enquanto lê: as páginas já abertas e a etapa
-- (lendo páginas ou montando a análise), para a tela acompanhar.
-- Idempotente.

alter table public.ofertas
  add column if not exists leitura_progresso jsonb not null default '{"etapa": "paginas", "paginas": []}'::jsonb;
