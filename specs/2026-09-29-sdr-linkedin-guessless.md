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

### SDR-04 · Importação e triagem
- O arquivo é lido e normalizado **no navegador** (CSV com `,` `;` ou tab, ou o
  JSON do Apify). O servidor recebe só as colunas canônicas e revalida com zod:
  arquivo grande do Apify não esbarra no limite de corpo das server actions.
- Colunas reconhecidas por apelido (CSV canônico do SDR e campos comuns dos
  actors de LinkedIn do Apify, inclusive aninhados). O provider_id sai de URN
  (`urn:li:fsd_profile:ACo…`) ou de campo solto.
- Quem vem só com URL tem o provider_id buscado na Unipile (1 visita de perfil
  por pessoa, até 100 por importação). Quem não resolve entra no resumo como
  "sem provider_id" e fica fora da base.
- O lead nasce direto em `triagem`: `importado` é o próprio ato de importar.
- Opt-out não cria nem a pessoa. Bloqueado (outro dono, régua ativa, disse não,
  sem resposta com `conexao`, pausa de 60 dias, mesmo ângulo da régua anterior)
  entra em `triagem` com `bloqueio_motivo`, visível e sem como aprovar. Entrada
  bloqueada não conta como lead vivo para outras campanhas.
- Um alvo, um dono: se o dono anterior só rejeitou a pessoa, a posse passa na
  aprovação.
- Cooldown de empresa na importação é **alerta** (`alerta_triagem`). Quem segura
  o convite até o fim do cooldown é o despachante (SDR-06). A chave da empresa é
  o domínio, ou o nome sem acento, pontuação e sufixo societário.
- A aprovação revalida tudo (opt-out, bloqueios, `max_leads`), porque a situação
  pode ter mudado desde a importação.
- Escritas do painel: a server action autoriza pelo RLS
  (`exigirCampanhaDoOperador`, `leadsVisiveis`) e o serviço roda com a conexão
  do sistema, porque as regras cruzam perfis.

### SDR-05 · Campanhas, sequência e validador de copy
- O validador (`src/domain/validador.ts`) é puro: roda no navegador (prévia ao
  vivo no editor) e no servidor (bloqueio no salvar e no enviar).
- Interpretações das regras da §4.2:
  - "travessão e meia-risca" inclui os parentes visuais (‒ ― ⸺ ⸻ e variantes);
    hífen passa.
  - Palavra proibida é comparada sem acento e sem caixa, a partir do começo da
    palavra, e pega plural ("agências"). "marketplace" não conta como
    "marketing".
  - URL inclui domínio solto (`guessless.com.br`), encurtador e e-mail.
  - Caracteres contados em unidades UTF-16 (`String.length`, como o LinkedIn
    web). Emoji conta 2, o que é conservador.
  - "Nunca afirmar que foi escrita à mão" vale para IA **e template** (os dois
    saem automáticos). Só texto humano pode.
  - Descadastro do Canadá: toda DM, de qualquer origem, inclusive humana. A nota
    do convite não, porque é "sem oferta" e tem 250 caracteres.
- Duas regras a mais, só para texto da IA, que mandam para revisão em vez de
  enviar:
  - `escalada_canal`: WhatsApp, e-mail ou telefone (§4.6);
  - `link_nao_permitido`: na conversa, só o link de agenda configurado.
- Convite sem nota é permitido (T1 vazio). Na conta gratuita, com poucas notas
  por mês, é o caminho.
- Salvar valida cada toque renderizado com valores de exemplo longos
  (configuração `template_exemplo`). O envio valida de novo com o lead real: o
  nome da empresa pode estourar o teto.
- O texto do template é renderizado **no envio** (`prepararTexto`): corrigir a
  campanha vale para as ações que ainda não saíram. Falha no validador leva a
  ação para `aguardando_aprovacao` com `motivo_revisao` (`enviarParaRevisao`).
- Aprovar na triagem agenda o T1 com chave `lead:<id>:T1`. Na campanha
  `personalizada`, a origem é `ia` e o texto vem do SDR-15.
- O pós-T4 vem da praça na criação da campanha. Encerrar a campanha cancela as
  ações que não saíram.

### SDR-06 · Despachante
- Agendamento [verificado]: Vercel Cron no Hobby só roda 1×/dia e o cron de
  5 min quebra o deploy. **Padrão = pg_cron + pg_net** do Supabase
  (`supabase/snippets/tick-pg-cron.sql`). Vercel Cron fica como opção do plano
  Pro. O endpoint aceita GET e POST com `Authorization: Bearer <CRON_SECRET>`.
- Calendário com Temporal (polyfill): fuso do perfil, horário de verão, feriado
  por praça. "+N dias úteis" não conta o próprio dia (aceite na segunda +2 =
  quarta). O toque seguinte é agendado para a abertura da janela (9h local) do
  dia útil calculado.
- **Teto semanal = janela móvel de 7 dias**, mais conservadora que a semana do
  calendário. "Semana N" da rampa conta em datas locais desde `ativado_em`; a
  última etapa vale para 3+.
- Garantia do teto: a reserva roda numa transação com a linha do perfil
  travada (`for update`). A contagem inclui as ações `enviando`, então dois ticks
  concorrentes nunca gastam o mesmo saldo. Além disso, uma trava com prazo
  (tabela `travas`) evita ticks sobrepostos: o pooler em modo transação não
  segura advisory lock de sessão.
- Ordem da fila: respostas de conversa, depois DMs da régua, convites e, por
  último, retiradas de convite. Uma ação por perfil por tick, com intervalo
  aleatório (`proxima_acao_apos`).
- A retirada de convite não gasta saldo, mas respeita janela e intervalo:
  também é ação da conta.
- O que a revalidação faz:
  - cancela: lead fora da régua, opt-out, DM automática na Espanha;
  - reagenda para o próximo dia útil: pessoa que já recebeu um toque hoje;
  - reagenda para o fim do cooldown: empresa tocada por outro perfil;
  - manda para revisão: copy que falha no validador.
- A campanha pausada segura só os toques da régua. Resposta de conversa sai
  mesmo assim.
- Conta instável: status não saudável segura os envios, e ao voltar a ficar
  saudável espera 30 min (`conta_estavel_minutos`), porque as mensagens do
  período desconectado chegam primeiro. `unipile_status_em` só muda quando o
  status troca de saudável para não saudável ou vice-versa.
- Erros:
  - transitório: backoff de 15 · 30 min e falha na 3ª tentativa, com o lead
    para revisão;
  - limite: volta à fila no próximo dia útil e grava o evento `erro_limite`, que
    conta para a parada (a regra que pausa vem no SDR-08);
  - conta (checkpoint, restrição, desconexão): pausa na hora;
  - permanente: a ação falha e o lead vai para revisão.
- Ação presa em `enviando` por mais de 10 min é **reconciliada** na Unipile
  antes de reenviar (convite pendente? mensagem na conversa?). A Unipile não tem
  chave de idempotência.
- Depois do T4: `sem_resposta` na hora e, nas praças com pausa, `retorno_apos` =
  hoje + 60 dias.

### SDR-07 · Reações a eventos
- O aceite chega por dois caminhos:
  - `new_relation`, que tem até 8 h de atraso;
  - em tempo real, quando a nota do convite aparece como mensagem da própria
    conta numa conversa nova. A nota é comparada com o `texto_final` do T1.

  O aceite agenda o T2 a partir do momento em que foi processado e cancela a
  retirada do convite.
- Mensagem da pessoa: grava, cancela **todas** as ações pendentes (inclusive a
  retirada) e passa a `em_conversa`, tudo na transação do processamento do
  webhook. Lead já em conversa só grava a mensagem.
- Mensagem da própria conta que não é eco do SDR nem a nota do convite
  significa que o dono do perfil escreveu direto no LinkedIn. A régua para
  (pendentes canceladas) e o lead vai para `escalado_humano`. É um caso que o
  épico não previa; a transição foi somada à máquina de estados.
- Eco de DM que voltou da API sem `message_id`: casado pelo texto na mesma
  conversa (última hora).
- Conversa com quem não é lead do SDR não é gravada (privacidade). Revisto no
  SDR-20: passa a ser gravada como conversa externa (§4.6).
- **Rede de segurança do erro mais caro:** antes de cada DM da régua, o
  despachante lê a conversa na Unipile. Mensagem da pessoa posterior ao convite
  que o webhook não trouxe é registrada na hora, e a DM não sai. Se a Unipile
  falhar nessa leitura, o envio é tratado como erro transitório (sai depois,
  nunca às cegas).
- Corrida coberta de três jeitos:
  - revalidação na reserva, com o lead travado;
  - checagem de estado colada ao envio;
  - leitura da conversa na Unipile.
- Retirada do convite [verificado]: `DELETE /users/invite/sent/{invitation_id}`,
  agendada no envio do T1 para +21 dias.

### SDR-08 · Guardas de conta
- **"Taxa de aceite < 15% em 3 dias úteis" foi interpretada como aceite
  dentro de 3 dias úteis:** só contam os convites cujo prazo de 3 dias úteis já
  passou (maduros), na janela dos últimos 10 dias úteis, com amostra mínima de
  20. Contar convite de hoje derrubaria a taxa e pausaria o perfil à toa.
- Queda brusca (configurável, ligada por padrão): taxa dos últimos 20 convites
  maduros menor que metade da taxa dos 40 anteriores.
- Erro de limite repetido: 2 eventos `erro_limite` em 24 h. É avaliado na hora
  do erro e de novo em cada tick.
- Todas as contagens das guardas recomeçam no último despausar: quem despausou
  já viu o que aconteceu antes. Sem isso, o perfil pausaria de novo no tick
  seguinte.
- Despausar exige conta conectada e saudável e fica em `eventos` com o
  operador. A primeira ativação exige confirmar as travas da §8 e marca
  `ativado_em` (início da semana 1).
- Pausar: qualquer operador, qualquer perfil, com motivo. Despausar: quem opera
  o perfil (`pode_ver_perfil`).
- Alertas (decisão D5: e-mail no M1) numa fila transacional (`alertas`): o
  alerta nasce na mesma transação da pausa e o tick envia pelo Resend, com chave
  de idempotência `sdr-alerta/<chave>`. Sem Resend configurado, a fila guarda.
  Os destinatários são o dono do perfil (`email_alerta` ou o e-mail do operador
  dono) e `alerta_admin_email`.
- Painel de saúde na página inicial: saldo do dia e da semana, aceite em 3 dias
  úteis, erros de limite em 24 h, fila e revisão. Perfil que o operador não
  opera mostra só o status e o botão de pausar.
