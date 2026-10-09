# Roadmap · guessless-sdr

Atualizado em 09/10/2026. Fonte da verdade do escopo: `docs/epico.md` (§9).
Decisões de cada ticket: `specs/2026-09-29-sdr-linkedin-guessless.md`.

**Onde estamos:** do SDR-01 ao SDR-16, tudo foi mergeado na `main` pelo PR #1;
do SDR-17 ao SDR-21 (Marco 5: painel guiado, inbox completa e fluxo com
blocos), pelo PR #2. O Marco 6 (jornada do Kakou: site → dossiê → públicos →
busca com nota → fluxo gerado) começou: SDR-22 e SDR-23 entraram pelo PR #3,
e a jornada revisada nos docs pelo PR #4. O SDR-24 está em PR. As migrations
até `20261010120000_ofertas` estão aplicadas no banco por SQL (conferido em
09/10); a `20261010140000_dossie_confirmado`, do SDR-24, ainda não. O painel está no ar para teste em
https://guessless-sdr.vercel.app, com o banco dividido com o GL Suite. Faltam
as chaves das integrações e as travas da §8. Detalhes em
`docs/handoff-2026-09-30.md`.

## 1 · Código (tickets da §9)

| Marco | Ticket | Código | PR / merge | Aceite com serviço real |
|---|---|---|---|---|
| M0 · Fundação | SDR-01 Repositório e esteira | ✅ | ✅ #1 | ⛔ preview na Vercel |
| M0 | SDR-02 Modelo de dados e seed | ✅ | ✅ #1 | ⛔ aplicar no Supabase |
| M0 | SDR-03 Unipile: contas e webhooks | ✅ | ✅ #1 | ⛔ conectar o LinkedIn do Arthur (T-1) |
| M1 · Paridade PRIME SDR | SDR-04 Importação e triagem | ✅ | ✅ #1 | — |
| M1 | SDR-05 Campanhas e validador | ✅ | ✅ #1 | — |
| M1 | SDR-06 Despachante | ✅ | ✅ #1 | ⛔ pg_cron no Supabase |
| M1 | SDR-07 Reações a eventos | ✅ | ✅ #1 | — |
| M1 | SDR-08 Guardas de conta | ✅ | ✅ #1 | ⛔ Resend para os alertas |
| M2 · Conversa assistida | SDR-09 Inbox | ✅ | ✅ #1 | ⛔ mensagem aparecer no LinkedIn |
| M2 | SDR-10 Agente de conversa | ✅ | ✅ #1 | ⛔ chave da Anthropic |
| M2 | SDR-11 Fila de aprovação | ✅ | ✅ #1 | — |
| M3 · Operação da casa | SDR-12 RD Station | ✅ | ✅ #1 | ⛔ token e funil do RD (T-6) |
| M3 | SDR-13 Regras por praça | ✅ | ✅ #1 | — |
| M3 | SDR-14 Métricas | ✅ | ✅ #1 | — |
| M4 · Personalização | SDR-15 T1 personalizado (A/B) | ✅ | ✅ #1 | ⛔ chave da Anthropic |
| M4 | SDR-16 Eval de conversas | ✅ | ✅ #1 | ⛔ chave da Anthropic (1ª rodada real + revisão humana) |
| M4 | SDR-17 Modo automático por perfil | ✅ | ✅ #2 | ⛔ 1º eval real |
| M5 · Painel guiado e fluxo livre | SDR-18 Clareza das telas de operação | ✅ | ✅ #2 | — |
| M5 | SDR-19 Primeiros passos obrigatórios | ✅ | ✅ #2 | — |
| M5 | SDR-20 Inbox com todas as conversas | ✅ | ✅ #2 | ⛔ Unipile: conferir `GET /chats/{id}/attendees` com conta real |
| M5 | SDR-21 Fluxo de campanha com blocos | ✅ | ✅ #2 | ⛔ testar o editor no navegador |
| M6 · Jornada do Kakou | SDR-22 Organização como raiz | ✅ | ✅ #3 | — |
| M6 | SDR-23 Dossiê da oferta a partir do site | ✅ | ✅ #3 | ⛔ chave da Anthropic |
| M6 | SDR-24 Dossiê editável e confirmado | ✅ | ⏳ PR aberto | ⛔ aplicar a migration `20261010140000` no banco |
| M6 | SDR-25 Públicos sugeridos a partir do dossiê | 🔜 próximo | — | ⛔ chave da Anthropic |
| M6 | SDR-26 Campanha nasce do público | 🔜 | — | — |
| M6 | SDR-27 Busca a partir do público | 🔜 | — | ⛔ Unipile: filtros da busca clássica e limite de uso comercial |
| M6 | SDR-28 Nota de aderência | 🔜 | — | ⛔ chave da Anthropic |
| M6 | SDR-29 Fluxo gerado pelo público | 🔜 | — | ⛔ chave da Anthropic |
| M6 | SDR-30 Jornada no lugar dos primeiros passos | 🔜 | — | — |
| M6 | SDR-31 a SDR-34 Início com ação direta, opt-out e regras por organização, dossiê no agente | 🔜 depois do caminho principal | — | — |

