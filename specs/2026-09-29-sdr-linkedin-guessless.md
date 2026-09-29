# Spec: SDR de LinkedIn próprio da GuessLess (épico SDR-01…17)

**Data:** 2026-09-29
**Tipo:** feature (produto novo: integração externa + schema + infra)
**Risco:** alto (age em nome de 4 pessoas no LinkedIn; LGPD, CASL e LSSI; CRM)

## Objetivo
Prospectar no LinkedIn pelos 4 perfis da GuessLess com triagem humana, teto por
perfil, detecção de resposta, rascunho com IA aprovado por humano e registro no
RD Station, substituindo o PRIME SDR.

## Escopo
Fonte da verdade do produto: `docs/epico.md` (§5 arquitetura, §6 modelo de
dados, §9 tickets SDR-01…17).

- `src/domain/`: regras puras (calendário, rampa e teto, validador de copy,
  sequência, estados do lead, guardas de conta, regras por praça)
- `src/server/`: banco (Postgres do Supabase), Unipile, RD Station, Claude,
  alertas, despachante, reações a eventos
- `src/app/`: painel Next.js e rotas (cron, webhooks, hosted auth)
- `supabase/migrations/`, `supabase/seed.sql`
- `.github/workflows/ci.yml`

## Critério de aceite
Os "✅ Aceite" de cada ticket da §9 do épico, cada um coberto por teste
automatizado no próprio PR do ticket.

## Restrições
- Regras de negócio da §4 são requisito. Mudança de regra atualiza
  `docs/epico.md` no mesmo PR do código.
- Fora do escopo (§3): e-mail, WhatsApp, InMail, busca por sinal, multi-cliente,
  scraping fora do que a Unipile expõe.
- Nenhum segredo versionado. Nada é enviado a serviço externo real sem
  credenciais e sem as travas da §8 resolvidas.
- Travas T-1…T-6 e decisões D1…D7 não se resolvem em código: viram configuração
  com o default sugerido no épico.

## Output
Um ticket = um branch = um PR (§9). Branches locais empilhados
`feature/sdr-XX-…`, commits convencionais em português. Sem push, sem repositório
remoto e sem deploy até o usuário autorizar.

## Decisões de implementação
Anotadas durante a execução, por ticket.

### SDR-01 · Repositório e esteira
- Stack: Next.js 16.3 (App Router, Turbopack, `proxy.ts` no lugar de
  middleware), React 19.2, TypeScript 5.9, Tailwind 4, pnpm 11, Vitest 5, Node 24.
- Login por magic link do Supabase Auth com cadastro desligado
  (`shouldCreateUser: false` e `enable_signup = false`): só entra operador
  convidado. Sessão verificada com `getClaims()` no proxy (checagem otimista) e
  no layout do painel.
- A URL de retorno do magic link sai de `APP_URL` (ou `VERCEL_BRANCH_URL` em
  preview), nunca de cabeçalho da requisição.
- Variáveis de ambiente lidas com `lerEnv` (zod, validação preguiçosa): o build
  não depende de segredo que só o runtime usa.
- CI no GitHub Actions: lint, typecheck (`next typegen` + `tsc`), testes, build e
  gitleaks no histórico inteiro. Localmente, hook de pre-commit com gitleaks.
- Pendente do aceite: "deploy de preview funcionando" depende de ligar o repo a
  um projeto na Vercel (sem CLI e sem credencial da Vercel nesta sessão).

### SDR-02 · Modelo de dados e seed
- Acesso ao banco pelo `pg` (pooler do Supabase em modo transação) atrás de uma
  porta `Db` mínima (`query` + `transacao`). Regra de negócio fica em TypeScript;
  o SQL garante as invariantes (unicidade, checks, índice parcial).
- Testes rodam as migrations reais no PGlite (Postgres 18 em WASM, sem Docker),
  com um bootstrap que imita o Supabase (roles, `auth.users`, `auth.uid()`).
- RLS por operador: o painel consulta dentro de `comOperador` (role
  `authenticated` + claims do JWT, igual ao PostgREST). Os jobs do sistema usam a
  conexão dona das tabelas. Admin vê tudo; operador vê os perfis de
  `operador_perfis`; todo operador vê a lista de perfis (qualquer um pode pausar,
  §4.4). Auditoria (`eventos`) não aceita update nem delete.
- Seed de perfis, ângulos, feriados e parâmetros em migration (produção também
  precisa), com `on conflict do nothing` para não sobrescrever ajuste do operador.
  `seed.sql` fica só para dados de desenvolvimento.
- "DMs/dia proporcional" do Luiz: mesma razão DM/convite do Brasil em cada
  semana, arredondada para baixo: 11 · 13 · 16.
- JP: `dms_dia = 0` e `modo_resposta = manual` (DM é manual na Espanha).
- Feriados de 2026 e 2027 (o sistema roda em 2027 daqui a 3 meses). Critério e
  fontes em `docs/pesquisa/feriados.md`.
- Estados e colunas além da §6, todos aditivos:
  - status de ação `enviando` (ação reservada pelo despachante, em voo);
  - autor de mensagem `sistema` (DM de template, que não é IA nem humano);
  - `tipo_conta` e `limite_nota_convite` no perfil (a nota do convite é de 200
    caracteres na conta gratuita e 300 na paga);
  - campos operacionais no lead (`chat_id`, `convite_id`, `bloqueio_motivo`,
    `revisao_motivo`, `retorno_apos`…).
- Uma pessoa só fica em uma régua ativa por vez (índice único parcial em
  `leads`).

### SDR-03 · Unipile: contas e webhooks
- API V1 da Unipile (a V2 ainda é beta), atrás da interface `ClienteUnipile`.
  Os testes usam `UnipileFalso`. Referência: `docs/pesquisa/unipile.md`.
- Verificação de origem [verificado]: a V1 não assina webhook. O SDR cadastra o
  header `Unipile-Auth: <UNIPILE_WEBHOOK_SECRET>` na criação do webhook e compara
  em tempo constante. O callback do hosted auth leva o segredo na URL e a conta
  é confirmada na própria Unipile antes de ser ligada ao perfil.
- Idempotência: o webhook é gravado com chave natural (`message_id`,
  conta + provider da relação) e processado com o registro travado; efeito e
  marca de processado vão na mesma transação. Status de conta não tem id: a
  chave usa uma janela de 30 min (cobre as retentativas da Unipile).
- A Unipile recebe 200 assim que o webhook é gravado. Se o processamento falhar,
  o erro fica no registro e o tick retenta (até 10 vezes).
- Pausam o perfil: `CREDENTIALS`, `ERROR`, `STOPPED`, `PERMISSIONS`, `DELETED` e
  `CREATION_FAIL`. Com status diferente de OK a Unipile para de mandar os
  webhooks de mensagem, e seguir a régua às cegas é o erro mais caro (§4.1).
  `CONNECTING` não pausa: o despachante só segura os envios. Nenhum status
  despausa: despausar é manual (§4.4).
- Ao conectar, o tipo da conta (gratuita, premium ou Sales Navigator) vem de
  `GET /users/me` e define o limite da nota do convite (200 ou 300).
- O perfil segue pausado depois de conectar a conta.
