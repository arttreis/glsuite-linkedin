-- Concorrentes (SDR-68, §4.2): a lista de contra quem a organização disputa o
-- cliente, confirmada por um humano no primeiro acesso ou em Configurações.
-- Fica na oferta, ao lado da análise de onde ela nasce:
--   concorrentes            a lista confirmada ([{nome, descricao, site, origem}]);
--                           null = nunca confirmada (a tela parte das alternativas do Mercado)
--   concorrentes_leituras   leitura do site de cada concorrente, pelo domínio:
--                           {"dominio": {status, em, analise, paginas}}. Cada chave
--                           é uma vaga do teto de concorrentes analisados.
-- Aditiva e idempotente: nada muda para quem já existe. Organização que já
-- passou do passo SDR não volta (a regra está em `estadoDoPrimeiroAcesso`).

alter table public.ofertas add column if not exists concorrentes jsonb
  check (concorrentes is null or jsonb_typeof(concorrentes) = 'array');
alter table public.ofertas add column if not exists concorrentes_confirmados_em timestamptz;
alter table public.ofertas add column if not exists concorrentes_confirmados_por uuid references public.operadores (id);
alter table public.ofertas add column if not exists concorrentes_leituras jsonb not null default '{}'::jsonb
  check (jsonb_typeof(concorrentes_leituras) = 'object');
