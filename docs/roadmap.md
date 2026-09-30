# Roadmap · guessless-sdr

Atualizado em 30/09/2026 (fim do dia). Fonte da verdade do escopo: `docs/epico.md` (§9).
Decisões de cada ticket: `specs/2026-09-29-sdr-linkedin-guessless.md`.

**Onde estamos:** 16 de 17 tickets com código pronto e testado (347 testes
verdes), em branches empilhadas no GitHub. Nenhum PR aberto. O painel está no
ar para teste em https://guessless-sdr.vercel.app, com o banco dividido com o
GL Suite. Falta o SDR-17, as chaves das integrações e as travas da §8.
Detalhes em `docs/handoff-2026-09-30.md`.

## 1 · Código (tickets da §9)

| Marco | Ticket | Código | PR / merge | Aceite com serviço real |
|---|---|---|---|---|
| M0 · Fundação | SDR-01 Repositório e esteira | ✅ | ⏳ não aberto | ⛔ preview na Vercel |
| M0 | SDR-02 Modelo de dados e seed | ✅ | ⏳ | ⛔ aplicar no Supabase |
| M0 | SDR-03 Unipile: contas e webhooks | ✅ | ⏳ | ⛔ conectar o LinkedIn do Arthur (T-1) |
| M1 · Paridade PRIME SDR | SDR-04 Importação e triagem | ✅ | ⏳ | — |
| M1 | SDR-05 Campanhas e validador | ✅ | ⏳ | — |
| M1 | SDR-06 Despachante | ✅ | ⏳ | ⛔ pg_cron no Supabase |
| M1 | SDR-07 Reações a eventos | ✅ | ⏳ | — |
| M1 | SDR-08 Guardas de conta | ✅ | ⏳ | ⛔ Resend para os alertas |
| M2 · Conversa assistida | SDR-09 Inbox | ✅ | ⏳ | ⛔ mensagem aparecer no LinkedIn |
| M2 | SDR-10 Agente de conversa | ✅ | ⏳ | ⛔ chave da Anthropic |
| M2 | SDR-11 Fila de aprovação | ✅ | ⏳ | — |
| M3 · Operação da casa | SDR-12 RD Station | ✅ | ⏳ | ⛔ token e funil do RD (T-6) |
| M3 | SDR-13 Regras por praça | ✅ | ⏳ | — |
| M3 | SDR-14 Métricas | ✅ | ⏳ | — |
| M4 · Personalização | SDR-15 T1 personalizado (A/B) | ✅ | ⏳ | ⛔ chave da Anthropic |
| M4 | SDR-16 Eval de conversas | ✅ | ⏳ | ⛔ chave da Anthropic (1ª rodada real + revisão humana) |
| M4 | SDR-17 Modo automático por perfil | 🔜 próximo | — | depende do gate da §7.1 |

Legenda: ✅ feito · 🔜 a fazer · ⏳ aguardando · ⛔ bloqueado por algo externo.

## 2 · Próximos passos, em ordem

| # | Passo | Quem | Situação |
|---|---|---|---|
| 1 | Liberar `https://guessless-sdr.vercel.app/**` nas Redirect URLs do Auth do GL Suite | Arthur | ⏳ sem isso o login não volta para o painel |
| 2 | Testar o painel com arthur@ (operador) e midia@ (admin) | Arthur | ⏳ |
| 3 | Chaves na Vercel: Unipile, Anthropic, Resend, RD | Arthur passa, Claude cadastra | ⏳ |
| 4 | 1ª rodada real do eval (`pnpm eval`) e revisão humana do `revisao.json` | Claude + Arthur | depende da chave da Anthropic |
| 5 | SDR-17 · Modo automático por perfil (gate gravado em tabela, a confirmar) | Claude | seu ok no desenho |
| 6 | Abrir os 16 PRs empilhados e ver o CI rodar | Claude | seu ok |
| 7 | Revisar e mergear na ordem SDR-01 → SDR-16 | Arthur | passo 6 |
| 8 | Ligar o tick (pg_cron ou Vercel Cron) | Claude | depois da Unipile e do teste |
| 9 | Conectar o LinkedIn do Arthur e rodar a 1ª campanha de template | Arthur + Claude | T-1, D3 |
| 10 | Ligar o RD e fazer Juliano entrar em `aprovacao` | Arthur, Juliano | T-6, T-2 |
| 11 | Ativar Luiz e JP | Arthur, Luiz, JP | T-3, T-4, T-5 |
| 12 | Sair do banco do GL Suite para um projeto próprio em São Paulo | Claude | quando houver cota ou plano Pro |

## 3 · Travas e decisões que não são código (§8 e §10)

| # | O quê | Bloqueia | Dono | Situação |
|---|---|---|---|---|
| T-1 | Conta Unipile e perfis conectados; IP por país | M1 | Arthur | aberta |
| T-2 | Juliano de acordo com a IA no modo `aprovacao` | Juliano em M2 | Juliano | aberta |
| T-3 | Acordo de parceria com Luiz e JP | Luiz e JP | Arthur | aberta |
| T-4 | DPA assinado (o sistema já bloqueia importar na Espanha) | JP | Arthur | aberta |
| T-5 | Postura CASL e LSSI confirmada | Luiz e JP | Luiz, JP | aberta |
| T-6 | Token do RD e funil Comercial · Serviço | M3 | Arthur | aberta |
| D3 | Rampa e teto do perfil do Arthur | ativar Arthur | Arthur | padrão: igual ao Juliano, 75/semana |
| D1, D2, D4–D7 | Link de agenda, rascunho pro JP, cooldown, alerta, limiar, triagem | — | vários | rodando com o padrão do épico, muda por configuração |

## 4 · Como vai ficar

- **Saída do M1:** perfil do Arthur rodando uma campanha de template, igual ao PRIME SDR.
- **Saída do M3:** Arthur e Juliano rodando com RD; Luiz e JP prontos para ativar quando T-3, T-4 e T-5 caírem.
- **Saída do M4:** T1 personalizado em A/B e modo automático ligado por perfil, só depois do eval e de 2 semanas com edição < 10%.
- **Custo mensal previsto:** Unipile €49 + Claude ~US$ 20–40 por perfil ativo + planos que a casa já tem.
