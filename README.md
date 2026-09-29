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

## Deploy (Vercel)

Importe o repositório na Vercel (framework Next.js, detectado sozinho) e
cadastre as variáveis do `.env.example` em Production e Preview. `/api/saude`
responde `{"ok":true}` quando o deploy está de pé.

## Qualidade

`pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` rodam no CI a cada PR,
junto com o gitleaks no histórico inteiro.
