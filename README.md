# guessless-sdr

SDR de LinkedIn próprio da GuessLess. Prospecta pelos 4 perfis da casa (Arthur,
Juliano, Luiz e JP), respeita o teto de cada perfil, detecta resposta, rascunha
a conversa com IA para um humano aprovar e registra no RD Station CRM.

O produto está descrito em [`docs/epico.md`](docs/epico.md), que é a fonte da
verdade. As decisões de implementação ficam em [`specs/`](specs/).

## Rodando localmente

Requisitos: Node 24+, pnpm 11+, [gitleaks](https://github.com/gitleaks/gitleaks)
(o hook de pre-commit bloqueia commit sem ele).

```bash
pnpm install                 # também ativa os hooks de .githooks/
cp .env.example .env.local   # preencha com as chaves do Supabase
pnpm dev
```

## Supabase

- Crie o projeto e preencha `NEXT_PUBLIC_SUPABASE_URL` e
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Authentication → Sign In / Providers: deixe e-mail ligado e **cadastro
  desligado**. Os operadores são convidados pelo painel do Supabase
  (Authentication → Users → Invite).
- Authentication → URL Configuration: `Site URL` = URL de produção e, em
  `Redirect URLs`, `https://<produção>/auth/callback`,
  `https://*-<time>.vercel.app/auth/callback` (previews) e
  `http://localhost:3000/auth/callback`.

### Banco

As migrations ficam em `supabase/migrations/` e são idempotentes. Elas criam o
modelo de dados (§6), o RLS por operador e o seed dos 4 perfis (pausados),
ângulos, feriados e parâmetros. Para aplicar no projeto remoto:

```bash
supabase link --project-ref <ref>
supabase db push
```

### Operadores

Depois de convidar a pessoa pelo Supabase Auth, cadastre-a como operador no SQL
Editor. O admin enxerga todos os perfis; o operador, só os que receber em
`operador_perfis`.

```sql
insert into public.operadores (id, nome, email, papel)
select id, 'Arthur', email, 'admin' from auth.users where email = 'arthur@exemplo.com';

-- Dono do perfil (recebe os alertas) e acesso de um operador a um perfil:
update public.perfis set operador_id = (select id from public.operadores where email = 'arthur@exemplo.com')
 where slug = 'arthur';
insert into public.operador_perfis (operador_id, perfil_id)
select o.id, p.id from public.operadores o, public.perfis p
 where o.email = 'luiz@exemplo.com' and p.slug = 'luiz';
```

## Unipile (LinkedIn)

1. Preencha `UNIPILE_DSN`, `UNIPILE_API_KEY` e `UNIPILE_WEBHOOK_SECRET`
   (gere um aleatório, ex.: `openssl rand -hex 24`).
2. Em **Perfis**, o admin clica em "Registrar webhooks na Unipile" uma vez por
   ambiente. Isso cria os webhooks de mensagem, convite aceito e status da conta,
   com o header secreto.
3. Cada operador clica em "Conectar LinkedIn" no próprio perfil e faz o login no
   assistente da Unipile. O perfil continua **pausado** depois de conectar:
   ativar é sempre um ato humano.

Detalhes da API e dos webhooks: [`docs/pesquisa/unipile.md`](docs/pesquisa/unipile.md).

## Despachante (tick a cada 5 min)

O `/api/cron/tick` sincroniza o status das contas, retenta webhooks atrasados,
reconcilia ações presas e envia no máximo uma ação por perfil ativo. Ele exige
`Authorization: Bearer <CRON_SECRET>`.

- **Padrão:** pg_cron do Supabase. Rode `supabase/snippets/tick-pg-cron.sql` uma
  vez por ambiente.
- Vercel Cron só serve no plano Pro: no Hobby, cron de 5 min quebra o deploy.
  Detalhes em [`docs/pesquisa/cron.md`](docs/pesquisa/cron.md).

## Guardas e alertas

- O perfil pausa sozinho nestes casos (§4.4):
  - a conta cai na Unipile ou dá checkpoint;
  - o erro de limite do LinkedIn se repete;
  - a taxa de aceite em 3 dias úteis fica abaixo de 15% (com amostra mínima);
  - o aceite cai de forma brusca.

  Os parâmetros ficam na configuração `guardas`.
- A pausa gera alerta por e-mail (Resend) para o dono do perfil
  (`perfis.email_alerta` ou o e-mail do operador dono) e para
  `alerta_admin_email`. Preencha a configuração:
  ```sql
  update public.configuracoes set valor = '"arthur@exemplo.com"' where chave = 'alerta_admin_email';
  ```
- Na página inicial, qualquer operador pausa qualquer perfil. Despausar (e a
  primeira ativação, que inicia a semana 1 da rampa) é manual e fica em `eventos`
  com o operador.

## Agente de conversa (Claude)

Quando a pessoa responde, o agente (§7) segue estes passos:

1. Pedido claro para parar ("pare de me mandar mensagem", "stop messaging me",
   "deja de enviarme") vira opt-out global no próprio processamento do webhook,
   antes de qualquer IA.
2. O `IA_MODELO_CLASSIFICACAO` (padrão `claude-haiku-4-5`) classifica a
   mensagem.
3. O `IA_MODELO_RASCUNHO` (padrão `claude-sonnet-5`) decide e rascunha.
4. O texto passa pelo validador e segue o modo do perfil:
   - manual: vira sugestão na inbox;
   - aprovação: vai para a fila;
   - automático: é agendado. Preço, reclamação, opt-out ambíguo, baixa confiança
     e violação do validador vão para a fila.

Os prompts ficam em `src/server/agente/prompts.ts`, com versão gravada em cada
rascunho. Voz e regras de cada perfil ficam em `perfis.voz_md` e
`perfis.regras_md`. A oferta fica na configuração `oferta_vigente`.

### Modo automático (gate da §7.1)

Em **Perfis**, cada operador troca o modo de resposta dos perfis que opera.
Para ligar o `automatico`, três condições precisam valer:

- o perfil está há 14 dias em `aprovacao`;
- teve pelo menos 20 rascunhos decididos nesse período, com edição e
  rejeição abaixo de 10%;
- o eval da praça foi aprovado na versão atual dos prompts.

Sem isso, a troca é bloqueada e o painel mostra o que falta. Para registrar o
eval, o admin sobe o `relatorio.json` da rodada (`pnpm eval`) em
"Registrar eval".

O tick devolve o perfil para `aprovacao` sozinho, com alerta, quando mais de
10% das mensagens automáticas dos últimos 7 dias dão erro. Erro é a mensagem
que o validador barrou, que falhou ou que foi seguida de opt-out. Os
parâmetros ficam na configuração `gate_automatico`. Na Espanha não existe
modo automático.

### T1 personalizado (campanha `personalizada`)

Na aprovação da triagem, cada lead é sorteado para um braço do A/B: o T1 da
campanha (template) ou uma nota escrita pela IA. A fração do braço
personalizado fica em `pesquisa.proporcao_personalizada` (padrão 0,5). Para o
braço personalizado, o tick pesquisa o perfil e os posts recentes na Unipile,
dentro da janela do perfil e até `pesquisa.max_por_dia` visitas por perfil
(padrão 20). Depois gera os ganchos e escreve a nota, que passa pelo validador
e vai para a fila de aprovação. Nada sai sem humano. A comparação de aceite
fica em Métricas, na tabela "Template × personalizado".

## RD Station (funil Comercial · Serviço)

Só leads da praça Doméstico vão para o RD (§4.9): triagem aprovada → 01 · Alvo,
convite → 02 · Tocado, resposta → 03 · Conversa, qualificado → 04, reunião →
05 · Discovery.

1. Preencha `RD_STATION_TOKEN`, com o token de um usuário de visibilidade Geral.
2. Em **Integrações** (admin), clique em "Descobrir ids no RD". Copie para o
   mapeamento os ids do funil, das etapas 01 a 05, dos campos personalizados
   (Nicho, Fonte, Praça, Originador, Ângulo de abertura, Dono da conversa, Data
   da reunião) e dos usuários (por slug do perfil). Marque `"ativo": true`.
3. Os eventos acumulados desde a triagem sincronizam no próximo tick.

A negociação é da empresa: um segundo decisor da mesma empresa entra como
anotação na mesma negociação, e a etapa nunca volta. Detalhes da API em
[`docs/pesquisa/rd-station.md`](docs/pesquisa/rd-station.md).

## Deploy (Vercel)

Importe o repositório na Vercel (framework Next.js, detectado sozinho) e
cadastre as variáveis do `.env.example` em Production e Preview. `/api/saude`
responde `{"ok":true}` quando o deploy está de pé.

## Qualidade

`pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` rodam no CI a cada PR,
junto com o gitleaks no histórico inteiro.
