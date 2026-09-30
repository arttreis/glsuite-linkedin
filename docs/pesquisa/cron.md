# Tick do despachante a cada 5 min: Vercel Cron ou pg_cron

Pesquisa em fontes oficiais, 29/09/2026. Resolve o "[verificar frequência
permitida no plano]" da §5.

## Vercel Cron

| Plano | Jobs por projeto | Intervalo mínimo | Precisão |
|---|---|---|---|
| Hobby | 100 | **1 vez por dia** | ±59 min |
| Pro / Enterprise | 100 | 1 vez por minuto | dentro do minuto |

- No Hobby, um cron que roda mais de uma vez por dia **faz o deploy falhar**
  ("Hobby accounts are limited to daily cron jobs").
- Roda só no deploy de **produção**, nunca em preview.
- Manda `Authorization: Bearer <CRON_SECRET>` quando a variável `CRON_SECRET`
  existe. É o que o `/api/cron/tick` confere.
- Não há retentativa e a entrega é "best effort" (pode perder ou duplicar
  execução). O tick é idempotente e tem trava com prazo.

Fontes: [usage-and-pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[manage-cron-jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
[changelog de 20/01/2026](https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan).

## pg_cron + pg_net (Supabase): o padrão do SDR

Funciona em qualquer plano do Supabase, com intervalo mínimo de 1 segundo. O SQL
para rodar uma vez por ambiente está em `supabase/snippets/tick-pg-cron.sql`.
Ele guarda a URL e o segredo no Vault e chama o endpoint a cada 5 minutos.

Atenção no plano Free: projeto parado há 1 semana é pausado, e aí o cron não
roda.

Fontes: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[Vault](https://supabase.com/docs/guides/database/vault).

## Escolha

- **Padrão: pg_cron.** Não depende do plano da Vercel e não quebra o deploy.
- **Vercel Pro:** se preferir, crie `vercel.ts` com
  `crons: [{ path: '/api/cron/tick', schedule: '*/5 * * * *' }]` e desligue o
  job do pg_cron. Os dois ao mesmo tempo não dão problema, porque a trava do tick
  segura, mas é desperdício.
