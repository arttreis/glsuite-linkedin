-- Nota de aderência do público sugerido e o tamanho do público no LinkedIn (SDR-55).
-- A nota é da IA, com o motivo, e só existe na sugestão: editar o público apaga.
-- O tamanho é o total que a busca da prévia devolve.
-- Idempotente.

alter table public.publicos
  add column if not exists aderencia smallint check (aderencia between 0 and 100),
  add column if not exists aderencia_motivo text;

alter table public.previas
  add column if not exists total_no_linkedin integer check (total_no_linkedin >= 0);
