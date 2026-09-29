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

## Deploy (Vercel)

Importe o repositório na Vercel (framework Next.js, detectado sozinho) e
cadastre as variáveis do `.env.example` em Production e Preview. `/api/saude`
responde `{"ok":true}` quando o deploy está de pé.

## Qualidade

`pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` rodam no CI a cada PR,
junto com o gitleaks no histórico inteiro.
