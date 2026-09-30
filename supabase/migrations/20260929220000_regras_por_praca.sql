-- SDR-13 · Regras por praça (§4.5).
-- Travas da §8 que o sistema consegue impor. dpa_espanha: DPA assinado (T-4)
-- antes de gravar qualquer nome europeu.
insert into public.configuracoes (chave, valor, descricao) values
  ('travas', '{"dpa_espanha": false}',
   'Travas da §8 impostas pelo sistema. dpa_espanha = true só depois do DPA assinado (T-4).')
on conflict (chave) do nothing;

create index if not exists acoes_tarefas_idx on public.acoes (perfil_id, agendada_para)
  where tipo = 'tarefa_manual' and status = 'pendente';
