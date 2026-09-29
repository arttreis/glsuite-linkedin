# guessless-sdr

Fonte da verdade do produto: `docs/epico.md`. Regras de negócio da §4 são
requisito. Um ticket por PR, na ordem da §9.

- Qualquer mudança de regra de negócio atualiza `docs/epico.md` primeiro, no
  mesmo PR do código (§12).
- Interpretações do épico e decisões técnicas ficam em
  `specs/2026-09-29-sdr-linkedin-guessless.md`, seção "Decisões de implementação".
- Branch por ticket: `feature/sdr-XX-<descricao-curta>`. Commits convencionais em
  português (`feat(despachante): ...`).

## Comandos

```bash
pnpm dev          # painel em http://localhost:3000
pnpm lint
pnpm typecheck    # next typegen + tsc
pnpm test         # vitest (sem serviços externos)
pnpm build
```

## Estrutura

- `src/app/`: painel (App Router) e rotas de API (webhooks, cron, saúde).
- `src/lib/`: utilitários sem dependência de servidor (env, redirecionamento).
- `src/server/`: tudo que só roda no servidor (Supabase, banco, integrações).
- `supabase/`: config do CLI, migrations e seed.
- Testes ficam ao lado do código (`*.test.ts`); `tests/` guarda stubs e suporte.

## Convenções

- Nomes de domínio em português, iguais aos do épico (`perfis`, `acoes`,
  `agendada_para`); termos técnicos em inglês quando for o nome da API.
- Variável de ambiente nova entra no `.env.example` no mesmo PR, lida via
  `lerEnv` (validação preguiçosa com zod).
- Next.js 16: middleware se chama `proxy.ts`. Leia `node_modules/next/dist/docs/`
  antes de usar uma API do Next.

@AGENTS.md
