-- SDR-28 · Busca de leads com filtros (§4.11).
-- Teto de perfis trazidos pela busca, por perfil do LinkedIn, em 24 horas.
-- O padrão segue a recomendação da Unipile para a busca clássica. 0 desliga.
insert into public.configuracoes (chave, valor, descricao) values
  ('busca', '{"max_perfis_por_dia": 1000}',
   'Busca de leads: perfis trazidos pela busca do LinkedIn por perfil nas últimas 24 horas (0 desliga)')
on conflict (chave) do nothing;

-- A contagem do teto soma os eventos de busca do perfil na janela.
create index if not exists eventos_busca_idx on public.eventos (perfil_id, em) where tipo = 'busca_linkedin';
