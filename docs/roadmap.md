# Roadmap · guessless-sdr

Atualizado em 10/10/2026. Fonte da verdade do escopo: `docs/epico.md` (§9).
Decisões de cada ticket: `specs/2026-09-29-sdr-linkedin-guessless.md`.

**Onde estamos:** o épico de 29/09 (SDR-01 a SDR-30, a jornada do Kakou) está
todo na `main`, até o PR #15. Ele foi substituído em 10/10 por um épico novo:
primeiro acesso guiado (site → análise → SDR com chat de teste → leads →
abordagem → permissão → LinkedIn) e o app em cinco telas (Dashboard, Chats,
Pipeline, Campanhas, Configurações), sobre o mesmo motor. Produção em
https://sdr.glsuite.io.

## 1 · Código (tickets da §9)

| Onda | Ticket | Depende de | Código | PR / merge | Aceite com serviço real |
|---|---|---|---|---|---|
| 1 | SDR-40 Acesso por domínio, organização nova e moldura do primeiro acesso | — | ✅ | ⏳ PR aberto | ⛔ `SUPABASE_SECRET_KEY` (T-5) |
| 2 | SDR-41 Análise do site: negócio, produto e mercado | 40 | 🔜 | — | — |
| 2 | SDR-47 Menu novo e Dashboard | 40 | 🔜 | — | — |
| 3 | SDR-42 O SDR da organização | 41 | 🔜 | — | — |
| 3 | SDR-44 Leads: público e prévia pela conta da casa | 41 | 🔜 | — | — |
| 3 | SDR-48 Chats: a réplica das DMs | 47 | 🔜 | — | — |
| 3 | SDR-49 Pipeline | 47 | 🔜 | — | — |
| 4 | SDR-43 Chat de teste: você no papel de lead | 42 | 🔜 | — | — |
| 4 | SDR-45 Abordagem recomendada e permissão | 42, 44 | 🔜 | — | — |
| 4 | SDR-52 O SDR responde sozinho | 42, 48 | 🔜 | — | ⛔ Resend (T-4) |
| 5 | SDR-46 Vincular o LinkedIn e começar | 45 | 🔜 | — | — |
| 5 | SDR-50 Campanhas | 45, 47 | 🔜 | — | — |
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
| T-5 | `SUPABASE_SECRET_KEY` do GL Suite na Vercel | primeiro acesso de e-mail novo | Arthur | aberta |
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
