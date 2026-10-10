-- Campanha nasce do público (SDR-26, §4.13): campanha = público × conta do
-- LinkedIn, uma por par. O ângulo passa a ser texto livre, vindo do público
-- (§4.9): sai a amarra com a lista fechada em campanhas e leads. A tabela
-- `angulos` fica, como sugestão das campanhas antigas. Idempotente.

alter table public.campanhas add column if not exists publico_id uuid references public.publicos (id);

create unique index if not exists campanhas_uma_por_publico_e_conta
  on public.campanhas (publico_id, perfil_id) where publico_id is not null;

alter table public.campanhas drop constraint if exists campanhas_angulo_fkey;
alter table public.leads drop constraint if exists leads_angulo_fkey;