Legenda: ✅ feito · 🔜 a fazer · ⏳ aguardando · ⛔ bloqueado por algo externo.

## 2 · Próximos passos, em ordem

| # | Passo | Quem | Situação |
|---|---|---|---|
| 1 | Liberar `https://guessless-sdr.vercel.app/**` nas Redirect URLs do Auth do GL Suite | Arthur | ⏳ sem isso o login não volta para o painel |
| 2 | Testar o painel com arthur@ (operador) e midia@ (admin) | Arthur | ⏳ |
| 3 | Chaves na Vercel: Unipile, Anthropic, Resend, RD | Arthur passa, Claude cadastra | ⏳ |
| 4 | 1ª rodada real do eval (`pnpm eval`) e revisão humana do `revisao.json` | Claude + Arthur | depende da chave da Anthropic |
| 5 | ~~SDR-17 a SDR-21~~ | — | ✅ PR #2 |
| 5a | ~~Mergear o PR do SDR-22 e SDR-23 e depois o da jornada revisada (docs)~~ | — | ✅ #3 e #4 |
| 5b | SDR-24 a SDR-30, um por vez, na ordem do Marco 6 | Claude | SDR-24 em PR |
| 6 | ~~Migrations do SDR-17 ao SDR-21 por SQL no GL Suite~~ | — | ✅ 09/10, sem tocar no histórico do GL Suite |
| 7 | ~~Abrir e mergear os PRs do SDR-01 ao SDR-16~~ | — | ✅ PR #1 |
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
| D8 | Teto de busca por perfil | SDR-27 | Arthur | ✅ 100 resultados/dia (09/10) |
| D9 | Nota de corte para aprovar em lote | SDR-28 | Arthur | aberta; padrão 70 |
| D10 | Opt-out por organização | SDR-32 | Arthur | ✅ vale só na organização (09/10) |

## 4 · Como vai ficar

- **Saída do M1:** perfil do Arthur rodando uma campanha de template, igual ao PRIME SDR.
- **Saída do M3:** Arthur e Juliano rodando com RD; Luiz e JP prontos para ativar quando T-3, T-4 e T-5 caírem.
- **Saída do M4:** T1 personalizado em A/B e modo automático ligado por perfil, só depois do eval e de 2 semanas com edição < 10%.
- **Saída do M6 (caminho principal):** a empresa cola o site e chega a uma campanha ativa sem sair da jornada: dossiê confirmado, público escolhido, lista buscada e aprovada pela nota, fluxo gerado e aprovado.
- **Custo mensal previsto:** Unipile €49 + Claude ~US$ 20–40 por perfil ativo + planos que a casa já tem.