- Primeira ativação vira checklist por perfil (`src/domain/ativacao.ts`): a
  conta conectada é checada pelo sistema; as travas da §8 que valem para o
  perfil (Arthur: D3; Juliano: T-2 se o modo não for manual; Canadá: T-1 do IP,
  T-3, T-5; Espanha: T-1 do IP, T-3, T-4, T-5) são confirmadas uma a uma, em
  linguagem direta e com o responsável. O servidor exige todas. Perfil que
  nunca rodou aparece como "Não ativado", não "Pausado", e o motivo de pausa
  do seed deixa de aparecer.

### SDR-09 · Inbox
- SLA (§4.6): o relógio começa na última mensagem da pessoa sem retorno e para
  quando alguém da casa responde, pelo painel ou direto no LinkedIn. Rascunho
  esperando aprovação não conta como resposta. As 4 horas úteis contam só
  dentro da janela 9h–18h, em dia útil, no fuso do perfil.
- Alertas:
  - "respondeu": vai **só para o dono do perfil**, na virada de turno (a
    primeira mensagem da pessoa depois de uma nossa), para uma conversa ativa não
    virar enxurrada;
  - "SLA estourado": vai para o dono e para o Arthur, uma vez por mensagem sem
    retorno.
- A resposta manual passa pelo validador como texto humano. Continuam valendo:
  - travessão e palavras proibidas;
  - descadastro, nas DMs do Canadá.

  Não se aplicam: URL (é conversa) e "escrita à mão" (é humano de verdade).
- A resposta manual sai na hora, conta no saldo de DMs e não é barrada pelo teto
  (é decisão humana). Perfil pausado não responde pelo painel.
- A chave de idempotência vem do formulário (`manual:<uuid>`): clique duplo não
  manda duas mensagens.
- Responder pelo painel um lead que ainda estava na régua para a régua e passa
  o lead para `escalado_humano`. O operador vira `dono_conversa_id`.
- Opt-out global (`registrarOptout`): grava o pedido, marca a pessoa, cancela
  tudo e leva todos os leads dela para `optout`. Serve ao botão da inbox e ao
  agente (SDR-10). "Sai da base" = sai de toda fila, campanha e importação
  futura; a eliminação dos dados pessoais a pedido (LGPD) fica como fluxo
  separado, fora do escopo.
- Desfechos marcados pelo humano: qualificado (04), reunião marcada (05, com
  data) e disse não. Disse não encerra sem recuperação e cancela o que houver.

### SDR-10 · Agente de conversa
- SDK oficial `@anthropic-ai/sdk`. Saída estruturada com
  `messages.parse` + `zodOutputFormat`: formato errado ou `stop_reason: refusal`
  viram erro, nunca texto solto. Classificação no `claude-haiku-4-5` (sem
  thinking). Rascunho no `claude-sonnet-5` com thinking adaptativo e esforço
  `medium`. Tudo em variável de ambiente.
- Prompt de sistema estável por perfil (sem dado de lead) com `cache_control`.
  Lead e conversa vão na mensagem do usuário. Versão dos prompts
  (`VERSAO_DOS_PROMPTS`) gravada em cada rascunho.
- Os prompts 5 a 8 da Kakiyo não estavam disponíveis. Os prompts foram escritos
  a partir das regras da §7, §4.2 e §4.6 e devem ser calibrados no eval
  (SDR-16).
- **Opt-out determinístico antes de tudo:** frases claras em PT, EN e ES são
  registradas no processamento do webhook (`detectarOptout`), sem esperar IA.
  "Não tenho interesse" é **não**, não opt-out. Opt-out pela IA só com
  confiança ≥ 0,8; abaixo disso é "opt-out ambíguo" e vai para um humano.
  Opt-out não recebe mensagem de confirmação (o despachante bloqueia qualquer
  envio para quem pediu para parar).
- Execuções do agente ficam em `rascunhos`, uma por mensagem da pessoa (única
  por `mensagem_id`). Guardam classificação, decisão, validação, exceção, modelos
  e uso de tokens: é o dado do eval e da taxa de edição. Erro do modelo é
  retentado até 3 vezes, e execução presa em `processando` é retomada depois de
  10 min.
- O agente roda só para lead em `em_conversa` e só sobre a última mensagem da
  pessoa sem resposta. Com humano, qualificado ou reunião, a conversa é do
  humano. Rascunho novo cancela o anterior que ainda estava na fila.
- Resposta automática de ausência ("fora do escritório"): sem rascunho e sem SLA
  (`mensagens.categoria`).
- Exceções que vão para a fila no modo automático:
  - preço e reclamação (sinais da classificação);
  - opt-out ambíguo;
  - confiança da decisão < 0,7;
  - violação do validador;
  - proposta de reunião sem link configurado.

  Violação do validador vai para a fila marcada em qualquer modo.
- O envio automático sai com atraso humano (3 a 10 min, configurável) pelo
  despachante, com prioridade sobre a régua.
- Link de agenda: o do perfil em `responsavel_discovery` (decisão D1, padrão
  Juliano) e, na falta dele, o do próprio perfil. Link diferente escrito pela IA
  é barrado pelo validador.
- Disparo: logo depois do webhook (`after()` do Next) e, garantido, no tick do
  cron (até 5 mensagens por tick).

### SDR-11 · Fila de aprovação
- A fila mostra tudo o que espera decisão humana:
  - rascunhos da IA (modo aprovação e exceções do automático);
  - toques da régua que o validador barrou. Para esses, o texto que falhou fica
    em `texto_gerado` e aparece para correção.
- Aprovar resposta de conversa manda na hora (o SLA corre). Aprovar toque da
  régua devolve a ação ao despachante com o texto corrigido: janela, teto e "um
  toque por dia" continuam valendo.
- A edição guarda o original em `texto_gerado` e o que saiu em `texto_final`. O
  texto editado é validado como humano. A mensagem sai assinada `ia` quando
  aprovada como está e `humano` quando editada.
- `decisao_humana` (`aprovada`, `editada`, `rejeitada`), `decidida_por` e
  `decidida_em` em `acoes`. Taxa de edição por perfil = (editadas + rejeitadas)
  / decididas nos últimos 14 dias, só com rascunhos da IA. É a métrica do gate
  D6 (SDR-17).
- Aprovar um "encerrar" do agente fecha a conversa (`encerrado_nao`) depois do
  envio. Toque rejeitado deixa o lead marcado para revisão (`revisao_motivo`).
- Resposta com o perfil pausado não é aprovada. Clique duplo não duplica: a
  aprovação muda o status com a linha travada.
- O alerta de SLA estourado (SDR-09) cita os rascunhos esperando na fila.

### SDR-12 · RD Station
- API v1 com token [verificado]: é a única com token fixo. O `deal_stage_id` do
  update vai na raiz (dentro de `deal`, a v1 responde 200 e não move). A empresa
  (organização) é criada antes da negociação. Referência:
  `docs/pesquisa/rd-station.md`.
- Fila transacional `rd_eventos` (única por lead e etapa). O evento nasce na
  mesma transação do fato:
  - aprovação → 01;
  - convite enviado → 02;
  - resposta → 03;
  - qualificado → 04;
  - reunião → 05.

  O tick sincroniza em ordem por lead (se a 01 falhar, a 02 espera) e retenta
  até 10 vezes.
- Só praça Doméstico: o evento nem nasce para Canadá e Espanha, e o processador
  ainda ignora qualquer lead de outra praça (defesa dupla).
- Idempotência sem ajuda da API: `rd_deal_id` no lead, evento único e busca por
  nome exato antes de criar.
