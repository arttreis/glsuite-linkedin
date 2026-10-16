-- Disparos (SDR-72, §4.18 e §4.19). Um canal por tipo na organização (o
-- WhatsApp agora; o Telegram no SDR-73), o disparo (uma mensagem para um
-- segmento) e a fila: `envios_do_disparo`, um por contato, congelada na
-- confirmação. A reserva da fila é por prazo (`reservado_ate`); envio
-- interrompido sem a resposta do canal nunca volta sozinho para a fila (vira
-- falha "pode ter chegado"). O que chega pelos canais fica em
-- `mensagens_dos_canais`, e o webhook cru em `webhooks_dos_canais`.
-- Idempotente.

do $$
declare
  t record;
begin
  for t in select * from (values
    ('canais', 'credencial'),
    ('disparos', 'conteudo'),
    ('envios_do_disparo', 'reservado_ate'),
    ('mensagens_dos_canais', 'envio_id'),
    ('webhooks_dos_canais', 'canal_id')
  ) as v (tabela, coluna) loop
    if to_regclass('public.' || t.tabela) is not null and not exists (
      select 1 from pg_attribute
       where attrelid = to_regclass('public.' || t.tabela) and attname = t.coluna and not attisdropped
    ) then
      raise exception 'public.% já existe e não é do Kakou. Escolha outro nome antes de aplicar.', t.tabela;
    end if;
  end loop;
end $$;

create table if not exists public.canais (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  tipo text not null check (tipo in ('whatsapp', 'telegram')),
  nome text not null,                                -- o número (WhatsApp) ou o @ do bot (Telegram)
  status text not null default 'conectado' check (status in ('conectado', 'erro', 'desconectado')),
  credencial text,                                   -- token cifrado (SEGREDOS_CHAVE); sai ao desconectar
  segredo text,                                      -- app secret do WhatsApp, cifrado
  dados jsonb not null default '{}' check (jsonb_typeof(dados) = 'object'),
  boas_vindas text,                                  -- Telegram (SDR-73)
  erro text,
  conectado_em timestamptz not null default now(),
  conectado_por uuid references public.operadores (id) on delete set null,
  verificado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, tipo),
  constraint canais_conectado_tem_credencial check (status = 'desconectado' or credencial is not null)
);

-- Um número do WhatsApp é de uma organização só.
create unique index if not exists canais_um_por_numero on public.canais ((dados ->> 'phoneNumberId'))
  where tipo = 'whatsapp' and status <> 'desconectado';

drop trigger if exists canais_atualizado_em on public.canais;
create trigger canais_atualizado_em before update on public.canais
  for each row execute function public.tocar_atualizado_em();

create table if not exists public.disparos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  canal_id uuid not null references public.canais (id),
  canal_tipo text not null check (canal_tipo in ('whatsapp', 'telegram')),
  nome text not null check (char_length(nome) between 1 and 120),
  segmento_id uuid references public.segmentos (id) on delete set null,
  filtros jsonb not null default '{}',               -- o filtro do segmento na confirmação
  conteudo jsonb not null default '{}',              -- template e variáveis (WhatsApp) | texto e botão (Telegram)
  status text not null default 'rascunho'
    check (status in ('rascunho', 'agendado', 'enviando', 'pausado', 'concluido', 'cancelado')),
  motivo_pausa text,
  agendado_para timestamptz,
  confirmado_em timestamptz,
  confirmado_por uuid references public.operadores (id) on delete set null,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  total integer not null default 0,
  criado_por uuid references public.operadores (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint disparos_confirmado_tem_quem check (status = 'rascunho' or (confirmado_em is not null and agendado_para is not null))
);

create index if not exists disparos_por_organizacao on public.disparos (organizacao_id, criado_em desc);
create index if not exists disparos_na_fila on public.disparos (agendado_para) where status in ('agendado', 'enviando');

drop trigger if exists disparos_atualizado_em on public.disparos;
create trigger disparos_atualizado_em before update on public.disparos
  for each row execute function public.tocar_atualizado_em();

create table if not exists public.envios_do_disparo (
  id uuid primary key default gen_random_uuid(),
  disparo_id uuid not null references public.disparos (id) on delete cascade,
  contato_id uuid not null references public.contatos (id) on delete cascade,
  destino text not null,                             -- +55… (WhatsApp) | id do chat (Telegram)
  nome text not null,                                -- como era na confirmação
  texto text,                                        -- a mensagem como sai para este contato
  parametros jsonb,                                  -- os componentes do template, já preenchidos
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'falhou', 'pulado', 'cancelado')),
  motivo text,                                       -- por que pulou ou falhou, em português
  codigo_erro text,                                  -- o código do canal
  provider_message_id text,                          -- wamid | chat:mensagem
  tentativas integer not null default 0,
  reservado_ate timestamptz,
  tentar_apos timestamptz,
  enviado_em timestamptz,
  entregue_em timestamptz,
  lido_em timestamptz,
  respondido_em timestamptz,
  falhou_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (disparo_id, contato_id)
);

