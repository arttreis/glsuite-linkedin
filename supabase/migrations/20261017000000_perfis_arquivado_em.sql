-- Excluir uma conta do LinkedIn (SDR-125, §4.12). Apagar a linha de perfis não
-- dá: eventos, leads, ações, mensagens e conversas apontam para ela. Excluir é
-- arquivar: com arquivado_em preenchido, o perfil some das listas do painel e
-- o histórico fica. Nulo é ativo no painel, então o código no ar segue igual.
-- Idempotente.

alter table public.perfis add column if not exists arquivado_em timestamptz;
