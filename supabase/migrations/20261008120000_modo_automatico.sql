-- SDR-17 · Modo automático por perfil (§4.8, gate da §7.1).

-- Desde quando o perfil está no modo atual: é o relógio das "2 semanas em
-- aprovacao" do gate. Perfis que já existiam contam desde a ativação.
alter table public.perfis add column if not exists modo_desde timestamptz;
update public.perfis set modo_desde = coalesce(ativado_em, now()) where modo_desde is null;
alter table public.perfis alter column modo_desde set default now();
alter table public.perfis alter column modo_desde set not null;

-- Resultado do eval por praça (SDR-16), registrado pelo admin a partir do
-- relatorio.json da rodada. O gate lê a rodada mais recente da praça do perfil
-- para a versão atual dos prompts.
create table if not exists public.evals (
  id uuid primary key default gen_random_uuid(),
  praca text not null check (praca in ('domestico', 'canada', 'espanha')),
  versao_dos_prompts text not null,
  versao_do_juiz text not null,
  veredito text not null check (veredito in ('aprovado', 'reprovado', 'inconclusivo')),
  casos int not null,
  custo_usd double precision not null,
  motivos jsonb not null default '[]',
  gerado_em timestamptz not null,
  registrado_por uuid references public.operadores (id),
  registrado_em timestamptz not null default now()
);

create index if not exists evals_praca_idx on public.evals (praca, versao_dos_prompts, gerado_em desc);

alter table public.evals enable row level security;
revoke all on public.evals from anon;
grant select, insert on public.evals to authenticated;

drop policy if exists evals_leitura on public.evals;
create policy evals_leitura on public.evals
  for select to authenticated using (public.eh_operador());
drop policy if exists evals_registro on public.evals;
create policy evals_registro on public.evals
  for insert to authenticated with check (public.eh_admin());

-- Banco dividido com o GL Suite: o papel do app só ganha direito na tabela nova.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'sdr_servidor') then
    grant select, insert, update, delete on public.evals to sdr_servidor;
  end if;
end $$;

-- Parâmetros do gate e do rebaixamento automático (interpretação na spec, SDR-17).
update public.configuracoes
   set valor = '{"amostra_minima_aprovacao": 20, "limiar_erro": 0.10, "janela_erro_dias": 7, "amostra_minima_erro": 10}'::jsonb || valor,
       descricao = 'Gate do modo automático (§7.1): edição/rejeição abaixo do limiar em N dias de aprovacao, com amostra mínima; rebaixa para aprovacao se a taxa de erro das mensagens automáticas passar do limiar'
 where chave = 'gate_automatico';