create index if not exists envios_na_fila on public.envios_do_disparo (disparo_id, status) where status in ('pendente', 'enviando');
create unique index if not exists envios_por_mensagem on public.envios_do_disparo (provider_message_id) where provider_message_id is not null;
create index if not exists envios_do_contato on public.envios_do_disparo (contato_id, enviado_em desc);

create table if not exists public.mensagens_dos_canais (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  canal_id uuid not null references public.canais (id) on delete cascade,
  contato_id uuid references public.contatos (id) on delete set null,
  direcao text not null check (direcao in ('entrada', 'saida')),
  texto text not null default '',
  provider_message_id text not null,
  envio_id uuid references public.envios_do_disparo (id) on delete set null,   -- o envio que ela responde
  em timestamptz not null,
  payload jsonb,
  unique (canal_id, provider_message_id)
);

create index if not exists mensagens_dos_canais_do_contato on public.mensagens_dos_canais (contato_id, em desc);

create table if not exists public.webhooks_dos_canais (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references public.canais (id) on delete cascade,
  chave text not null unique,                        -- idempotência: entrega repetida vira no-op
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  tentativas integer not null default 0,
  erro text
);

create index if not exists webhooks_dos_canais_pendentes on public.webhooks_dos_canais (recebido_em) where processado_em is null;

-- O contato guarda como o WhatsApp o identifica: o wa_id que volta no envio e o
-- id de usuário (BSUID) dos webhooks, que pode vir sem telefone desde 04/2026.
alter table public.contatos add column if not exists whatsapp_wa_id text;
alter table public.contatos add column if not exists whatsapp_usuario_id text;
create index if not exists contatos_por_wa_id on public.contatos (organizacao_id, whatsapp_wa_id) where whatsapp_wa_id is not null;
create index if not exists contatos_por_usuario_do_whatsapp on public.contatos (organizacao_id, whatsapp_usuario_id) where whatsapp_usuario_id is not null;

insert into public.configuracoes (chave, valor, descricao) values
  ('disparos',
   '{"janela": {"inicio": "08:00", "fim": "21:00", "fuso": "America/Sao_Paulo"}, "intervalo_horas": 24, "por_segundo": {"whatsapp": 20, "telegram": 20}, "lote": 40, "tentativas": 3, "reserva_segundos": 120}',
   'Disparos (§4.18, D17): janela de envio, intervalo mínimo entre dois disparos do mesmo canal para o mesmo contato, ritmo por canal, tamanho do lote, tentativas por envio e prazo da reserva'),
  ('whatsapp',
   '{"precos": {"marketing": 0.0625, "utility": 0.0068, "authentication": 0.0068}, "moeda": "USD", "tabela_em": "2026-10-16"}',
   'WhatsApp (§4.19): preço por mensagem entregue no Brasil, para a estimativa da tela. Quem cobra é a Meta, direto da organização (docs/pesquisa/whatsapp-cloud-api.md)')
on conflict (chave) do nothing;

-- O painel lê o canal sem as credenciais: o grant é só das colunas que podem
-- aparecer (grant na tabela inteira valeria para todas). Conectar e
-- desconectar é pela conexão do sistema, depois de conferir que é o admin.
grant select (id, organizacao_id, tipo, nome, status, dados, boas_vindas, erro, conectado_em, conectado_por, verificado_em, atualizado_em)
  on public.canais to authenticated;
grant select, insert, update, delete on public.disparos to authenticated;
grant select on public.envios_do_disparo, public.mensagens_dos_canais to authenticated;
revoke all on public.canais, public.disparos, public.envios_do_disparo, public.mensagens_dos_canais, public.webhooks_dos_canais from anon;
alter table public.canais enable row level security;
alter table public.disparos enable row level security;
alter table public.envios_do_disparo enable row level security;
alter table public.mensagens_dos_canais enable row level security;
alter table public.webhooks_dos_canais enable row level security;

-- Quem não é da organização não vê nada. A fila e os webhooks escrevem pela
-- conexão do sistema.
drop policy if exists canais_da_organizacao on public.canais;
create policy canais_da_organizacao on public.canais
  for select to authenticated using (organizacao_id = public.organizacao_do_operador());

drop policy if exists disparos_da_organizacao on public.disparos;
create policy disparos_da_organizacao on public.disparos
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

drop policy if exists envios_do_disparo_da_organizacao on public.envios_do_disparo;
create policy envios_do_disparo_da_organizacao on public.envios_do_disparo
  for select to authenticated
  using (exists (select 1 from public.disparos d where d.id = disparo_id));

drop policy if exists mensagens_dos_canais_da_organizacao on public.mensagens_dos_canais;
create policy mensagens_dos_canais_da_organizacao on public.mensagens_dos_canais
  for select to authenticated using (organizacao_id = public.organizacao_do_operador());

-- webhooks_dos_canais: sem policy, ninguém logado lê.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.canais, public.disparos, public.envios_do_disparo,
      public.mensagens_dos_canais, public.webhooks_dos_canais to sdr_servidor;
  end if;
end $$;
