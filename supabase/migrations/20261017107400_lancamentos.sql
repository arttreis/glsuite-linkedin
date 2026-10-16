-- Lançamentos e os módulos do Marco E (SDR-74, §4.14 e §4.21). Os módulos
-- 'instagram', 'facebook' e 'comunidades' entram no catálogo, e os checks que o
-- Marco E inteiro usa mudam aqui, uma vez só, com a lista final: três
-- migrations reescrevendo o mesmo check na mesma onda apagariam o valor uma da
-- outra. A organização da GuessLess ganha os três. E nasce `lancamentos`, já
-- com as colunas dos tickets seguintes (grupos, link, compradores), para eles
-- não precisarem de `alter table`. Aditiva e idempotente.

-- Banco dividido com o GL Suite: tabela de mesmo nome que não é do Kakou para
-- tudo antes de qualquer `create table if not exists` pular em silêncio.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('lancamentos', 'carrinho_abre_em')
  ) as v (tabela, coluna) loop
    if to_regclass('public.' || t.tabela) is not null and not exists (
      select 1 from pg_attribute
       where attrelid = to_regclass('public.' || t.tabela) and attname = t.coluna and not attisdropped
    ) then
      raise exception 'public.% já existe e não é do Kakou. Escolha outro nome antes de aplicar.', t.tabela;
    end if;
  end loop;
end $$;

-- Os checks do Marco E, uma vez só, com a lista final. Os nomes são os que o
-- Postgres deu aos checks de coluna do Marco D (`<tabela>_<coluna>_check`).
alter table public.modulos_da_organizacao drop constraint if exists modulos_da_organizacao_modulo_check;
alter table public.modulos_da_organizacao add constraint modulos_da_organizacao_modulo_check
  check (modulo in ('linkedin', 'whatsapp', 'telegram', 'instagram', 'facebook', 'comunidades'));
alter table public.canais drop constraint if exists canais_tipo_check;
alter table public.canais add constraint canais_tipo_check
  check (tipo in ('whatsapp', 'telegram', 'instagram', 'facebook', 'whatsapp_app'));
alter table public.contatos drop constraint if exists contatos_origem_check;
alter table public.contatos add constraint contatos_origem_check
  check (origem in ('linkedin', 'importacao', 'telegram', 'whatsapp', 'instagram', 'facebook',
                    'grupo_telegram', 'grupo_whatsapp', 'pagina_de_espera', 'checkout'));
-- disparos.canal_tipo fica ('whatsapp', 'telegram'): disparo é só WhatsApp e Telegram (D22).

-- A organização da GuessLess ganha os três.
insert into public.modulos_da_organizacao (organizacao_id, modulo, motivo)
select o.id, m.modulo, 'Organização da GuessLess' from public.organizacoes o
 cross join (values ('instagram'), ('facebook'), ('comunidades')) as m (modulo)
 where o.slug = 'guessless'
on conflict (organizacao_id, modulo) do nothing;

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 40),        -- vira a tag (§4.16: até 40)
  produto text check (char_length(produto) <= 120),
  tag_id uuid references public.tags (id) on delete set null,            -- a tag do lançamento (D29)
  captacao_em timestamptz,
  aulas jsonb not null default '[]' check (jsonb_typeof(aulas) = 'array'),   -- [{"nome", "quando" (ISO em UTC), "link" | null}]
  carrinho_abre_em timestamptz,
  carrinho_fecha_em timestamptz,
  link_do_carrinho text check (link_do_carrinho ~ '^https://'),
  preco text check (char_length(preco) <= 500),
  perguntas jsonb not null default '[]' check (jsonb_typeof(perguntas) = 'array'),   -- [{"pergunta", "resposta"}]
  sdr_sabe text check (char_length(sdr_sabe) <= 2000),                  -- o que mais o SDR sabe (§4.26)
  -- A aparência dos grupos e o link (SDR-76).
  regras text,
  nome_dos_grupos text,
  descricao_dos_grupos text,
  grupos_fechados boolean not null default false,
  aviso_cheio_pct integer not null default 80 check (aviso_cheio_pct between 1 and 100),
  destino_encerrado text check (destino_encerrado ~ '^https://'),
  pixel_id text check (pixel_id ~ '^[0-9]{5,20}$'),
  -- Quem comprou (SDR-77, §4.25).
  produtos jsonb not null default '[]' check (jsonb_typeof(produtos) = 'array'),
  tag_comprador_id uuid references public.tags (id) on delete set null,
  tirar_compradores boolean not null default false,
  status text not null default 'montando' check (status in ('montando', 'no_ar', 'encerrado')),
  no_ar_em timestamptz,
  no_ar_por uuid references public.operadores (id) on delete set null,
  pausado_em timestamptz,                                               -- pausado é no ar com pausa
  pausado_por uuid references public.operadores (id) on delete set null,
  encerrado_em timestamptz,
  encerrado_por uuid references public.operadores (id) on delete set null,   -- null: encerrou sozinho
  criado_em timestamptz not null default now(),
  criado_por uuid references public.operadores (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  constraint lancamentos_carrinho_em_ordem check (carrinho_abre_em is null or carrinho_fecha_em is null or carrinho_fecha_em > carrinho_abre_em),
  constraint lancamentos_no_ar_tem_quando check (status <> 'no_ar' or no_ar_em is not null),
  constraint lancamentos_encerrado_tem_quando check (status <> 'encerrado' or encerrado_em is not null)
);

create index if not exists lancamentos_por_organizacao on public.lancamentos (organizacao_id, criado_em desc);
-- O cron procura os no ar com o carrinho fechado há 7 dias.
create index if not exists lancamentos_no_ar_por_fechamento on public.lancamentos (carrinho_fecha_em) where status = 'no_ar';

drop trigger if exists lancamentos_atualizado_em on public.lancamentos;
create trigger lancamentos_atualizado_em before update on public.lancamentos
  for each row execute function public.tocar_atualizado_em();

-- As tags do lançamento são da organização dele, venha a escrita de onde vier.
create or replace function public.conferir_tags_do_lancamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tag_id is not null
     and (select organizacao_id from public.tags where id = new.tag_id) is distinct from new.organizacao_id then
    raise exception 'A tag é de outra organização.';
  end if;
  if new.tag_comprador_id is not null
     and (select organizacao_id from public.tags where id = new.tag_comprador_id) is distinct from new.organizacao_id then
    raise exception 'A tag é de outra organização.';
  end if;
  return new;
end;
$$;

drop trigger if exists lancamentos_tags_da_organizacao on public.lancamentos;
create trigger lancamentos_tags_da_organizacao before insert or update on public.lancamentos
  for each row execute function public.conferir_tags_do_lancamento();

-- Sem delete para quem está logado: encerrado, os dados ficam (§4.21).
grant select, insert, update on public.lancamentos to authenticated;
revoke all on public.lancamentos from anon;
alter table public.lancamentos enable row level security;

drop policy if exists lancamentos_da_organizacao on public.lancamentos;
create policy lancamentos_da_organizacao on public.lancamentos
  for all to authenticated
  using (organizacao_id = public.organizacao_do_operador())
  with check (organizacao_id = public.organizacao_do_operador());

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.lancamentos to sdr_servidor;
  end if;
end $$;
