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
- Conversa com quem não é lead do SDR não é gravada (privacidade).
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
  âmbar, acima em verde: é referência, não meta. O sistema cria a primeira linha
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

### Painel · tema visual (09/10/2026)
- O tema é escuro, com um só destaque laranja (`--color-destaque`). O
  laranja aparece em dois lugares: no item ativo do menu e na ação principal
  da tela, e no máximo uma ação principal por tela ou por cartão. Os status
  (ok, atenção, erro, info) ficam só em etiquetas e avisos.
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
- Contraste mínimo de 4,5:1 nos textos pequenos. Por isso o texto fraco é
  `#85858d`, e o botão principal usa um laranja um pouco mais fundo que o da
  referência.
