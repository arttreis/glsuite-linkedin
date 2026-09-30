-- SDR-10 · Agente de conversa (§7).

-- Uma execução do agente por mensagem da pessoa: classificação, decisão,
-- rascunho, o que foi feito com ele e o custo. É o dado do eval e da taxa de
-- edição (SDR-11, SDR-16, SDR-17).
create table if not exists public.rascunhos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  perfil_id uuid not null references public.perfis (id),
  mensagem_id uuid not null unique references public.mensagens (id),
  modo text not null check (modo in ('manual', 'aprovacao', 'automatico')),
  categoria text check (categoria in (
    'interesse', 'pergunta', 'objecao', 'nao', 'optout', 'fora_do_escritorio', 'irrelevante'
  )),
  confianca_categoria double precision,
  sinais jsonb,
  acao_sugerida text check (acao_sugerida in (
    'responder', 'propor_reuniao', 'encerrar', 'registrar_optout', 'escalar_humano'
  )),
  texto text,
  motivo text,
  estagio_sugerido text check (estagio_sugerido in ('03', '04', '05')),
  confianca double precision,
  validacao jsonb,
  excecao text,
  acao_id uuid references public.acoes (id),
  resultado text not null default 'processando' check (resultado in (
    'processando', 'sugestao', 'na_fila', 'agendado', 'optout_registrado', 'escalado',
    'sem_resposta_necessaria', 'descartado', 'erro'
  )),
  modelos jsonb,
  uso jsonb,
  tentativas integer not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists rascunhos_lead_idx on public.rascunhos (lead_id, criado_em);
create index if not exists rascunhos_perfil_idx on public.rascunhos (perfil_id, criado_em);

create or replace trigger rascunhos_atualizado_em
  before update on public.rascunhos
  for each row execute function public.tocar_atualizado_em();

alter table public.rascunhos enable row level security;
grant select, insert, update, delete on public.rascunhos to authenticated;

drop policy if exists rascunhos_por_perfil on public.rascunhos;
create policy rascunhos_por_perfil on public.rascunhos
  for all to authenticated
  using (public.pode_ver_perfil(perfil_id)) with check (public.pode_ver_perfil(perfil_id));

-- Categoria da mensagem da pessoa, dada pelo agente. Resposta automática de
-- ausência não abre SLA.
alter table public.mensagens add column if not exists categoria text;

insert into public.configuracoes (chave, valor, descricao) values
  ('oferta_vigente',
   '"Diagnóstico gratuito de 30 minutos sobre margem por canal de venda."',
   'Oferta que o agente pode citar quando a pessoa quer saber o que a casa faz (§7)'),
  ('agente',
   '{"limiar_optout": 0.8, "limiar_confianca": 0.7, "atraso_minutos": [3, 10]}',
   'Limiares do agente: opt-out pela IA, confiança mínima no modo automático, atraso humano do envio automático')
on conflict (chave) do nothing;
