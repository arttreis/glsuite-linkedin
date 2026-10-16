# guessless-sdr

Fonte da verdade do produto: `docs/epico.md`. Regras de negócio da §4 são
requisito. Um ticket por PR, na ordem da §9.

- Qualquer mudança de regra de negócio atualiza `docs/epico.md` primeiro, no
  mesmo PR do código (§12).
- Interpretações do épico e decisões técnicas ficam em
  `specs/2026-09-29-sdr-linkedin-guessless.md`, seção "Decisões de implementação".
- Branch por ticket: `feature/sdr-XX-<descricao-curta>` (até o Marco D; no
  fluxo de ondas é `ticket/<numero-da-issue>-<slug>`, ver abaixo). Commits convencionais em
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
- Migration em `supabase/migrations/<AAAAMMDDHHMMSS>_<nome>.sql`, aditiva.
- Teste de unidade ao lado do código (`src/domain/foo.ts` → `foo.test.ts`);
  teste que precisa de banco fica em `tests/<área>/` e sobe um Postgres em WASM
  (PGlite) por arquivo, com os falsos de Unipile, WhatsApp, Telegram e modelo
  em `tests/support/`. Nenhum teste fala com serviço externo.

## Gates — o que precisa passar antes de abrir PR

Node 24+ e pnpm 11 (o `packageManager` do `package.json`). Com Node 20 o pnpm
nem sobe. Nesta ordem, na própria worktree:

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

O build não precisa de `.env.local`: o CI roda com
`NEXT_PUBLIC_SUPABASE_URL=https://ci.supabase.co` e
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci`. O mesmo roda no CI
(`.github/workflows/ci.yml`, junto com o gitleaks) contra a `main`. **PR com
CI vermelho não é revisável** — conserte antes de pedir review, não depois.

`pnpm eval` (`.github/workflows/eval.yml`) chama a API da Anthropic e custa
dinheiro: roda sozinho só quando o PR mexe em agente, eval, validador ou
opt-out. Não é gate local.

## Deploy

A Vercel publica produção a cada push na `main`: **merge é deploy**.
`/api/saude` responde `{"ok":true,"versao":"<sha>"}` quando o deploy está de
pé, e a `versao` diz qual commit está no ar. A migration é aplicada no banco do
GL Suite **antes** do merge (issue do projeto, "Como roda"); por isso ela é
sempre aditiva — o código que está no ar tem de continuar funcionando com ela.

## Regras duras para agentes

1. **Escopo do ticket, nada além.** Achou outro bug? Reporte (label
   `follow-up`). Não conserte de carona.
2. **Leia antes de editar.** As convenções que não estão aqui estão no código
   vizinho e no `docs/epico.md`.
3. **Nada de refatoração oportunista** dentro de um ticket de feature.
4. **Não invente env var nem segredo.** Faltou credencial, pare e reporte.
5. **Não mexa na `main` direto.** Todo trabalho nasce em worktree/branch.
6. **Não faça merge do próprio PR.** O gate humano é do Arthur.
7. Ticket ambíguo a ponto de mudar o resultado? Pare, comente a dúvida, não
   adivinhe.
8. Commit passa pelo gitleaks (`.githooks/pre-commit`). Não pule o hook.

## Fluxo de orquestração

Os tickets vivem nas **issues deste repo**: uma issue-pai por projeto (label
`projeto` + `proj-<slug>`), uma sub-issue por ticket, dependências nativas
`blocked_by`. O ticket é o prompt: contexto, escopo, fora-de-escopo, critérios
de aceite, cenários de teste, arquivos afetados, smoke em produção e
observabilidade. O ClickUp (lista **GL Suite › Linkedin SDR › Projetos**,
`1400460000002344`) guarda só uma task-espelho por projeto.

- `/plan-project` — ideia → issues executáveis + grafo de dependências.
- `/orchestrate-project` — executa em ondas gated por merge e por produção.
- Branch `ticket/<numero-da-issue>-<slug>`, numa worktree em `.worktrees/`.
- Todo PR começa com `Closes #<issue>` e cita o ticket do épico (`SDR-XX`).

Comandos e convenções em formato de máquina: `.claude/orchestration.json`.

## Como reportar ao Arthur durante a onda

Ele é o gate de merge, operando com vários agentes em paralelo. Toda resposta
durante a execução responde, nesta ordem: **onde está · o que trava · o que ele
decide**.

- **Painel primeiro, prosa nunca.** Um ticket por linha, sempre com o número
  da issue e o do PR (`#41 → PR #51`) — nunca "aquele do dashboard".
- **Decisão na frente.** Se há algo pra ele decidir, é a primeira linha, não o
  fim do terceiro parágrafo. Pergunta vai com a recomendação colada.
- **Fato checado, não impressão:** "CI verde no run 1892", não "acho que
  passou". `cancelled` não é falha — é run substituído por push.
- **Fale em quatro momentos:** plano da onda pronto · onda fechada · bloqueio
  que exige ele · ele perguntou. Não narre cada worktree criada.
- **Sem "pronto" sem gate verde.** Sem "tudo certo" com um item vermelho — o
  resumo obedece ao pior item.
- **Fecha com o gate dele** — ou com "nada pra você, segue".

Contrato completo, painel canônico e regras de escalada:
`~/.claude/skills/operando/SKILL.md` (`/operando`).

@AGENTS.md