- **A negociação é da empresa** ("nome da negociação = `<Empresa>` e nada
  mais"): um segundo decisor da mesma empresa entra como anotação na negociação
  existente. A etapa nunca volta (outro decisor pode estar mais à frente). Lead
  sem empresa não vira negociação: fica em erro para o humano corrigir.
- Os ids (funil, etapas, campos, usuários, fonte) ficam na configuração
  `rd_station`, desligada até alguém preencher (trava T-6). A página
  **Integrações** descobre os ids no RD e valida o JSON antes de salvar. Com o
  RD desligado, a fila acumula e sincroniza quando ligar.
- Campos por etapa (§4.9):
  - 01: nicho, fonte = LinkedIn, praça = Doméstico e originador = nome do
    perfil; responsável = usuário do RD do dono;
  - 02: ângulo, mais tarefa "próximo passo" em +5 dias úteis;
  - 03: dono da conversa, mais tarefa "responder (SLA)";
  - 05: data da reunião (`DD/MM/AAAA`).

### SDR-13 · Regras por praça
- **Espanha:** `agendarToque` gera `tarefa_manual` (nunca DM) com o template
  do toque renderizado como roteiro de apoio. O despachante não pega tarefa
  manual. A tarefa se conclui por três caminhos, e todos seguem a régua (próxima
  tarefa em dias úteis ou fim com pausa de 60 dias):
  - o JP escreve pelo painel (texto humano, validado);
  - o eco da mensagem que ele mandou direto no LinkedIn;
  - o botão "já enviei".
- Por isso, mensagem da própria conta que conclui uma tarefa manual **não**
  escala o lead. Regra registrada no §6.1 do épico.
- Lógica "próximo toque ou fim da régua" compartilhada (`avancarRegua`) entre
  DM enviada e tarefa concluída.
- **Trava T-4 imposta pelo sistema:** importar para campanha de perfil da
  Espanha falha com mensagem clara enquanto `travas.dpa_espanha` for `false`.
  Nenhum dado de pessoa europeia é gravado antes do DPA.
- Canadá: o descadastro já valia no validador para toda DM, de qualquer origem
  (SDR-05). Os testes cobrem salvar, enviar e responder.
- Planilha-espelho (`/api/exportar/planilha?praca=`): CSV com `;` e BOM (Excel
  em português), com as colunas da §9. Roda com o RLS do operador. Ficam de fora
  a triagem, os rejeitados e quem pediu opt-out ("sai da base"). O próximo passo
  é a próxima ação pendente, ou o `proximo_passo` do lead.
- Idioma por perfil: o agente responde no idioma da pessoa, e a voz padrão sai
  da praça do perfil (SDR-10). Os templates são escritos por campanha, no idioma
  do perfil.

### SDR-14 · Métricas e gate de leitura
- Definições (tudo contado de `acoes`, `mensagens` e `eventos`):
  - toques: T1 a T4 que saíram (convite, DM da régua, tarefa manual feita);
  - convites: convites enviados;
  - aceites: convidados com `aceito_em`;
  - respostas: leads com ao menos uma mensagem da pessoa (inclui quem respondeu
    só a nota do convite, sem aceitar);
  - conversas: leads que passaram por `em_conversa` (opt-out direto pelo
    detector não conta);
  - qualificados e reuniões: marcados pelo humano.
- Taxas: aceite = aceites / convites. Resposta sobre aceite = respostas /
  aceites, como o épico pede, mesmo quando a resposta veio sem aceite.
- Marco de leitura: taxa só com toques ≥ `leitura_minima_toques` (100). Antes
  disso, "sem amostra". Os agregados (ângulo, perfil) usam o mesmo marco sobre a
  soma.
- Visões: por campanha (perfil × campanha × ângulo × variante), por ângulo, por
  perfil e template × personalizado (a variante vem de `leads.variante_copy`,
  que o SDR-15 preenche). Triagem e rejeitados ficam de fora.
- A referência de trabalho aparece como faixa. Abaixo dela o número fica em
  âmbar, acima no tom de ok: é referência, não meta. O sistema cria a primeira linha
  de base da casa.

### SDR-15 · Pesquisa do prospect e T1 personalizado
- A/B por lead, sorteado na aprovação da triagem (`sortearVariante`): o
  sha256 do id do lead contra `pesquisa.proporcao_personalizada` (padrão 0,5).
  É estável e não guarda estado. Subir a proporção só move leads do template
  para o personalizado. O braço fica em `leads.variante_copy`; a campanha de
  template grava `template`.
- O braço de controle usa o T1 da campanha, e T1 vazio é convite sem nota. O
  mesmo T1 entra no prompt como referência de tom e tamanho.
- O braço personalizado cria o T1 com origem `ia` e sem texto. O despachante
  não pega ação da IA sem `texto_final`, então nada sai antes da aprovação.
- O tick (etapa `pesquisa`, só com o Claude configurado) faz três passos:
  - pesquisa o perfil completo (`linkedin_sections=*`) e os 5 posts
    recentes, e guarda em `leads.pesquisa`;
  - numa chamada ao `IA_MODELO_RASCUNHO`, gera de 1 a 3 ganchos e escolhe um
    (a ideia dos prompts 3 e 4 da Kakiyo, que não estavam disponíveis, adaptada
    às regras da casa);
  - escreve a nota, valida e manda para a fila.
- A pesquisa é visita de perfil: só na janela do perfil, em dia útil, e até
  `pesquisa.max_por_dia` por perfil (padrão 20, contado em
  `eventos.pesquisa_feita`). A visita é reaproveitada em nova tentativa.
- A nota barrada pelo validador ganha uma reescrita com os problemas
  apontados. Se falhar de novo, vai para a fila com `motivo_revisao`, e só sai
  corrigida: a aprovação valida de novo. O texto não é corrigido
  automaticamente.
- Tratamento de falhas:
  - falha de conta ou de limite do LinkedIn não gasta tentativa e para o perfil
    naquele tick;
  - qualquer outra falha, de pesquisa ou do modelo, conta tentativa;
  - na terceira, o T1 volta para o template e `variante_copy` também. O A/B
    compara o que de fato saiu (as-treated).
- A fila mostra o gancho da pesquisa (evento `t1_personalizado`, que guarda
  os ganchos, o motivo, a confiança, as reescritas, o modelo e o uso de tokens).
  Confiança abaixo de 0,6 vira aviso.
- A taxa de edição do gate do automático (§7.1) passa a contar só rascunhos de
  conversa (`toque is null`). O modo automático automatiza a conversa, e o T1
  personalizado sempre passa por aprovação.
- A comparação de aceite template × personalizado é a visão "por variante" do
  SDR-14, por campanha.

### SDR-16 · Eval de conversas
- O eval roda o agente pelo mesmo caminho da produção. A decisão saiu de
  `processarComAgente` para `decidirResposta` (`src/server/agente/decidir.ts`),
  que não toca no banco. Ela devolve o desfecho: opt-out, sem resposta,
  escalar ou rascunho com validação e exceções. `processarComAgente` só aplica
  os efeitos. Prompts, validador, limiares e regras duras são os mesmos.
- Dataset em `evals/conversas/<praça>.json`: 34 conversas por praça, cada uma
  terminando numa mensagem do prospect. O teste do dataset exige 30 ou mais
  por praça e as 8 objeções da §7.1 em cada uma. Cada caso diz as ações
  aceitáveis, se precisa terminar com um humano (preço, reclamação, pedido de
  outro canal) e se reunião é aceitável.
- Perfis do eval: os valores do seed (Arthur no Brasil, Luiz no Canadá, JP na
  Espanha), com a voz padrão da praça, o link de agenda do Juliano (D1) e a
  oferta vigente. O eval não lê o banco: se um perfil ganhar voz ou regras
  próprias no painel, o perfil do eval precisa ser atualizado junto.
- Rubrica, com nota de 0 a 1 por critério:
  - validador e ação certa saem por regra;
  - promessa, reunião cedo e tom saem de um juiz (`EVAL_MODELO_JUIZ`, padrão
    `claude-opus-5-5`, esforço `medium`, fallback do servidor em caso de
    recusa);
  - por cima do juiz valem duas regras: percentual no texto reprova
    promessa, e link de agenda ou `propor_reuniao` sem interesse reprovam
    reunião;
  - tom passa com nota 4 ou 5 (de 5).
- "Ação certa" olha a ação final depois das regras duras: opt-out por regra
  conta como `registrar_optout`, e ausência automática como `nenhuma`.
  "Terminar com humano" aceita escalada ou rascunho com exceção, que no
  automático vai para a fila.
- Gate por praça (a interpretação de "eval aprovado" da §7.1), com o mínimo
  de acerto de cada critério em `LIMIARES`: validador 95%, ação 90%,
  promessa 100%, reunião 95% e tom 80%. O veredito da praça é:
  - reprovado: algum critério ficou abaixo do mínimo;
  - inconclusivo: menos de 30 casos, ou erro do agente ou do juiz;
  - aprovado: o resto.
- O SDR-17 lê o gate da praça do perfil.
- `pnpm eval` roda no vitest, com uma config própria
  (`vitest.eval.config.mts`), para reaproveitar o alias `@/` sem dependência
  nova. Fica fora do `pnpm test` porque chama a API de verdade. Sem
  `ANTHROPIC_API_KEY`, não roda.
- Cada rodada gera uma pasta em `evals/relatorios/` (ignorada pelo git) com
  três arquivos:
  - `relatorio.md`: por critério e por praça, com custo e falhas;
  - `relatorio.json`;
  - `revisao.json`: o modelo da revisão humana.
- O teste da rodada falha se alguma praça for reprovada ou se houver erro de
  execução.
- Custo: o uso de tokens de cada chamada (agente e juiz) vezes a tabela de
  preços em `src/server/eval/custo.ts` (25/09/2026). A escrita de cache custa
  1,25× a entrada e a leitura, 0,1×. Modelo fora da tabela aparece no
  relatório como "sem preço".
- Calibração (§7.1, "a revisão humana calibra a primeira rodada"): alguém
  preenche o `revisao.json` da rodada, com passou/não em promessa e reunião e
  nota de 1 a 5 no tom. Depois roda `EVAL_REVISAO=<pasta> pnpm eval`, sem
  chamar a API. A nota humana substitui a do juiz no veredito, e o relatório
  revisado mostra a concordância juiz × humano por critério. Concordância
  baixa pede ajuste no prompt do juiz (`VERSAO_DO_JUIZ`) antes de confiar
  nas rodadas seguintes.
- CI: `.github/workflows/eval.yml` roda em PR que mexe no agente, nos
  prompts, no validador, no opt-out ou no próprio eval, e também à mão
  (`workflow_dispatch`). O relatório vai para o resumo do job e para um
  artefato. Sem o secret `ANTHROPIC_API_KEY`, o job só deixa um aviso e
  passa.

### SDR-17 · Modo automático por perfil
- "Eval aprovado" fica numa tabela, `evals`: uma linha por praça e por
  rodada, com veredito, versão dos prompts e do juiz, casos, custo e motivos.
  O eval não fala com o banco. O admin sobe o `relatorio.json` da rodada em
  **Perfis** ("Registrar eval"), e o sistema recusa uma rodada de outra versão
  dos prompts. Vale a rodada mais recente da praça na versão atual
  (`VERSAO_DOS_PROMPTS`). Se o prompt muda, o gate fecha até um eval novo ser
  registrado.
- Desde quando o perfil está no modo atual: coluna `perfis.modo_desde`. Toda
  troca de modo, manual ou automática, reinicia esse relógio. Perfis que já
  existiam contam desde a ativação.
- O gate (§7.1), em `avaliarGate` (`src/server/perfis/modo.ts`), exige:
  - o perfil em `aprovacao` há pelo menos `gate_automatico.dias_em_aprovacao`
    dias (14);
  - pelo menos `amostra_minima_aprovacao` (20) rascunhos de conversa decididos
    nessa janela, com a taxa de edição e rejeição abaixo de `limiar_edicao`
    (10%, D6). A taxa é a de `taxaDeEdicao`, do SDR-11. Sem a amostra mínima,
    a taxa de 0% de 2 rascunhos não diria nada;
  - o eval da praça do perfil aprovado na versão atual dos prompts.
- Na Espanha, o automático não existe: a DM é manual pela §4.5, e o
  despachante já cancela DM que não seja humana. As outras trocas de modo
  (`manual` e `aprovacao`) são livres, feitas por qualquer operador com
  acesso ao perfil.
- Tentar ligar sem o gate é bloqueado: o painel mostra os motivos, e a
  tentativa fica em `eventos` (`automatico_bloqueado`, com o operador). A
  troca aceita grava `modo_alterado`.
- Quando o perfil sai do automático, por troca manual ou por rebaixamento, os
  rascunhos automáticos que ainda não saíram (`pendente`) voltam para a fila,
  com o motivo.
- "Taxa de erro" do rebaixamento (interpretação). A base são as DMs que a IA
  agendou sozinha nos últimos `janela_erro_dias` (7) dias e que já tiveram
  desfecho. Conta como erro a DM que:
  - o validador barrou no envio;
  - falhou de vez;
  - foi seguida de um pedido de opt-out da pessoa.
- O perfil é rebaixado quando a taxa passa de `limiar_erro` (10%), com pelo
  menos `amostra_minima_erro` (10) mensagens. A marcação manual de "resposta
  ruim" pelo operador fica para depois: hoje não há tela para isso.
- O rebaixamento é a etapa `modo` do tick. Ela roda depois das guardas e antes
  do despacho, para que nada saia pelo modo antigo. Ele grava `modo_rebaixado`
  em `eventos` (ator `sistema`) e manda um alerta `modo_rebaixado` para o dono
  do perfil e para o admin.
- Os parâmetros novos entraram na configuração `gate_automatico`, que já
  existia, então o total de configurações continua 17.
- No banco dividido com o GL Suite, a migration
  `20261008120000_modo_automatico.sql` vai por SQL. Ela dá o grant da tabela
  `evals` ao `sdr_servidor`, mas só se o papel existir.

### Ambiente de teste (30/09/2026)
- Painel na Vercel: projeto `guessless-sdr` (time GuessLess), em
  https://guessless-sdr.vercel.app. O `vercel.json` declara o framework, porque
  o projeto foi criado pela CLI sem detecção. Variáveis só no ambiente de
  produção.
- Banco: sem cota para um projeto gratuito novo no Supabase, o SDR divide o
  projeto **GL Suite** (`bfxytlaffkkcugqjsgtk`, us-west-2), por decisão do
  Arthur. Nenhum nome de tabela ou função colide. As regras do
  compartilhamento:
  - grants e revoke só nas tabelas do SDR, nunca no schema inteiro (a
    migration de RLS foi corrigida para isso);
  - o app conecta como `sdr_servidor`, pelo pooler
    `aws-1-us-west-2.pooler.supabase.com:6543`. Esse papel tem BYPASSRLS e
    direitos só nas 19 tabelas do SDR;
  - o `sdr_servidor` é membro de `authenticated` com `inherit false, set
    true`: troca para `authenticated` no painel, mas não herda o acesso desse
    papel às tabelas do GL Suite (verificado: não lê nenhuma);
  - as migrations até `20260929230000` foram aplicadas por SQL, fora do
    histórico `supabase_migrations`, que é do GL Suite. Migration nova do SDR
    também vai à mão;
  - o login usa o Auth do GL Suite, com `shouldCreateUser: false`. Operador
    novo precisa existir em `auth.users` e ganha as triggers de boas-vindas
    do GL Suite ao ser criado lá;
  - admin inicial: midia@guessless.com.br.
- Sem cron (pg_cron) por enquanto: nada sai sozinho.
- Na saída do GL Suite, o caminho é um projeto próprio em São Paulo (§5):
  aplicar as migrations e trocar as variáveis na Vercel.

### Painel · tema visual (09/10/2026, verde desde 10/10/2026)
- O tema é escuro, puxado para o verde, com um só destaque menta
  (`--color-destaque`, `#5fe39a`). Em 10/10 o menta substituiu o laranja. Ele
  aparece no item ativo do menu, na ação principal da tela (no máximo uma por
  tela ou por cartão) e no preenchimento dos medidores, que mostram quanto de
  um limite já foi usado; medidor cheio fica âmbar. Os status (ok, atenção,
  erro, info) ficam só em etiquetas e avisos.
- O ok é ciano (`#3dd2e0`), não verde, para um perfil "Ativo" não se
  confundir com o botão principal. O info foi para um azul-lilás (`#8e9bff`)
  para se separar do ciano.
- O fundo tem uma luz diagonal e uma grade fina vindas do canto superior
  direito (`body::before` e `body::after`, fixos atrás de tudo). Fica
  discreto: é tela de trabalho, não vitrine.
- Botões, filtros, campos de uma linha e itens do menu são pílulas. Cartões e
  a moldura da tabela têm borda que acende em cima; a tabela tem fundo liso.
- `.titulo-pagina` (no `Cabecalho`) e `.titulo-vitrine` (no login e na
  saudação do Início) usam grotesca apertada com o fim puxando para o menta.
- Cada tela gasta a ousadia num elemento só e deixa o resto quieto. No Início
  é o alvo (`Alvo`): um anel por perfil, de fora para dentro na ordem da
  legenda, com os convites de hoje contra o limite do dia; o centro repete a
  marca. A legenda em texto traz os mesmos números, então o desenho é
  `aria-hidden`. Os arcos se desenham uma vez ao abrir; com movimento
  reduzido, não.
- O Início abre com a saudação: a segunda linha é o estado do dia numa frase
  (nada esperando, N coisas esperando, ou quantos passos faltam), seguida das
  fichas (`.ficha`) com perfis ativos, envios de hoje e fila. "Para agora" só
  aparece quando há pendência.
- `Barra`: trilho tracejado com preenchimento menta, para uso contra limite.
- Na Inbox, o elemento é a próxima resposta (`ProximaResposta`, só no filtro
  "Abertas"): a primeira conversa de campanha com prazo correndo ou estourado,
  na ordem que a lista já traz, com a última mensagem e o botão "Responder".
  Sem ninguém esperando, diz isso e explica o prazo de 4 horas úteis.
- Em Resultados, o elemento é o funil da casa (`FunilDaCasa`): a soma de
  `porPerfil` em barras, de convites a reuniões. As etapas contam pessoas;
  toques contam envios e ficam no título, não nas barras. A barra é a etapa
  contra os convites e o percentual é contra a etapa anterior, sem cor de
  status, porque a referência muda por praça (as tabelas abaixo continuam
  com ela).
- Os tokens ficam em `src/app/globals.css` (`@theme`) e viram utilitários do
  Tailwind: `bg-superficie`, `border-linha`, `text-tinta-suave` e assim por
  diante. Uma tela nova não usa cor fixa (`neutral-*`, `bg-white`).
- As peças repetidas são classes em `@layer components`, para os utilitários
  poderem ajustar caso a caso:
  - `.cartao`, `.recuo` e `.vazio`;
  - `.botao`, com as variantes `-primario`, `-perigo` e `-pequeno`;
  - `.campo`, com a variante `-pequeno`, e mais `.campo-arquivo` e `.rotulo`;
  - `.etiqueta`, com os tons `-ok`, `-atencao`, `-erro`, `-info`, `-destaque`
    e o modificador `-ponto`;
  - `.aviso`, `.segmentos`/`.segmento` e `.tabela-moldura`/`.tabela`.
- O estado ativo de menus e filtros sai de `aria-current="page"`, não de uma
  classe condicional.
- Componentes em `src/components/`:
  - `Estrutura`: a moldura, com a barra lateral e o menu do celular;
  - `Navegacao`: grupos recolhíveis com linhas de árvore;
  - `Cabecalho`: título, descrição e ações. A linha de baixo atravessa a área
    principal pelo `--respiro`;
  - `Aviso`, `Avatar`, `Marca` e as etiquetas de estado, de campanha e de
    perfil.
- Os estados do lead aparecem com o texto de `ROTULO_DO_ESTADO`
  (`src/domain/estados.ts`), nunca com o valor cru do banco.
- Os ícones são do `lucide-react`.
- Contraste mínimo de 4,5:1 nos textos pequenos. O texto fraco (`#838c87`)
  dá de 4,5:1 a 5,7:1 nos fundos do tema; o botão principal tem texto quase
  preto sobre o menta (10:1 ou mais).

### SDR-18 · Clareza das telas de operação

- Toda tela diz, no cabeçalho, para que serve; os botões dizem a consequência
  ao lado ("sai no próximo horário permitido do perfil", "nada foi enviado").
  Toques aparecem como "Nota do convite", "1ª mensagem da sequência" etc.
  (`src/domain/rotulos.ts`); fonte de importação, pelo nome legível.
- Aprovação tem um botão só, "Aprovar e enviar", que manda o texto da caixa.
  `aprovarAcao` já comparava com o original: igual conta como aprovado,
  diferente como editado. Antes, "Aprovar como está" descartava a edição.
- Leads parados (`leads.revisao_motivo`, por toque rejeitado ou falha
  permanente, sem ação viva) aparecem no topo da Aprovação com duas saídas:
  "Tentar de novo" recria o toque em `aguardando_aprovacao` com o texto que
  ele tinha (chave nova, `...:de-novo:<ms>`); "Assumir à mão" leva o lead para
  `escalado_humano` e cancela o que estiver pendente. Os motivos gravados
  deixam de citar o toque ("Rejeitada na aprovação", "Envio falhou: ...").
- Confiança da IA só aparece quando é baixa (< 0,7, o mesmo limiar das
  exceções do automático). A taxa de edição foi para o fim da página, com a
  explicação de que ela libera o modo automático.
- Triagem: "selecionar todos" marca só quem pode ser aprovado; o retorno lista
  todos os motivos de recusa, não só o primeiro.

### SDR-19 · Primeiros passos obrigatórios

- O Início é a página de primeiros passos: é nele que o perfil é ativado, então
  não faz sentido uma rota separada. Depois de concluídos, o mesmo bloco vira
  "Para agora" (`src/server/painel/proximos.ts`).
- O bloqueio é por página: as telas fora da lista chamam
  `exigirOperadorLiberado()` em vez de `exigirOperador()`. Tela nova nasce
  liberada; quem a criar decide se ela entra no bloqueio. As server actions
  não são bloqueadas: sem a página, não há como chegar nelas pelo painel.
- `avaliarPrimeirosPassos` lê tudo como o operador, com `pode_ver_perfil`
  explícito (perfis são visíveis a todos por RLS). Quando acha a campanha
  pronta, grava `operadores.primeira_campanha_em` e daí em diante devolve
  "concluído" sem consultar nada.
- Layout não é refeito em navegação comum. As ações que podem concluir um
  passo (ativar perfil, aprovar na triagem, mudar status da campanha) fazem
  `revalidatePath("/", "layout")` para o menu destrancar na hora.

### SDR-20 · Inbox com todas as conversas

- Tabela `conversas` (uma por chat de perfil) para o que não é de campanha;
  `mensagens.conversa_id` aponta para ela e `lead_id` fica nulo. Conversa de
  campanha continua ancorada no lead, como antes.
- O webhook de mensagem sem lead grava a conversa externa e para aí: nada de
  evento de lead, alerta, SLA, IA ou RD. Perfil da Espanha com
  `travas.dpa_espanha = false` continua sem gravar (trava T-4).
- Quando a pessoa de uma conversa externa vira lead e manda mensagem, a
  conversa e as mensagens antigas passam para o lead (`ligarConversaAoLead`).
  Antes disso, a inbox mostra a etiqueta "Na campanha X" na conversa externa.
- Histórico: `importarHistorico` lê `GET /chats` (até 100 chats) e, de cada
  um, `GET /chats/{id}/attendees` e as últimas 20 mensagens. Chat de lead é
  pulado: reprocessar mensagem antiga mexeria no estado do lead. Roda ao
  conectar a conta (`after` na rota do hosted auth) e pelo botão "Trazer
  conversas do LinkedIn" da inbox. É idempotente pelo `provider_message_id`.
  [verificar] o formato de `GET /chats/{id}/attendees` veio de um espelho da
  documentação; conferir com uma conta real.
- Resposta numa conversa externa passa pelo validador como texto humano e
  exige perfil ativo, igual à resposta de lead. A idempotência é pela chave do
  formulário, gravada no evento `resposta_externa`.

### SDR-21 · Fluxo de campanha com blocos

- O fluxo é um grafo em `fluxos.grafo` (schema em `src/domain/fluxo.ts`),
  versionado por campanha. `leads.fluxo_id` guarda a versão em que o lead
  entrou. Salvar reescreve a versão atual se nenhum lead entrou nela; senão
  cria outra (`salvarFluxo`).
- Compatibilidade: campanha ou lead sem versão segue `campanhas.sequencia`,
  convertida por `sequenciaParaFluxo` para o grafo equivalente (convite →
  "aceitou?" → esperas e mensagens → fim do pós-T4). Os ids dos blocos de
  texto convertidos são T1 a T4, então as ações gravadas continuam apontando
  para eles. Com isso o motor é um só, e os testes antigos da régua rodam por
  ele sem mudança.
- `acoes.toque` e `leads.passo_atual` passam a guardar o id do bloco (as
  checagens T1–T4 do banco caíram). A chave de idempotência continua
  `lead:<id>:<toque>`: cada bloco roda no máximo uma vez por lead, e o
  validador do fluxo proíbe ciclos.
- Motor (`src/server/fluxo/motor.ts`): anda do evento até o próximo bloco que
  espera alguém. "Esperar" não vira ação; empurra o relógio para a abertura
  da janela do perfil N dias úteis depois. Entradas: aprovação na triagem
  (`entrarNoFluxo`), mensagem enviada ou tarefa feita (`aposAcao`), aceite
  (`aoAceitar`) e convite retirado (`aoRetirarConvite`).
- Regras de forma (`validarFluxo`): um Início; condição com "sim" e "não";
  convite seguido direto de "Aceitou o convite?"; "Já é conexão?" só logo
  depois do Início; mensagem só em caminho que passou por um "sim"; um
  convite por caminho; sem ciclos nem blocos soltos. A análise visita cada
  combinação (bloco, já é conexão, convites) uma vez, sem enumerar caminhos.
  Fluxo com problema de forma salva como rascunho, mas não ativa
  (`mudarStatusDaCampanha` lança `ErroDeStatus`). Problema de copy não salva.
- "Já é conexão?" é decidida na aprovação da triagem: só quando o fluxo começa
  por ela, a triagem pergunta à Unipile (`obterPerfil().ehConexao`) fora da
  transação. Sem Unipile ou com erro, conta como não e a pessoa recebe
  convite.
- Prazo do aceite: o da condição, em dias úteis; sem prazo, o padrão da casa
  (`convite_expira_dias`, dias corridos), como antes.
- Tarefa manual existe como bloco em qualquer praça; na Espanha, toda mensagem
  continua virando tarefa (§4.5).
- O modo de copy (template ou personalizada pela IA) continua sendo da
  campanha e vale para os blocos de convite.
- Editor visual com React Flow (`@xyflow/react`): blocos, setas com saída
  "sim"/"não" nas condições, painel do bloco com prévia e violações, e a
  lista de problemas do fluxo.
## Jornada do Kakou (09/10/2026)

Decidido com o Arthur e revisto no mesmo dia: o app vira uma jornada guiada,
com o público no centro (site → dossiê → públicos → conta → busca → nota →
lista aprovada → fluxo gerado → motor atual), para uso interno primeiro e
pronto para virar produto. Regras no épico (§1, §4.10 a §4.14), tickets no
Marco 6 (§9). Sem tickets no ClickUp: desenvolvido direto no repo, na ordem do
Marco 6.

- Dossiê é fato, público é hipótese. O "como a oferta ajuda" (dor, gatilho,
  resultado) mora no público. O dossiê continua só com o que o site diz.
- O público é o centro e a campanha sai do menu: campanha = público × conta do
  LinkedIn, e a conta sai da praça do público, o que mantém as regras da §4.5
  sem o usuário pensar nelas. As abas que iam para a campanha (o antigo
  "campanha em abas") vão para o público.
- Nota em dois estágios. A nota rápida usa só o que a busca devolve e roda em
  todo resultado. A pesquisa a fundo visita o perfil, tem teto de 20 por dia, e
  por isso fica para quem foi aprovado, como o T1 personalizado já faz. A
  triagem humana continua (§4.1), só que mais rápida.
- O fluxo gerado é o fluxo de blocos do SDR-21, não a sequência T1–T4, que lá
  virou legado. Ele é aprovado uma vez por campanha.
- A jornada substitui os seis primeiros passos do SDR-19, não soma. O bloco
  "Para agora" do Início (SDR-19) já é o "Hoje" que estava planejado.
- Sem Sales Navigator por enquanto: porte de empresa e senioridade viram
  critério da nota. A busca gasta a conta, então ganha teto próprio (§4.3, D8).
- Ângulo é sempre texto livre, nascido no público. No RD, "Ângulo de
  abertura" deve ser campo de texto (T-6).
- Caminho principal primeiro (SDR-24 a SDR-30), depois o que apoia (SDR-31 a
  SDR-34): é o fluxo inteiro que se quer testar. O opt-out por organização só
  faz diferença quando existir a segunda organização.

**Numeração.** Esta linha começou em paralelo ao Marco 5 (PR #2) e usava os
números 18 a 32, que colidiam com os dele. Depois do merge do #2, o Kakou foi
renumerado a partir do 22:

| Antes | Agora |
|---|---|
| 18 organização | SDR-22 |
| 22 dossiê do site | SDR-23 |
| 26 dossiê no agente (a parte de editar e confirmar) | SDR-24 |
| 23 públicos + 27 sugerir públicos | SDR-25 (tabela sozinha não entrega nada a quem usa) |
| 20 campanha em abas | SDR-26 (as abas ficam no público) |
| 28 busca | SDR-27 |
| 29 nota de aderência | SDR-28 |
| 30 sequência gerada | SDR-29 (gera o fluxo de blocos) |
| 32 progresso da jornada | SDR-30 (no lugar dos primeiros passos) |
| 31 Hoje com ação direta | SDR-31 |
| 21 opt-out por organização | SDR-32 |
| 24 regras da organização | SDR-33 |
| 26 dossiê no agente (a parte do agente) | SDR-34 |
| 19 Hoje | já feito: bloco "Para agora" do Início (SDR-19 do Marco 5) |

**Juntando com o Marco 5.** Conflitos no épico, no spec, no menu, no layout
do painel e no login. O tema do Marco 5 venceu: a marca Kakou e o nome da
organização entram no componente `Marca`; Configurações entra no grupo Gestão
no lugar de Perfis e Integrações; Oferta entra no grupo Prospecção; as telas
do Kakou (Configurações, Organização e Oferta) passaram para os componentes e
classes do tema. As tabelas novas do Marco 5 (`conversas`, `fluxos`) usam
`pode_ver_perfil` e herdam o recorte por organização sem mudança. Todas as
migrations das duas linhas já estão no banco (conferido em 09/10).

### SDR-22 · Organização como raiz

- Tabela `organizacoes`; `operadores.organizacao_id` e `perfis.organizacao_id`
  obrigatórios, com backfill na GuessLess. Campanhas, leads, ações, mensagens e
  o resto herdam a organização pelo perfil.
- `pode_ver_perfil` passa a exigir o perfil na organização do operador. O admin
  é admin da própria organização. As policies que liberavam linhas só com
  `eh_admin()` (opt-outs, eventos, alertas, rd_eventos) passaram a depender só
  de `pode_ver_perfil`; webhooks brutos ficam sem leitura pelo painel.
- Insert em `perfis` ou `operadores` sem organização entra na organização única
  (trigger). Com mais de uma, o insert falha pedindo a organização. Mantém o seed
  idempotente e o SQL de "operador novo" funcionando.
- Continuam globais, de propósito, até existir o 2º cliente: `angulos`,
  `feriados`, `configuracoes` e a página de Integrações (que lê sem RLS e é só
  para admin).
- Marca "Kakou" no título, no login e na barra lateral, com o nome da
  organização embaixo. "Perfis" e "Integrações" saem do menu (grupo Gestão) e
  viram cartões em Configurações, que fica liberada nos primeiros passos;
  Configurações › Organização mostra nome (o admin edita) e membros.
- Aplicar no GL Suite por SQL, nunca por `db push`. Antes, conferir que
  `public.organizacoes` e `public.organizacao_do_operador()` não existem lá.
  Depois, `grant select, insert, update, delete on public.organizacoes to
  sdr_servidor`.
### SDR-23 · Dossiê da oferta a partir do site

- Leitura pela ferramenta `web_fetch_20260209` da API da Claude (roda no
  servidor da Anthropic; sem crawler nosso e sem superfície de SSRF na nossa
  infra), presa a `allowed_domains = [domínio, www.domínio]`, `max_uses` da
  configuração e ~6 mil tokens por página. Retoma `pause_turn` até 4 vezes.
- Dois passos: a leitura (com a ferramenta, devolve notas em texto) e a
  estruturação (saída estruturada com o esquema `dossie`). Separados porque
  saída estruturada com ferramenta de servidor não foi confirmada, e citações
  não combinam com o formato fixo.
- Modelo e esforço: `IA_MODELO_RASCUNHO` e `IA_ESFORCO_RASCUNHO`. Custo gravado
  por leitura (`ofertas.custo_usd`) e no evento `dossie_gerado`.
- A ação grava "lendo" e roda a IA com `after()`; a página tem
  `maxDuration = 300` e se atualiza sozinha enquanto lê. O tick continua
  desligado, então nada depende dele.
- Fica para o SDR-24 editar e confirmar o dossiê, e para o SDR-34 o agente
  passar a usá-lo.

### SDR-24 · Dossiê editável e confirmado

- `ofertas.dossie` passa a ser o rascunho: a última leitura, ou a edição
  humana por cima dela. `dossie_confirmado`, `confirmado_em` e
  `confirmado_por` guardam o que vale. `dossieConfirmado()` é a porta de
  leitura de públicos, fluxo e agente (SDR-25, SDR-29 e SDR-34).
- A leitura do site continua escrevendo só no rascunho (e zera `editado_*`).
  Ela nunca toca no confirmado.
- Salvar e confirmar são a mesma ação com uma flag: "Confirmar dossiê" grava
  o que está na tela e confirma; "Salvar rascunho" só grava. Confirmar sem
  mudar nada não conta como edição: `editado_*` e o evento `dossie_editado`
  só mudam quando o conteúdo muda (comparação de jsonb no banco).
- O que vem do editor é limpo antes de validar (`limparDossieEditado`):
  textos sem espaço nas pontas, item de lista em branco descartado, fonte
  vazia como null. O erro de validação vira uma frase com a seção e o item
  (`explicarErroDoDossie`), em vez da mensagem do zod.
- Prova escrita à mão fica sem fonte: edição humana vale como fato (§4.11).
- Não edita durante a leitura, porque o rascunho seria trocado por baixo.
  Leitura parada há mais de 5 minutos libera.
- "Descartar o rascunho" copia o confirmado de volta para o rascunho,
  gravando quem e quando.
- O aviso de público desatualizado (§4.11) fica para o SDR-25, quando houver
  público.
- O editor remonta quando chega leitura nova ou quando o rascunho volta ao
  confirmado (a chave é a data da leitura mais a mensagem da tela). Ao salvar,
  não remonta, para o retorno continuar visível.
- Migration `20261010140000_dossie_confirmado`: aditiva e idempotente. Vai ao
  banco do GL Suite por SQL antes do deploy, como as outras.

### SDR-25 · Públicos sugeridos a partir do dossiê

- Tabela `publicos` com as colunas da §6 (`quem`, `empresa` e `por_que` em
  jsonb), mais `dossie_base_em`: a confirmação do dossiê que o público levou
  em conta. Quando o dossiê é confirmado de novo, o público aparece como
  desatualizado até alguém salvar (§4.11).
- Status: `sugerido` (da IA), `ativo` (escolhido ou criado por um humano) e
  `arquivado`. `publicoParaCampanha()` só devolve `ativo`: é a porta do
  SDR-26. Público criado à mão já nasce ativo.
- A IA devolve as provas pelo número da lista do dossiê confirmado, e o
  servidor troca o número pelo texto. Número fora da lista some. Assim a
  sugestão não tem como trazer prova que o dossiê não tem. Na edição humana,
  a tela só oferece as provas do dossiê, e o servidor recusa texto que não
  esteja lá.
- Praça: a IA só sugere nas praças em que a organização tem conta (sem conta
  nenhuma, Brasil). Sugestão fora delas é descartada. O humano pode escolher
  qualquer praça, para preparar uma conta que ainda vai conectar.
- Pedir de novo apaga só as sugestões e mantém escolhidos e arquivados; a IA
  recebe os escolhidos para não repetir. Falha da IA não apaga nada. Máximo de
  5 sugestões por pedido.
- Uma chamada com saída estruturada (`IA_MODELO_RASCUNHO`), síncrona no botão
  (leva até 1 minuto). A leitura do dossiê e a gravação rodam como o operador,
  em transações separadas; a chamada à IA fica fora delas. Custo, quantidade,
  descartes e versão do prompt vão no evento `publicos_sugeridos`.
- Os cargos ficam no idioma em que aparecem no LinkedIn da praça, porque viram
  as palavras da busca (SDR-27). O resto do público fica em português.
- `limparEdicao` e `explicarErroDeEdicao` saíram do dossiê para
  `src/domain/edicao.ts`, e as peças do formulário (seção, lista de frases)
  para `src/components/campos-de-edicao.tsx`: dossiê e público usam as mesmas.
- Tela Públicos no grupo Prospecção, liberada nos primeiros passos: escolhidos,
  sugestões e arquivados, com escolher, editar antes, descartar e usar de novo.
- Migration `20261010150000_publicos`, com o grant ao `sdr_servidor`. Vai ao
  banco do GL Suite por SQL antes do deploy (conferido em 09/10: não existe
  `public.publicos` lá).
- Aplicada em 09/10 pelo conector do Supabase, que recusa comando destrutivo
  sem confirmação: o `revoke all ... from anon` ficou de fora. O `anon` não lê
  nenhuma linha (RLS sem policy para ele), mas o `revoke` ainda precisa rodar.

### SDR-26 · Campanha nasce do público

- `campanhas.publico_id`, com índice único em (público, conta): uma campanha
  por par. "Começar a abordar" com uma conta que já tem campanha devolve a
  existente.
- Só aparecem as contas da praça do público que o operador opera
  (`pode_ver_perfil`). Conta pausada ou sem LinkedIn aparece com o aviso: dá
  para criar a campanha, mas ela não envia.
- A campanha herda o nome do público (com " (2)" se a conta já tem uma com o
  mesmo nome), o nicho (= nome do público) e o ângulo (texto do público). Nasce
  em rascunho com o fluxo padrão de 4 toques e os textos vazios: até o SDR-29
  gerar o fluxo, alguém escreve as mensagens no editor da campanha para poder
  ativar.
- O ângulo virou texto livre no banco: saíram as chaves estrangeiras de
  `campanhas.angulo` e `leads.angulo` para `angulos`. A tabela `angulos` fica
  como a lista das campanhas criadas à mão, que continuam validando contra
  ela. Campanha de público guarda o ângulo do público mesmo quando é salva no
  editor de campanha, onde ele aparece só para leitura.
- Página do público com as abas Quem · Leads · Abordagem · Resultados
  (`?aba=`). Sugestão só mostra Quem. O editor do público foi para
  `/publicos/[id]/editar`.
- Leads, por conta: contagem (para triar, na régua, em conversa), "Triar"
  abre a triagem filtrada pela campanha e "Importar lista" abre a importação
  com a campanha escolhida. A triagem continua na tela dela: a aba Leads vira
  a lista com nota no SDR-28, junto com a busca do SDR-27.
- Abordagem: status da campanha, o ângulo, o caminho para o editor do fluxo e
  quantos convites personalizados esperam aprovação.
- Resultados: `calcularFunil` ganhou o filtro `publicoId`; a aba mostra o
  funil por conta. A visão por público em Métricas fica para o SDR-30.
- Migration `20261010160000_campanha_do_publico`: coluna e índice novos, e o
  `drop constraint` das duas chaves do ângulo. Aplicada em 09/10 pela CLI do
  Supabase (`supabase db query --linked`, como no PR #2; o conector recusa
  comando destrutivo), junto com o `revoke` que faltava em `publicos`.

### Prompt de referência (09/10/2026)

- O Arthur mandou um prompt de conversa e de primeira mensagem e autorizou
  mudar as regras do épico. Ficou guardado em
  `docs/pesquisa/prompt-de-referencia.md`, com a tabela do que entrou e do
  que ficou de fora.
- Mudou regra: a proposta de conversa vai sem link, e o link de agenda vai
  quando a pessoa aceitar (§4.6). O resto são regras de estilo nos prompts
  (§7) e o `nomeDeEmpresa` no `{{company}}` (§4.1).
- Os prompts subiram para a versão `2026-10-09.1`. O gate do modo automático
  lê o eval pela versão dos prompts: nenhuma praça tem eval na versão nova, e
  ninguém está no automático.
- As regras novas ficam no prompt, não no validador: o validador vale também
  para texto humano, e 30 palavras é regra para a IA.

### SDR-27 · Busca a partir do público

- A busca fica em `campanhas.busca` (jsonb): cargos, palavras-chave, regiões
  e setores (id e nome do LinkedIn), o `cursor` de onde a última parou e
  `esgotada`. Sem busca salva, a aba Leads mostra a inicial do público (os
  cargos dele), sem gravar nada.
- Filtros: os cargos vão em `advanced_keywords.title` como `"A" OR "B"`;
  palavras em `keywords`; região e setor em `location` e `industry`. Porte de
  empresa não tem filtro (§3). Região é obrigatória para rodar.
- Ids de região e setor: o humano procura na lista do LinkedIn
  (`/linkedin/search/parameters`) pela conta da campanha, com atalhos que
  usam o texto do público. A consulta não conta no teto.
- O cursor da página seguinte vai na query, como diz a referência da Unipile.
  O cliente antigo mandava só `{ cursor }` no corpo, o que perderia os
  filtros; a importação por palavra-chave (SDR-04) também passou a usar o
  jeito certo.
- Rodar é um botão (o tick continua desligado). Ordem das checagens: busca
  salva, região, esgotada, conta conectada e saudável, suspensão, janela do
  perfil em dia útil e teto do dia. O teto conta perfis trazidos (soma de
  `resultados` nos eventos `busca_feita` do dia, no fuso do perfil), não
  pedidos.
- A busca para no alvo (o que o humano pediu, até o saldo do dia). Página
  trazida pela metade é refeita na próxima vez: quem já entrou aparece como
  repetido, e ninguém fica de fora. Sem página seguinte, a busca fica
  esgotada; mudar um filtro tira a marca e recomeça do início.
- Erro de limite (429 ou tipo de limite da Unipile): `perfis.busca_suspensa_ate`
  recebe a abertura do próximo dia útil, entra o evento `busca_suspensa` e um
  alerta para o dono do perfil. O status do perfil não muda: convites e
  mensagens seguem. O que veio antes do erro vai para a triagem.
- Tudo o que vem passa por `importarPessoas` com a fonte `unipile_busca`:
  opt-out nem entra na base, pessoa de outro perfil entra bloqueada com o
  motivo, cooldown de empresa marca alerta (§4.7).
- Teto na configuração `busca.max_resultados_dia` (100, D8). Migration
  `20261010170000_busca_do_publico`.

### SDR-28 · Nota de aderência

- `leads.nota` (0 a 100), `nota_motivo` e `nota_em`. A nota vale para todo
  lead em triagem de campanha de público, venha da busca ou de arquivo.
- Modelo de classificação (`IA_MODELO_CLASSIFICACAO`, Haiku 4.5, §5), em lotes
  de 20 pessoas por chamada, até 100 por clique. O Haiku 4.5 não aceita
  esforço nem pensamento adaptativo: a chamada vai só com a saída
  estruturada.
- O público fica no prompt de sistema (estável); as pessoas vão na mensagem,
  numeradas, só com cargo ou headline, empresa e local. Nome e URL não vão
  para a IA. A IA devolve a nota pelo índice; nota fora de 0 a 100 é
  limitada, índice repetido ou fora do lote é ignorado, e quem ficou sem nota
  entra no próximo clique. Não há chamada ao LinkedIn: dar nota nunca visita
  perfil.
- A nota não aprova ninguém. "Aprovar os que passam do corte" é um clique
  humano que manda para `aprovarLeads` os leads em triagem, sem bloqueio, com
  nota a partir de `busca.nota_de_corte` (70, D9): cada um passa pelas regras
  de sempre (opt-out, máximo da campanha). Lead sem nota ou abaixo do corte
  fica para olhar um por um.
- Depois de cada busca com gente nova, a ação já dá a nota (até 100). Se a IA
  falhar, a busca não falha: o botão "Dar nota" fica na tela.
- Na triagem filtrada por campanha de público, a lista vem pela nota, com o
  motivo, e o painel tem "Dar nota" e "Aprovar os N a partir de 70". A aba
  Leads do público mostra o mesmo resumo por conta.
- Custo e versão do prompt (`nota-1`) vão no evento `notas_dadas`. Migration
  `20261010180000_nota_de_aderencia`, que também põe `nota_de_corte` na
  configuração `busca`.

### SDR-29 · Fluxo gerado pelo público

- A IA (`IA_MODELO_RASCUNHO`) escreve só os textos: convite (T1) e as três
  mensagens (T2 a T4). A forma é o fluxo padrão de 4 toques da praça
  (`fluxoComTextos`). Na Espanha, as mensagens viram blocos de tarefa manual
  com o texto como roteiro: o fluxo gerado não tem nenhum bloco de mensagem
  ali.
- O prompt leva o resumo do dossiê confirmado, o público (quem, empresa, dor,
  gatilho, resultado, ângulo e as provas dele), a voz do perfil, as palavras
  proibidas, os tetos de caracteres e as regras do prompt de referência. No
  Canadá, manda terminar cada mensagem com a frase de saída do perfil, igual.
- Dois estilos: `casa` (DM 1 sem pergunta, DM 2 com pergunta fácil) e
  `pergunta` (a variante do prompt de referência). Para comparar, cada estilo
  vai numa campanha; as métricas por campanha mostram a diferença.
- Validação depois da geração: forma do fluxo, convite vazio, o validador da
  §4.2 em cada bloco e `problemasDeProvas` (número citado que nenhuma prova do
  público traz, como "40%" ou "30 dias"). Com problema, uma reescrita que
  recebe a versão barrada e a lista. O que sobrar é salvo assim mesmo e chega
  marcado: o editor mostra, e a ativação recusa. Nunca corrige em silêncio.
- A ativação de campanha de público passou a checar também as provas
  (`mudarStatusDaCampanha`), porque o texto pode ser editado à mão depois.
- Quando nasce (Começar a abordar), a campanha já sai com o fluxo escrito no
  estilo `casa`, se a chave da Anthropic existe. Se a IA falhar, a campanha
  nasce com o fluxo em branco e o aviso diz por quê. Na aba Abordagem, dois
  botões reescrevem (casa ou variante) e levam ao editor. Em campanha ativa,
  `salvarFluxo` cria uma versão nova, que vale para os próximos leads (§4.1).
- Sem migration. Custo, tentativas, problemas, estilo e versão do prompt
  (`fluxo-1`) vão no evento `fluxo_gerado`.

### SDR-30 · Jornada no lugar dos primeiros passos

- Os passos da §4.10 (`dossie`, `publico`, `conta`, `leads`, `ativar`)
  substituem os seis do SDR-19. "Campanha pronta" não mudou (campanha ativa,
  perfil ativo, um lead aprovado), e `operadores.primeira_campanha_em`
  continua valendo: quem já tinha campanha pronta não volta para a jornada.
- Cada passo conta só a organização e os perfis do operador (RLS e
  `pode_ver_perfil`). "Conta" pede campanha de público num perfil ativo e
  conectado; "leads", um lead aprovado em campanha de público; "ativar",
  campanha de público ativa.
- Os links dos passos 3 a 5 vão para o primeiro público escolhido (aba Leads)
  e para o editor da primeira campanha de público.
- Menu em três grupos: Jornada (Início, Oferta, Públicos), Operação
  (Conversas, Resultados) e Gestão (Configurações). Campanhas, Triagem e
  Importar saíram do menu e acendem Públicos quando abertas; as telas
  continuam no ar, porque a página do público leva a elas. A lista de
  campanhas criadas à mão tem um link no fim da tela Públicos.
- Conversas é a inbox, a aprovação e as tarefas manuais com abas em comum
  (`AbasDeConversas`), sem juntar as telas: cada uma continua com a sua rota.
- Resultados é a tela de métricas com a visão por público em primeiro lugar
  (`calcularFunil` ganhou `porPublico`; campanha criada à mão fica fora dela).
- Sem migration.

## Primeiro acesso e SDR (10/10/2026)

Decidido com o Arthur em 10/10/2026: o épico de 29/09 foi substituído por um
novo (`docs/epico.md`), com a experiência refeita por cima do mesmo motor. A
pessoa informa o site, o Kakou analisa negócio, produto e mercado, monta o SDR
(um chatbot que ela testa no papel de lead e refina), mostra os leads do
LinkedIn, recomenda a abordagem e pede permissão; depois ela vincula o
LinkedIn e entra no app (Dashboard, Chats, Pipeline, Campanhas,
Configurações). Tickets SDR-40 a SDR-53, na §9 do épico novo.

- **Leads antes do LinkedIn: prévia pela conta da casa.** A busca do primeiro
  acesso roda por uma conta do LinkedIn da GuessLess marcada como conta da
  casa, que só busca. Alternativas descartadas: mostrar só o perfil do lead sem
  nomes (vira o plano B quando a conta da casa não tem saldo) e pedir o
  LinkedIn antes dos leads (contraria a ordem que o Arthur quer). Risco aceito:
  o limite de busca da conta da casa é dividido entre todas as organizações
  novas, por isso a prévia tem teto por organização (D2). A conta da casa é a
  do Arthur (D1, 10/10), já conectada na Unipile; ela sai da operação da
  GuessLess e não roda campanha. Como ela serve a todas as organizações, a
  busca da prévia roda pelo servidor, fora do RLS de operador, e grava as
  pessoas na organização que está no primeiro acesso.
- **Autonomia: o SDR responde sozinho depois da permissão.** O gate de eval do
  modo automático (§7.1 do épico anterior) sai. O que segura a qualidade passa
  a ser o chat de teste com o mesmo agente da produção, o validador, o "chamar
  você" e o humano assumindo pelo Chats. "Aprovo cada resposta" continua como
  opção; o modo `manual` sai.
- **Acesso: só e-mail de domínio liberado no começo** (`guessless.com.br`).
  Cada e-mail novo ganha a própria organização. Como o Auth é dividido com o GL
  Suite, o cadastro público do projeto continua desligado: o Kakou cria o
  usuário pelo servidor (API admin) só para domínio liberado, e o login segue
  com `shouldCreateUser: false`. Ligar o cadastro público abriria o Auth do GL
  Suite para qualquer um.
- **Regras que ficam:** validador de copy, teto por perfil e parada automática
  (escolha do Arthur), mais as do próprio motor que não estavam em discussão:
  quem responde sai da régua na hora, opt-out e um alvo, um dono.
- **Regras que saem:** regras por praça (Canadá e Espanha) e RD Station. Perfis
  fora do Brasil ficam pausados até as regras voltarem num épico próprio. O
  Pipeline é o CRM.
- **O SDR substitui voz e regras do perfil no agente.** O SDR é da organização,
  com versões; as instruções extras são da campanha. O chat de teste chama a
  mesma decisão da produção com lead fictício, para que o que se testa seja o
  que roda.
- **Mercado é hipótese, Negócio e Produto são fato.** Mantém a regra do dossiê
  (só fato do site) e dá à análise a parte de mercado que o Arthur pediu, sem
  número de tamanho de mercado.
- Numeração dos tickets começa no SDR-40; SDR-31 a SDR-34 do épico anterior
  caíram.

### SDR-40 · Acesso por domínio, organização nova e a moldura do primeiro acesso

- O login pede o link do mesmo jeito (`shouldCreateUser: false`). Antes, para
  e-mail de domínio em `CADASTRO_DOMINIOS`, o servidor cria o usuário no Auth
  pela API admin (`SUPABASE_SECRET_KEY`), já confirmado; "já existe" não é
  erro. Sem a chave, o e-mail liberado só entra se já tiver usuário no Auth
  (o que vale para quem já usa o GL Suite), e o servidor avisa no log.
- `CADASTRO_DOMINIOS` sem valor vale `guessless.com.br`; definida e vazia,
  ninguém novo entra. Só o domínio exato: subdomínio não vale.
- A organização nasce no callback do link, com a conexão do sistema (quem
  ainda não é operador não passa no RLS), numa transação com
  `pg_advisory_xact_lock` pelo id do usuário: dois callbacks criam uma só. O
  lock é de transação, que funciona no pooler em modo transação.
- Operador desativado não ganha organização nova, e um e-mail que já é de
  outro operador não vira um segundo. Nome do operador sai do e-mail
  ("ana.souza" vira "Ana Souza"); o da organização é "Empresa de <nome>" até a
  análise do site (SDR-41) trazer o nome da empresa.
- Portão: `organizacoes.primeiro_acesso_em`. O painel inteiro (`(painel)`)
  passa por `exigirOperadorNoApp`; `/comecar` manda para o app quem já
  terminou. A migration marca as organizações que já têm conta conectada.
- O passo atual sai dos dados, não de uma coluna: site lido → análise;
  análise confirmada → SDR. Os passos seguintes ganham a sua condição nos
  tickets que os constroem. Passo da frente redireciona para o atual; passo
  feito abre para corrigir.
- Cada passo é uma rota estática (`/comecar/site` … `/comecar/linkedin`), para
  cada ticket trocar só a sua página. Até lá, a página mostra a pergunta e
  "Este passo ainda está sendo montado".
- O portão dos primeiros passos (SDR-19/SDR-30) continua por baixo até o
  SDR-47.

### SDR-41 · Análise do site: negócio, produto e mercado

- O Mercado mora dentro do dossiê (`dossie.mercado`: segmentos com o porquê,
  alternativas, gatilhos), sem coluna nova. Dossiê gravado antes lê com o
  Mercado vazio (`default` no esquema). A IA usa `dossieDaIa`, o mesmo esquema
  com o Mercado obrigatório, para a saída estruturada não poder pular a parte.
- Mercado é hipótese, e o prompt diz isso: concorrente com nome só se estiver
  nas notas da leitura; sem número de tamanho de mercado, faturamento ou
  estatística. O esquema não tem campo para tamanho. Prompts em `dossie-2`.
- Objeções eram hipótese desde o SDR-23; na tela elas vão para o bloco
  Mercado. Negócio = empresa, para quem, tom e idioma; Produto = produtos,
  diferenciais, provas e dores.
- Progresso da leitura: `ofertas.leitura_progresso` (`etapa` e `paginas`),
  zerado a cada leitura. A leitura no Claude já era em streaming; cada
  `web_fetch_tool_result` que fecha vira uma página no progresso, gravada em
  fila e sem derrubar a leitura se falhar. Antes de estruturar, a etapa vira
  "analise". A tela recarrega a cada 3 segundos enquanto lê.
- Edição item a item: cada item vira formulário ali mesmo, e cada "OK" grava o
  rascunho na hora (`salvarDossie` sem confirmar). "Está certo, seguir"
  confirma e leva ao passo 3. O editor antigo de Oferta continua no ar até o
  SDR-53 e preserva o Mercado ao salvar.
- Durante o primeiro acesso, confirmar a análise dá à organização o nome da
  empresa que a análise trouxe (`confirmarAnalise`). Depois do primeiro
  acesso, o nome só muda em Configurações.
- Local: `vercel env pull` traz a chave da Anthropic vazia, e o validador do
  ambiente recusa string vazia; para ver as telas que leem o site, rode com
  uma chave qualquer (nada é chamado sem clicar em Analisar).

### SDR-42 · O SDR da organização

- `sdrs` (um por organização, com a versão atual) e `sdr_versoes` (cada
  versão, com origem `ia`, `humano`, `ajuste` ou `desfazer`, e o pedido e o
  resumo quando é ajuste). Versão nova = `on conflict` que soma 1, na mesma
  transação do histórico. RLS pela organização; versões pela organização do
  SDR.
- Esquema do SDR no domínio (`domain/sdr.ts`): objetivo, voz, abertura,
  qualificação, objeções, regras, quando chamar você e link de agenda (só
  https). A IA usa `sdrDaIa`, sem o link: quem preenche o link é a pessoa.
  Gerar de novo mantém o link que já estava.
- O SDR nasce logo depois de confirmar a análise no primeiro acesso (`after`
  na ação), em nome do operador. `garantirSdr` não gera de novo quem já tem.
- **O agente nunca gera SDR sozinho.** Sem SDR, o prompt fica exatamente como
  antes: voz e regras do perfil e o texto de oferta da configuração. Era o
  combinado no épico ("na primeira vez que o agente roda"), mas isso mudaria a
  voz das conversas do Juliano, que está ativo, sem ninguém ver o SDR. O
  épico foi ajustado: o SDR de organização antiga nasce quando alguém abre o
  SDR (Configurações, SDR-51).
- Com SDR, o prompt de sistema é: a análise confirmada (`resumoDaOferta`), o
  SDR (`textoDoSdr`), a missão (o objetivo do SDR) e as regras da casa por
  último, marcadas como acima do SDR. As regras do perfil saem; as da praça
  (Canadá) ficam até o SDR-53. O link de agenda vem do SDR, depois o do
  responsável, depois o do perfil. Prompts em `2026-10-10.1`.
- As instruções da campanha (`campanhas.instrucoes_sdr`, até 1.000
  caracteres) vão na mensagem do usuário, para o prompt de sistema seguir
  igual em todas as campanhas e cair no cache.
- `rascunhos.sdr_versao` grava a versão que escreveu.
- O responsável pela discovery (`responsavel_discovery`) passa a ser buscado
  só na organização do lead: antes, o slug achava o perfil de qualquer
  organização.
- Testes: cada teste clona um Postgres em WASM, e os clones só eram soltos
  pelo coletor de lixo; com os testes novos do agente, a máquina de 8 GB
  estourou. Os clones agora fecham no fim de cada teste
  (`tests/support/setup.ts`).

### SDR-43 · Chat de teste: você no papel de lead

- O SDR passou a nascer na abertura do passo 3, dentro de um `Suspense`
  ("Montando o seu SDR a partir da análise"), e não mais num `after` da
  confirmação: os dois juntos geravam o SDR duas vezes. Recarregar no meio
  ainda pode gerar uma versão a mais; aceito.
- **O teste usa o caminho da produção.** A resposta é `decidirResposta`, com a
  mesma `EntradaDoAgente`: o SDR e a análise da organização, um lead fictício
  (Marina, Sarah ou Lucía, pelo idioma da análise) no segmento escolhido.
  Sem palavras proibidas de perfil, porque a conta ainda não existe. A
  abertura usa `abrirConversa`, que monta o mesmo prompt de sistema
  (`sistemaDoRascunho`) e passa pelo mesmo validador; só a mensagem do
  usuário muda ("a pessoa acabou de aceitar o convite").
- O que não é resposta comum vira nota no fio: o SDR chamaria a pessoa (com o
  motivo), registraria o opt-out, não responderia ausência, encerraria. A
  ressalva (preço, reclamação, validador, baixa confiança) fica no próprio
  balão, em âmbar: "na produção, esperaria a sua aprovação".
- Ajuste: chamada própria (`promptDoAjuste`, `ajuste-1`), com o SDR sem o
  link, o pedido, a resposta apontada e a conversa. Devolve o SDR inteiro, o
  resumo e a recusa; recusa não grava versão. O link de agenda é mantido.
  Depois do ajuste, a última resposta do SDR sai do fio e é escrita de novo
  com o SDR novo; o resumo fica antes dela. Se a resposta nova falhar, o
  ajuste continua valendo e o fio fica com o aviso.
- As regras da casa não moram no SDR, então nenhum ajuste as tira; mesmo um
  SDR que diga "pode usar travessão" fica abaixo delas no prompt (teste).
- Desfazer grava como versão nova exatamente o SDR da versão anterior. O
  botão aparece só no último ajuste, enquanto ele for a última mudança.
- O teste fica em `sdr_testes` (um por organização) e roda com a conexão do
  sistema, sempre na organização do operador: as chamadas da IA levam
  segundos e não devem segurar uma transação aberta.
- "Ficou bom" grava `sdrs.aprovado_em`, que conclui o passo 3.

### SDR-44 · Leads: público e prévia pela conta da casa

- **A prévia fica à parte, não vira campanha.** O épico dizia "a campanha
  nasce em rascunho, sem perfil, com os leads em triagem". Campanha, lead e
  pessoa supõem um perfil em todo o motor (um alvo um dono, cooldown, teto,
  agente); abrir exceção para perfil nulo espalharia o caso por tudo. A
  prévia mora em `previas` (uma por organização, pessoas em jsonb, no máximo
  25) e vira lead no SDR-46, pela conta da organização, passando pelas regras
  de importação de sempre. O épico foi ajustado.
- **Conta da casa:** `perfis.casa`, marcada pela migration na conta do Arthur
  só se ela estiver conectada (no banco de teste ela não está, e os testes que
  usam o perfil do Arthur seguem iguais). O despachante, a pesquisa de perfil
  e a escolha de conta da campanha ignoram a casa; despausar a casa é
  recusado.
- **A busca da prévia roda a qualquer hora.** As buscas das contas que
  prospectam continuam só na janela; a da prévia, não, para quem chega à
  noite também ver nomes. O teto do dia da conta da casa vale: a prévia grava
  `busca_feita` no perfil da casa, e `buscadosHoje` soma tudo.
- **Dois tetos:** `previa.max_pessoas` (configuração nova, padrão 25) soma
  todas as buscas da organização, mesmo trocando de público; e o teto de
  busca do dia da conta da casa. Esgotado qualquer um, a prévia fica sem
  nomes, com o motivo, e o passo segue.
- **Região:** a busca clássica precisa do id do LinkedIn. O Kakou procura o
  texto da região do público pela conta da casa; sem achar, procura "Brasil";
  sem achar nada, fica sem nomes. Setor fica de fora da busca (cai na nota).
- Opt-out (tabela `optouts` e `pessoas.optout_em`) nunca aparece; a mesma
  pessoa vem uma vez só. Um alvo um dono e cooldown de empresa só fazem
  sentido com perfil: valem na importação do SDR-46.
- Erro de limite do LinkedIn suspende a busca da casa por 24 horas.
- Duas buscas da mesma organização ao mesmo tempo: a segunda espera a
  primeira (status `buscando`, que vale por 3 minutos).
- "Trocar o perfil do lead" devolve o público para sugestão e zera a lista;
  o teto da prévia continua somando. O passo 4 termina com pelo menos uma
  pessoa marcada, ou sem nomes.
- Na tela, a nota aparece num anel, como o alvo da marca: verde a partir do
  corte, apagado abaixo.

### SDR-45 · Abordagem recomendada e permissão

- Como a prévia, a abordagem do primeiro acesso fica à parte (`abordagens`,
  uma por organização): ainda não há conta nem campanha. No SDR-46 ela vira o
  fluxo da campanha (`fluxoComTextos`) e a permissão vai junto para
  `campanhas.permitida_em/por`.
- Os textos saem do mesmo escritor do fluxo gerado (SDR-29), com o perfil do
  primeiro acesso: o nome do operador, Brasil, sem palavras proibidas de
  perfil, e a voz do SDR com o jeito de abrir. A escrita com uma reescrita
  quando o validador barra virou `escreverComRevisao`, que o fluxo da campanha
  também usa.
- Validação igual à da campanha: forma do fluxo, validador (§4.2) e número
  fora das provas do público. Editar um texto valida a abordagem inteira de
  novo.
- Editar ou gerar de novo apaga a permissão: a pessoa permite o que está na
  tela. Com problema, "pode entrar em contato" fica travado.
- Fora do primeiro acesso, ativar a campanha é a permissão: a primeira
  ativação grava quem e quando. Assim a tela antiga de campanhas segue
  funcionando até o SDR-50.
- O "o que vai acontecer" mostra quantas pessoas marcadas, a rampa padrão
  (`RAMPA_PADRAO`, 8 · 12 · 15 convites/dia e 75 por semana, D3), a janela,
  e quando o SDR chama a pessoa (preço, reclamação e o "quando chamar você"
  do SDR).

### SDR-46 · Vincular o LinkedIn e começar

- "Vincular meu LinkedIn" cria (ou reaproveita, com lock pela organização) o
  perfil da pessoa: pausado, Brasil, fuso de São Paulo, o idioma da análise,
  `modo_resposta = automatico` (§4.7), `RAMPA_PADRAO` e 75 por semana (D3), sem
  palavras proibidas de perfil, `operador_id` e `operador_perfis` da pessoa.
  O hosted auth volta para `/comecar/linkedin`.
- `concluirPrimeiroAcesso` leva tudo para a conta, e roda pelo aviso da
  Unipile (`/api/unipile/conta`, depois do `registrarContaConectada`) e pela
  volta da pessoa à tela, o que vier primeiro. É idempotente, e só um leva por
  vez (`abordagens.vinculando_em`, que vale por 2 minutos; a campanha criada
  fica em `abordagens.campanha_id`).
- A ordem: a campanha nasce do público na conta da pessoa, com
  `fluxoComTextos` da abordagem e a permissão dela; as marcadas da prévia
  entram por `importarPessoas` (fonte `unipile_busca`, arquivo "prévia do
  primeiro acesso"), levando a nota da prévia; o perfil despausa; a campanha
  ativa (o validador roda de novo, agora com o limite real da conta); as
  pessoas aprovadas vão para a fila em nome de quem permitiu; o primeiro
  acesso termina.
- Prévia sem nomes: a campanha começa sem leads, com a busca do público e a
  região da prévia salvas, para buscar pela conta da pessoa.
- Conta gratuita aceita nota de convite de até 200 caracteres, e no primeiro
  acesso ainda não se sabe o tipo da conta: a abordagem (SDR-45) passou a
  validar o convite em 200. Se mesmo assim a ativação barrar, a tela explica e
  manda de volta para a abordagem.
- [verificar] o id da pessoa trazido pela conta da casa vale na conta da
  pessoa? A aprovação já consulta a conta nova (`jaEConexao`); se o id não
  valer, o envio falha com erro permanente e o lead vai para revisão. Ver com
  a primeira conta real.
