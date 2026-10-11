# Roadmap · guessless-sdr

Atualizado em 10/10/2026. Fonte da verdade do escopo: `docs/epico.md` (§9).
Decisões de cada ticket: `specs/2026-09-29-sdr-linkedin-guessless.md`.

**Onde estamos:** o épico de 29/09 (SDR-01 a SDR-30, a jornada do Kakou) está
todo na `main`, até o PR #15. Ele foi substituído em 10/10 por um épico novo:
primeiro acesso guiado (site → análise → SDR com chat de teste → leads →
abordagem → permissão → LinkedIn) e o app em cinco telas (Dashboard, Chats,
Pipeline, Campanhas, Configurações), sobre o mesmo motor. Produção em
https://sdr.glsuite.io.

O Marco A (SDR-40 a 46) está em produção desde 10/10, com as migrations
aplicadas. A GuessLess foi zerada no mesmo dia para refazer o primeiro acesso
(ficaram a organização, os operadores e a conta da casa). As URLs passaram a
usar slug em inglês (#25), e as rotas antigas redirecionam.

## 1 · Código (tickets da §9)

| Onda | Ticket | Depende de | Código | PR / merge | Aceite com serviço real |
|---|---|---|---|---|---|
| 1 | SDR-40 Acesso por domínio, organização nova e moldura do primeiro acesso | — | ✅ | ✅ #17, em produção | ⛔ `SUPABASE_SECRET_KEY` (T-5) |
| 2 | SDR-41 Análise do site: negócio, produto e mercado | 40 | ✅ | ✅ #18, em produção | — |
| 2 | SDR-47 Menu novo e Dashboard | 40 | ✅ | ✅ #26, em produção | — |
| 3 | SDR-42 O SDR da organização | 41 | ✅ | ✅ #19, em produção | — |
| 3 | SDR-44 Leads: público e prévia pela conta da casa | 41 | ✅ | ✅ #21, em produção | ⛔ testar a busca com a conta da casa |
| 3 | SDR-48 Chats: a réplica das DMs | 47 | ✅ | ✅ #27, em produção | — |
| 3 | SDR-49 Pipeline | 47 | ✅ | ✅ #28, em produção | — |
| 4 | SDR-43 Chat de teste: você no papel de lead | 42 | ✅ | ✅ #20, em produção | — |
| 4 | SDR-45 Abordagem recomendada e permissão | 42, 44 | ✅ | ✅ #22, em produção | — |
| 4 | SDR-52 O SDR responde sozinho | 42, 48 | ✅ | ⏳ PR aberto | ⛔ Resend (T-4) para o e-mail |
| 5 | SDR-46 Vincular o LinkedIn e começar | 45 | ✅ | ✅ #23, em produção | ⛔ vincular uma conta real pela Unipile |
| 5 | SDR-50 Campanhas | 45, 47 | ✅ | ⏳ PR aberto | — |
| 5 | SDR-51 Configurações | 43, 47 | 🔜 | — | — |
| 6 | SDR-53 Sai o que ficou para trás (RD, praças, telas antigas) | 46, 48 a 52 | 🔜 | — | — |

Legenda: ✅ feito · 🔜 a fazer · ⏳ aguardando · ⛔ bloqueado por algo externo.

## 2 · Travas e decisões que não são código (§8 e §10)

| # | O quê | Bloqueia | Dono | Situação |
|---|---|---|---|---|
| T-1 | Unipile ativa e a conta da casa conectada | SDR-44, SDR-46 | Arthur | ✅ 10/10: chaves na Vercel, conta do Arthur conectada |
| T-2 | Chave da Anthropic na Vercel | análise, SDR, chat de teste, nota, abordagem | Arthur | ✅ 10/10 |
| T-3 | Domínio de produção nas Redirect URLs do Auth do GL Suite | login | Arthur | aberta |
| T-4 | Resend com domínio verificado | aviso de "o SDR chamou você" | Arthur | aberta |
| T-5 | `SUPABASE_SECRET_KEY` do GL Suite na Vercel | primeiro acesso de e-mail novo | Arthur | aberta: não está na Vercel em 10/10 |
| D1 | Qual conta é a conta da casa | SDR-44 | Arthur | ✅ 10/10: a do Arthur, só busca |
| D2 | Tamanho da prévia por organização | SDR-44 | Arthur | padrão 25 |
| D3 | Rampa e teto de conta nova | SDR-46 | Arthur | padrão 8 · 12 · 15 convites/dia, 75/semana |
| D4 | O que faz o SDR chamar você | SDR-52 | Arthur | padrão: preço, reclamação, fora do comum, confiança < 0,7 |
| D5 | Quando abrir o cadastro além de `guessless.com.br` | — | Arthur | depois de cobrança e termos |

## 3 · Como vai ficar

- **Saída do Marco A:** um e-mail `@guessless.com.br` novo entra, informa o
  site e sai do primeiro acesso com o SDR testado, uma lista de leads reais, a
  abordagem aprovada e o LinkedIn vinculado, com a campanha rodando.
- **Saída do Marco B:** o dia a dia em cinco telas. O SDR conversa sozinho; a
  pessoa acompanha no Chats como se fossem as próprias DMs e assume quando
  quiser.
- **Saída do Marco C:** sem RD, sem regras por praça e sem as telas da jornada
  antiga no código.
- **Custo mensal previsto:** Unipile €49 + Claude ~US$ 20 a 40 por conta ativa +
  menos de US$ 1 por primeiro acesso + planos que a casa já tem.
