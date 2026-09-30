-- SDR-15 · Pesquisa do prospect e T1 personalizado.
insert into public.configuracoes (chave, valor, descricao) values
  ('pesquisa', '{"max_por_dia": 20, "proporcao_personalizada": 0.5}',
   'T1 personalizado: pesquisas (visitas de perfil) por perfil por dia e fração do A/B que vai para o braço personalizado')
on conflict (chave) do nothing;

create index if not exists acoes_t1_ia_idx on public.acoes (criada_em)
  where tipo = 'convite' and origem = 'ia' and status = 'pendente' and texto_gerado is null;
