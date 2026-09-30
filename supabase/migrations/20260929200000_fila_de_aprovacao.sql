-- SDR-11 · Fila de aprovação: quem decidiu, quando e como. É o dado da taxa de
-- edição por perfil (§7.1, gate do modo automático). O texto original fica em
-- texto_gerado e o que saiu, em texto_final.
alter table public.acoes add column if not exists decisao_humana text
  check (decisao_humana in ('aprovada', 'editada', 'rejeitada'));
alter table public.acoes add column if not exists decidida_por uuid references public.operadores (id);
alter table public.acoes add column if not exists decidida_em timestamptz;

create index if not exists acoes_decisoes_idx on public.acoes (perfil_id, decidida_em) where decisao_humana is not null;
create index if not exists acoes_revisao_idx on public.acoes (perfil_id, criada_em) where status = 'aguardando_aprovacao';
