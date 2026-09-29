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
