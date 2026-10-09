-- SDR-19 · Primeiros passos obrigatórios (§4.10).

-- Quando o operador teve a primeira campanha pronta. Enquanto for null, o
-- painel só libera as telas dos primeiros passos. Depois de gravado, o
-- bloqueio não volta, mesmo que a campanha seja pausada.
alter table public.operadores add column if not exists primeira_campanha_em timestamptz;
