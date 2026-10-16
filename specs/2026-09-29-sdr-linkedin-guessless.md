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
  empresa não tem filtro (§3). Região é obrigatória para rodar (desde o
  SDR-59, só quando a busca não tem lista de empresas). Cargo também (desde o
  SDR-121, só sem lista).
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
  passa por `exigirOperadorNoApp`; `/onboarding` manda para o app quem já
  terminou. A migration marca as organizações que já têm conta conectada.
- O passo atual sai dos dados, não de uma coluna: site lido → análise;
  análise confirmada → SDR. Os passos seguintes ganham a sua condição nos
  tickets que os constroem. Passo da frente redireciona para o atual; passo
  feito abre para corrigir.
- Cada passo é uma rota estática (`/onboarding/site` … `/onboarding/linkedin`), para
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
  O hosted auth volta para `/onboarding/linkedin`.
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

### SDR-47 · Menu novo e Dashboard

- Menu plano, sem grupos: Dashboard (`/`), Chats, Campanhas e Configurações.
  Pipeline entra no menu com a tela, no SDR-49. Até o SDR-48, Chats abre a
  inbox que já existe; as telas antigas que ainda servem (aprovação, tarefas,
  públicos, triagem, perfis) acendem o item que vai substituí-las.
- Sai o portão dos primeiros passos: `exigirOperadorLiberado` e o módulo
  `primeiros-passos` foram apagados. Fica só o portão do primeiro acesso.
- **Conta** é o elemento marcante (`cartao-vitrine`): o alvo com um anel por
  conta (convites de hoje contra o limite) e, por conta, status, semana da
  rampa, modo de resposta, convites e mensagens de hoje contra o teto,
  convites da semana contra o teto semanal e aceite em 3 dias úteis. Pausar
  fica ali (§4.13). Ativar e retomar também, até Configurações › LinkedIn
  (SDR-51). A conta da casa não aparece: ela só busca.
- **Precisa de você:** a conversa entra quando está com humano (o SDR chamou
  você ou você assumiu) ou a conta escreve à mão, e a última mensagem é da
  pessoa. Cada conversa vira um item próprio, que abre a própria conversa,
  com o motivo de o SDR ter chamado. São até 5, e o resto vira um item que
  leva aos Chats. Conversa que o SDR responde sozinho não entra. Depois vêm
  as respostas para aprovar e os leads parados (aprovação), a conta pausada
  (âncora da conta no Dashboard), a desconectada (reconectar), as tarefas
  manuais e a triagem, enquanto essas telas existirem.
- **Números** da semana e do mês viraram "7 dias" e "30 dias" corridos: segunda
  de manhã não zera. Contam o que aconteceu no período, não uma turma de
  convites. Os convites saem de `acoes` enviadas, os aceites de
  `leads.aceito_em`, e conversas, qualificados e reuniões dos eventos
  `lead_transicao`, com cada lead contado uma vez por etapa. Parâmetro
  `?period=30d`. Os resultados por campanha (`/metricas`) saíram do menu e
  ficam num link da seção até o SDR-50 levá-los para Campanhas.
- **SDR:** versão, última mudança (origem, quem, quando, resumo) e o modo de
  resposta das contas. Organização sem SDR vê que cada conta responde com a
  própria voz (§4.1).

### SDR-48 · Chats: a réplica das DMs

- Rotas: `/chats` (lista), `/chats/[leadId]` (conversa de campanha) e
  `/chats/thread/[conversaId]` (conversa fora de campanha). `/inbox` e as
  rotas dela redirecionam. No desktop são três colunas (lista, conversa e
  dados do lead), cada uma com a própria rolagem. Abaixo de `xl`, os dados do
  lead ficam num "Dados do lead" recolhido no topo da conversa. No celular, uma
  coluna por vez.
- Quem conduz a conversa: **com você** é `escalado_humano`, ou a conta no modo
  manual, até o SDR-52 tirar esse modo. **Precisa de você** é com você e com
  a última mensagem da pessoa, ou com resposta do SDR esperando aprovação. O
  resto é **SDR conversando**. Filtros `?filter=all|sdr|you|needs-you`. A
  conversa fora de campanha só aparece em Todas, porque não tem SDR nem prazo.
- Marca de cada mensagem: a régua (`sistema`) e a IA (`ia`) aparecem como
  **SDR**; `humano` aparece como **Você**, inclusive a resposta escrita
  direto no LinkedIn. Marcos no fio: convite enviado, aceitou, o SDR chamou
  você (com o motivo), fulano assumiu, a conta respondeu direto no LinkedIn,
  devolveu ao SDR, qualificado, reunião marcada, disse não, opt-out, sequência
  sem resposta e convite retirado.
- Responder pelo Chats tira o SDR em `aceito`, `em_sequencia`, `em_conversa`
  e `qualificado`: o lead vai para `escalado_humano`, e a régua e as
  respostas do SDR esperando aprovação são canceladas. Em `reuniao_marcada`
  não há transição permitida, e o SDR já não responde ali.
- "Devolver ao SDR" só sai de `escalado_humano` e volta para `em_conversa`. O
  SDR responde a próxima mensagem da pessoa: a varredura do agente pega
  mensagem sem resposta, mas a mensagem que fez o SDR chamar você já tem
  rascunho e não volta para ele.
- No modo "aprovo cada resposta", toda DM esperando aprovação do lead (resposta
  de conversa ou toque da régua) aparece no fim do fio, com o motivo quando o
  validador barrou. Enviar e Editar usam a aprovação que já existia (a
  resposta de conversa sai na hora, o toque volta para a fila do
  despachante). Descartar é a rejeição. As abas Aprovação e Tarefas continuam
  até o SDR-53 (leads parados e tarefas manuais).
- A tela busca de novo a cada 15 s, só com a aba visível (`router.refresh`).
  O selo de prazo de resposta (SLA) saiu da tela; o alerta por e-mail continua
  até o SDR-52.
- Os dados do lead mostram cargo, empresa, local, campanha, etapa do Pipeline
  (colunas da §4.10 em `domain/pipeline.ts`, que o SDR-49 reaproveita), nota,
  conta e o link do perfil. Mover no Pipeline (qualificado, reunião marcada,
  disse não, opt-out) fica ali. A conta da casa não tem conversa no Chats.

### SDR-49 · Pipeline

- `/pipeline`, no menu entre Chats e Campanhas. As colunas são as da §4.10
  (`domain/pipeline.ts`). Encerrado fica recolhida, num `details` no fim da
  fileira. No celular, as colunas rolam de lado.
- O card mostra o nome, o cargo e a empresa, a nota (destacada a partir da
  nota de corte, 70), a última atividade e a conta, quando a pessoa opera
  mais de uma. Clicar no card abre o chat do lead (`/chats/[leadId]`).
- A última atividade é a mais recente entre a criação do lead, o convite, o
  aceite, o último toque, a resposta e a última mensagem. Cada coluna mostra
  até 60 cards, os mais recentes primeiro, e o total.
- Mover à mão é um menu "Mover" com só os destinos que valem a partir da
  etapa do lead (`destinosPermitidos`): Qualificado, Reunião marcada (pede a
  data) e Encerrado, que à mão é "disse não". O servidor passa pela mesma
  transição (`marcarDesfecho`): movimento inválido não acontece e volta com o
  motivo. Arrastar e soltar ficou de fora: o menu é acessível e funciona no
  celular.
- Filtros `?campaign=` e `?account=` (o de conta só aparece com mais de uma
  conta). A conta da casa fica de fora.
### SDR-52 · O SDR responde sozinho

- Dois modos por conta: `automatico` (o SDR responde sozinho, padrão da conta
  vinculada no primeiro acesso) e `aprovacao` ("aprovo cada resposta"). O
  `manual` saiu: a migration `20261011010000_sem_modo_manual` passa quem
  estava nele para `aprovacao` e troca a constraint. O seed do JP passou a
  `aprovacao` para a reaplicação das migrations continuar idempotente; a
  Espanha segue com DM à mão pela rampa sem DM e pelas tarefas manuais, até o
  SDR-53.
- Ligar o automático não passa mais pela trava (eval aprovado, dias em
  aprovação, taxa de edição). O eval continua registrável em Perfis, para
  comparar versões de prompt. O rebaixamento automático por taxa de erro
  continua: é uma guarda de segurança, não uma trava para ligar.
- O SDR chama você e para de responder naquela conversa, em qualquer modo,
  quando: o modelo decide escalar (pedido fora do comum ou item de "Quando
  chamar você" do SDR, que já estava no prompt), a classificação aponta preço
  ou reclamação, a confiança da decisão fica abaixo de
  `agente.limiar_confianca`, o opt-out é ambíguo, ou ele quer marcar a reunião
  e não há link de agenda. Antes, no automático, esses casos iam para a fila
  de aprovação. Agora o lead vai para `escalado_humano`, nada sai, e o e-mail
  "O SDR chamou você" traz o motivo e o link da conversa no Chats. O e-mail
  depende da T-4 (Resend).
- Texto barrado pelo validador continua sendo a única exceção que vira
  resposta para aprovar, com o motivo, nos dois modos. Nunca sai sozinho.
- O dono que escreve direto no LinkedIn também tira o SDR em `em_conversa` e
  `qualificado`, não só na régua. Para isso não pegar a própria DM do SDR: o
  eco que chega enquanto a ação ainda está `enviando`, com o mesmo texto, é
  reconhecido como nosso.
- O chat de teste segue a mesma regra: pergunta de preço vira a nota "Aqui o
  SDR pararia e chamaria você".

### SDR-50 · Campanhas

- A campanha virou o centro: `/campaigns/[id]` com as abas `?tab=audience`
  (Público), `leads`, `approach` (Abordagem), `sdr` (Instruções do SDR) e
  `results` (Resultados). A aba padrão é Leads. A tela antiga de Públicos
  continua até o SDR-53; os componentes de busca, edição de público e
  importação vêm de lá, com um destino novo para voltar à campanha.
- **Permissão:** campanha em rascunho mostra no topo "Pode entrar em contato?",
  com o que vai acontecer. O botão ativa a campanha, e ativar já gravava quem
  permitiu e quando (SDR-45). Pausar, retomar e encerrar ficam no cabeçalho.
- **Leads:** a busca pela conta da campanha (a mesma do SDR-27), a nota, e
  "quem entra na campanha": a lista da triagem com marcar todos, colocar os
  marcados na fila e tirar os marcados. Importar uma lista fica recolhido no
  fim.
- **Abordagem:** a linha do tempo é o caminho do "sim" no fluxo (convite,
  aceite, esperas e mensagens; `domain/linha-do-tempo.ts`), com cada texto
  editável. Salvar valida tudo (texto em branco pode ficar no rascunho, porque
  a ativação barra) e usa o `salvarFluxo` que já existia: com lead andando,
  nasce uma versão nova para quem entrar depois. Fluxo com desvio avisa que
  os textos fora do caminho ficam no editor de blocos, que ficou recolhido
  como avançado. "Escrever de novo com a IA" usa a voz do SDR quando ele
  existe (o `gerarFluxo` passou a ler o SDR).
- **Instruções do SDR:** texto livre de até 1000 caracteres, gravado em
  `campanhas.instrucoes_sdr`. O agente já o punha na mensagem do usuário só
  da campanha do lead (SDR-42); o teste do "não vaza para outra campanha" é
  deste ticket.
- **Resultados:** o funil da campanha (`calcularFunil` ganhou o filtro por
  campanha), com convite de template contra convite personalizado quando há
  os dois.
- **Nova campanha** (`/campaigns/new`): escolher o público (os escolhidos e as
  sugestões da IA, que viram escolhidos ao criar), pedir sugestões, ou criar
  um do zero ali mesmo; escolher a conta. Cria em rascunho com a abordagem
  escrita na voz do SDR e abre na aba Leads. O editor de campanha em branco
  saiu da rota `new`.
- A lista mostra campanha, público, conta, status e os números (para
  decidir, na fila, convites, conversas, reuniões). A planilha-espelho (CSV)
  ficou num botão só, do Brasil, até as praças saírem.
### SDR-51 · Configurações

- Abas em rotas próprias: `/settings/company` (Empresa), `/settings/sdr`,
  `/settings/linkedin` e `/settings/team` (Equipe). `/settings` abre a
  Empresa. `/perfis`, `/oferta` e `/settings/organization` saíram e
  redirecionam para a aba que os substitui. O retorno do hosted auth fora do
  primeiro acesso volta para `/settings/linkedin`.
- **Empresa:** o mesmo editor da análise do primeiro acesso, que passou a
  receber a ação de confirmar. Aqui confirmar só grava a versão confirmada,
  sem renomear a organização e sem seguir para o SDR. "Ler o site de novo"
  gera um rascunho que só vale depois de confirmado (§4.2); a análise de antes
  continua valendo enquanto a leitura roda.
- **SDR:** os campos do §4.3, editáveis, e salvar vira versão nova. "Testar no
  chat" abre `/settings/sdr/test`, o mesmo chat do primeiro acesso sem o
  "Ficou bom, seguir" (`comSeguir={false}`). O histórico mostra cada versão
  com origem, quem, quando, pedido e resumo; "Voltar para esta" grava a versão
  antiga como versão nova (origem `desfazer`), sem perder nada. O modo de
  resposta de cada conta fica aqui, porque é sobre como o SDR responde
  (§4.12), e vale para a próxima resposta: o agente lê o modo na hora. A
  organização sem SDR (§4.1) vê "Montar o SDR".
- **LinkedIn:** cada conta com o status, o tipo de conta, a rampa, o teto
  semanal e a janela (só leitura); pausar, retomar e reconectar. A primeira
  ativação continua no Dashboard, com o checklist. "Vincular outra conta" cria
  uma conta pausada, com a rampa padrão e o SDR respondendo sozinho, operada
  por quem vincula (`contaNovaDoLinkedin`): uma conta dela ainda sem LinkedIn
  é reaproveitada, e dois cliques não criam duas. As ferramentas de admin
  (status, webhooks, eval) vieram de Perfis.
- **Equipe:** o nome da organização, e para cada membro o papel e as contas
  que opera. Só o admin muda, e o servidor confere (`equipe.ts`): mesma
  organização, só contas dela (sem a da casa), e a organização nunca fica sem
  admin. Convidar alguém continua com o suporte, porque criar usuário no Auth
  depende da `SUPABASE_SECRET_KEY` (T-5).
- O `AtualizarSozinho` compartilhado passou a não recarregar com a aba
  escondida, e os Chats usam ele.

### SDR-53 · Sai o que ficou para trás

Em três PRs, para cada um ser revisável e publicável sozinho.

- **1/3, RD Station:** saem o cliente e a sincronização (`server/rd`), a fila
  `rd_eventos`, a coluna `leads.rd_deal_id`, a configuração `rd_station`, a
  variável `RD_STATION_TOKEN`, a etapa `rd` do tick e a tela de Integrações
  (`/integracoes` redireciona para Configurações › LinkedIn). Os pontos que
  enfileiravam eventos (triagem, convite enviado, resposta, qualificado,
  reunião) só deixaram de enfileirar; o resto do que fazem não mudou. A
  reaplicação das migrations continua idempotente: as antigas recriam a
  tabela, e a `20261011020000_sem_rd_station` tira de novo.
- **2/3, telas antigas:** saem Públicos, Triagem, Importar, Aprovação,
  Tarefas e Resultados (`/metricas`), e as abas Conversas. Cada rota antiga
  redireciona para a tela que a substitui: públicos, triagem e importar vão
  para Campanhas; aprovação vai para Chats com "Precisa de você"; tarefas vão
  para Chats; resultados, para o Dashboard. Os componentes que continuam
  (busca, editor e resumo do público, sugerir públicos, importar lista)
  mudaram para Campanhas, com as ações deles (`acoes-do-publico.ts`,
  `acoes-de-importacao.ts`).
- O que a Aprovação resolvia foi para o Chats. Convite esperando aprovação
  aparece no fim da conversa, como a resposta. Lead com a sequência parada
  mostra o motivo no painel do lead, com "Tentar de novo" (o toque volta para
  aprovar ali) e "Assumir a conversa".
- O "Precisa de você" lista cada lead com resposta para aprovar ou sequência
  parada (até 5, o resto vai para os Chats) e, por campanha, quem espera você
  decidir (até 3 campanhas, cada uma leva à aba Leads dela). O item de tarefas
  manuais saiu: só existia para a Espanha, que sai na parte 3.
- **3/3, regras por praça:**
  - **Canadá:** saem a regra do validador que exigia a frase de saída na DM,
    as instruções de rodapé nos prompts do agente e do fluxo, e o rodapé no
    contexto de validação.
  - **Espanha:** a DM não vira mais tarefa manual (no fluxo gerado, no motor
    e na reserva do despachante), e saem a trava de DPA (configuração
    `travas`), os avisos no editor e o bloqueio do automático.
  - **Público:** sai o campo de praça (esquema, sugestão da IA, editor e
    prompts), e qualquer conta da organização aborda qualquer público.
  - **O que fica no perfil:** `perfis.praca` como a chave do calendário de
    feriados ("fuso e feriados ficam no perfil"). A praça ainda escolhe o tom
    padrão e o idioma dos prompts, e o eval segue com casos por praça, porque
    é ferramenta interna.
  - **Banco:** as colunas `perfis.rodape_obrigatorio` e `publicos.praca` ficam
    sem uso, porque migrations anteriores ainda as citam e a reaplicação tem
    de continuar idempotente. O público novo grava `domestico`.
  - **Editor de blocos:** o bloco "Tarefa manual" saiu da paleta, porque só
    existia para a Espanha. Fluxo antigo com tarefa continua abrindo e rodando.
  - Os prompts mudaram de versão: agente `2026-10-11.1`, fluxo `fluxo-2`,
    públicos `publicos-2`.

### Slugs de URL em inglês (10/10/2026)

- Pedido do Arthur: slug de URL sempre em inglês. O código, os nomes de
  domínio e os textos da tela continuam em português; só a rota muda.
- `/comecar` virou `/onboarding` (passos `site`, `analysis`, `sdr`, `leads`,
  `approach`, `linkedin`); `/campanhas` virou `/campaigns` (`/campaigns/new`);
  `/configuracoes` virou `/settings` (`/settings/organization`); `/auth/sair`
  virou `/auth/logout`. O id do passo segue o domínio (`analise`,
  `abordagem`) e `rotaDoPasso` traduz para o slug.
- As rotas antigas redirecionam (307, no `next.config.ts`): link de e-mail,
  favorito e o retorno do hosted auth que já estava em andamento continuam
  funcionando. 307 e não 308 enquanto as rotas ainda mudam neste épico.
- As telas que saem no SDR-53 (Oferta, Públicos, Triagem, Importar,
  Aprovação, Tarefas, Resultados, Perfis, Integrações) não foram renomeadas:
  somem nesse ticket e redirecionam para as telas novas, que já nascem em
  inglês (`/chats`, `/pipeline`). Rotas de API chamadas de fora (webhook da
  Unipile, retorno do hosted auth, cron, saúde) ficam como estão até o
  destino externo mudar junto.

### SDR-57 · Editar nome e horário da conta (14/10/2026)

- **Nome da conta:** o perfil nascia com o nome de quem estava logado, e o
  agente escreve "em nome de" `perfis.nome`. Com o LinkedIn de outra pessoa,
  o SDR falava pela pessoa errada. Agora o callback do hosted auth grava o
  nome do dono (`/users/me`) quando a conta do perfil muda. Reconectar a
  mesma conta não mexe no nome, para não desfazer uma edição.
- **Quem edita:** o RLS de `perfis` que já existia (admin ou
  `perfis.operador_id`). Quem só opera a conta por `operador_perfis` pausa,
  mas não edita. Sem migration.
- **Janela:** só início e fim. `jitter_min` fica como está, e os dias seguem
  úteis. Mínimo de 1 hora, para caber o intervalo de 3 a 12 minutos entre
  ações. O despachante confere a janela na hora de enviar, então vale na
  próxima ação, sem reagendar nada.
- Rampa, teto e dias da semana continuam fixos: mexem no risco da conta.

### SDR-58 · Busca de leads a qualquer hora (14/10/2026)

- Pedido do Arthur: a busca de leads pode rodar a qualquer momento. Antes,
  só a busca da prévia (conta da casa) rodava fora da janela; a da campanha
  esperava dia útil, das 9h às 18h.
- Sai só a trava de janela de `rodarBusca`. Continuam o teto de busca do dia
  (contado no dia local da conta), a suspensão por erro de limite até o dia
  útil seguinte e o status da conta na Unipile.
- Convites, mensagens e a visita de perfil da pesquisa seguem na janela.

### SDR-59 · Lista de empresas na busca (14/10/2026)

- Pedido do Arthur: alimentar o Kakou com uma planilha que não é de leads (ex.:
  só os nomes de administradoras judiciais) para ele buscar pessoas nessas
  empresas. A lista é **salva por organização** e reaproveitada por várias
  campanhas, porque a mesma planilha serve a públicos diferentes (sócio,
  jurídico, financeiro) e a procura das páginas no LinkedIn é cara: fazer uma
  vez e guardar.
- **Sem teto de empresas por lista**, por decisão do Arthur ("pode ser
  infinitas"). O que existe é só cuidado de transporte: o navegador manda os
  nomes em partes de 1000 por chamada (o corpo da server action na Vercel vai
  até 4,5 MB) e o servidor insere em blocos de 500. A tela da lista mostra até
  300 empresas de cada situação, com as contagens completas.
- Tabelas `listas_de_empresas` e `empresas_da_lista` (migration
  `20261014120000_listas_de_empresas`), com RLS pela organização do operador
  (as empresas pela lista delas) e o grant para `sdr_servidor`. A empresa
  guarda o nome como veio, a chave (`chaveDaEmpresa`, única por lista: a
  repetida entra uma vez), a situação (`a_procurar`, `achada`, `escolher`,
  `sem_pagina`), a página do LinkedIn e as opções da procura.
- Leitura (`domain/lista-de-empresas.ts`, roda no navegador e no servidor):
  CSV, ou texto colado com tab (planilha), vira tabela e a coluna vem pelo
  apelido (nome da empresa, empresa, company, nome fantasia, razão social,
  organization…; empresa ganha de nome); sem cabeçalho reconhecível, a
  primeira coluna desde a primeira linha. TXT e texto colado sem tab são um
  nome por linha (vírgula no nome não quebra), sem a primeira linha se ela for
  só o título da coluna. O parser de CSV da importação virou `lerLinhasCsv`.
- **Procura** (`server/listas/listas.ts`): `GET /linkedin/search/parameters`
  com `type=COMPANY`, até 20 empresas por chamada, pausa aleatória de 1 a 3 s
  entre consultas (injetável; os testes não esperam). A tela repete a chamada
  até não faltar nenhuma, mostra o progresso e tem "Parar". Cada resultado é
  gravado na hora, então parar ou cair no meio não perde o que já foi feito.
  Erro de limite para a leva e devolve a mensagem; não suspende a busca do
  perfil (é consulta de lista, como região e setor, e não conta no teto).
- **Conta usada na procura:** a primeira conta da organização com LinkedIn
  conectado e status saudável (ou sem status ainda), deixando a conta da casa
  por último (`order by casa, criado_em`). Sem nenhuma, a tela manda vincular
  em Configurações. A consulta roda como o operador (perfis são visíveis para
  toda a organização); a chamada à Unipile fica fora da transação.
- **Conta recusada na procura** (bug de 16/10/2026): a Unipile devolveu
  `401 invalid_credentials` em `GET /linkedin/search/parameters` para a conta
  do Juliano (Votto) com o status da conta ainda `OK` no webhook, e a leva
  parava com "O LinkedIn não respondeu". O primeiro diagnóstico culpou a conta
  (a referência do endpoint diz que todo 401 é "conta desconectada"). Errado:
  a conta da casa foi recusada igual, e o link do hosted auth, que não usa
  conta, deu `401 missing_credentials`. Era a chave da API de produção. Ou
  seja, com a chave morta, endpoint com `account_id` pode devolver
  `invalid_credentials`, igual a conta desconectada.
  - Erro da classe `conta` (`classificarErro`) tira a conta da leva e a
    próxima saudável refaz a mesma empresa, sem pausa extra; o resultado traz
    um `aviso` com quem reconectar, que a tela da lista e a da conversa
    mostram. A conta da casa aparece como "da casa", porque Configurações não
    a mostra.
  - `missing_credentials` (`chaveRecusada`) para a leva na hora e diz que é a
    chave, não a conta. Todas as contas recusadas de uma vez: a mensagem
    aponta a chave. Uma conta só, recusada: reconectar e, se continuar,
    conferir a chave.
  - A procura não pausa o perfil nem muda `unipile_status` (é consulta de
    lista; o tick sincroniza o status e o despachante pausa no envio, §4.4).
  - Configurações > LinkedIn mostra "Reconectar o LinkedIn" em toda conta
    vinculada (destacado só quando o status não é saudável), porque a Unipile
    pode recusar a conta com o status OK. Falha da Unipile ao gerar o link
    (`mensagemDaFalhaDoLink`) volta para a tela com a mensagem, em vez da
    página de erro: 401 ali é a chave.
- **Classificação:** nenhuma página = `sem_pagina`. Se, entre as páginas
  devolvidas, exatamente uma tem a mesma chave do nome, ela é a `achada`
  (interpretação: "uma opção com a mesma chave", não "uma opção só"; o
  LinkedIn quase sempre devolve várias parecidas). Senão `escolher`. Em todos
  os casos ficam guardadas até 5 opções (as de mesma chave primeiro), para o
  humano escolher, ou trocar depois uma achada ou uma "nenhuma destas".
  [verificar] com conta real se `title` do parâmetro `COMPANY` é o nome da
  página como aparece no perfil e se o `id` é o mesmo que o filtro `company`
  da busca aceita.
- **Busca com lista** (`campanhas.busca`): ganhou `lista` ({id, nome}),
  `parte` e `assinatura`, todos com padrão (busca salva antes continua
  valendo). Com lista, a região deixa de ser obrigatória. As partes são as
  páginas achadas em grupos de 10 (`company`) e uma parte por empresa sem
  página (`advanced_keywords.company` = nome, junto com `title`), em ordem
  estável (ids em ordem; nomes pela chave). [verificar] com conta real quantos
  ids o filtro `company` aceita de uma vez e se o `advanced_keywords.company`
  procura na empresa atual ou em qualquer experiência.
- A posição é {parte, cursor}: parte que acaba passa para a próxima com cursor
  vazio; a última acabando, `esgotada`. Página trazida pela metade recomeça
  nela, como antes. Sem lista é uma parte só e o laço é o mesmo de antes.
  Como parte vazia gasta uma consulta sem trazer ninguém (lista com muitas
  empresas sem página), cada rodada vai até 30 páginas; a próxima continua de
  onde parou.
- **Assinatura:** FNV-1a de 32 bits do JSON das partes, sem dependência de
  servidor. Se a lista mudou (empresa entrou, saiu ou foi escolhida), a busca
  volta à parte 0 com cursor vazio e tira a marca de esgotada: quem já entrou
  aparece como repetido, ninguém fica de fora. A aba Leads já mostra a busca
  recomeçando antes de rodar. Trocar a lista é mudar o filtro
  (`mesmosFiltros` inclui o id): cursor, parte e assinatura zeram ao salvar.
- Lista apagada (ou de outra organização): salvar e rodar recusam pedindo
  outra lista ou tirar o filtro; o seletor mostra a lista como "(apagada)".
  Empresas `a_procurar` e `escolher` ficam fora da busca e a aba Leads diz
  quantas, com link para a lista. Lista só com pendentes não roda.
- Telas: `/campaigns/company-lists` (listas com contagens e "Nova lista") e
  `/campaigns/company-lists/[id]` (procurar, escolher, achadas, sem página,
  não procuradas, adicionar, renomear, apagar com confirmação, e as campanhas
  que usam a lista). Botão "Listas de empresas" em Campanhas.

### SDR-121 · Todo mundo das empresas da lista (16/10/2026)

- Pedido do Arthur: buscar quem trabalha nas empresas da lista "sem adicionar
  nenhum outro filtro". Até aqui a busca exigia pelo menos um cargo mesmo com
  lista, e a busca montada já vinha com os cargos do público.
- `buscaDoPublico.cargos` perdeu o `min(1)`. A regra virou `faltaCargo`
  (sem lista e sem cargo), checada em `salvarBusca` e em `rodarBusca`, e não
  um `refine` no schema: o `rascunhoDaBusca` da conversa estende o schema, e o
  zod não estende objeto com refinamento. Busca salva antes continua válida
  (todas têm cargo).
- Sem cargo, `cargoDaBusca([])` é vazio e o cliente da Unipile não manda
  `advanced_keywords.title`: a parte vai só com `company` (ou
  `advanced_keywords.company`, para empresa sem página).
- **Uma página por parte sem cargo** (`EMPRESAS_POR_PARTE_SEM_CARGO`): a
  busca clássica do LinkedIn para em mil resultados [verificar com conta
  real], e dez empresas grandes juntas, sem cargo, passam disso; a parte
  "esgotaria" sem trazer todo mundo. Com cargo seguem os grupos de 10. Mudar
  o cargo muda as partes, mas não precisa de cuidado extra: mudar cargo já é
  mudar o filtro (`mesmosFiltros`), e a busca recomeça do início. Empresa com
  mais de mil pessoas, sozinha, ainda bate no teto: aí só cargo ou região
  estreitam.
- Tela: com lista, o rótulo diz "Cargos (opcional com lista de empresas)" e,
  se houver qualquer outro filtro, o botão "Todo mundo destas empresas" zera
  cargos, palavras, regiões e setores (só no formulário; salvar ou buscar
  grava). Sem lista e sem cargo, o botão de buscar fica desligado com o aviso.
- Conversa: o prompt (`busca-conversada-2`) diz que, com lista, cargos podem
  ficar vazios, e que "todo mundo dessas empresas" deixa os filtros vazios.
  O servidor só mantém os cargos antigos quando o pedido vem sem cargo e a
  busca fica sem lista.

### SDR-60 · Quando o SDR passa a conversa para você (14/10/2026)

- **Onde mora a cautela:** no JSON do SDR (`sdr.cautela`, opcional), e não
  numa coluna nova. Assim ela ganha versão, histórico e "voltar para esta"
  como o resto do SDR, e o chat de teste usa a mesma regra da produção sem
  mais nada. Versão antiga sem o campo vale como "equilibrado". Sem
  migration.
- **Limiar:** mais cauteloso 0,8 · equilibrado 0,7 · mais solto 0,6
  (`NIVEIS_DE_CAUTELA`, em `src/domain/passagem.ts`). Vale só para a baixa
  confiança que chama você. `agente.limiar_confianca` continua global para a
  ausência automática e para conta sem SDR.
- **O que a IA não toca:** `sdrDaIa` omite `link_agenda` e `cautela`;
  `soDaPessoa` devolve os dois para a geração e o ajuste pelo chat.
- **Duas telas, um SDR:** o editor do SDR e a seção da passagem salvam só a
  sua parte, e `salvarSdr` completa com a versão atual. Antes, o editor
  mandava o SDR inteiro, e salvar um desfaria o que o outro acabou de gravar.
- **Os casos fixos** (preço, reclamação, pedido fora do comum, opt-out
  ambíguo, reunião sem link) continuam no código e não se desligam; a tela só
  passa a mostrá-los (`SEMPRE_CHAMA`). O texto da tela acompanha
  `decidirResposta`: mudar um exige mudar o outro.
- **Últimas passagens** vêm de `rascunhos` (`resultado = 'escalado'`, motivo
  em `excecao`), e não de `eventos`: o rascunho já tem conta e motivo, e a
  proporção sai da mesma tabela (escalado sobre escalado, agendado, na fila e
  sugestão). RLS de `rascunhos` limita às contas que a pessoa opera.
- **Casos de teste** preenchem o campo do chat, sem enviar: a pessoa vê a
  mensagem e pode mudar antes. Só em Configurações; o primeiro acesso fica
  como está.

### SDR-61 · Quem escreve fora do Kakou tira o SDR (14/10/2026)

- Pedido do Arthur: sempre que alguém da conta escreve fora da plataforma, o
  SDR para. A regra já existia (§4.7, SDR-07 e SDR-52), mas tinha brechas:
  - `sem_resposta` e `convite_retirado` não escalavam. O dono escrevia, a
    pessoa respondia e o SDR voltava a conduzir. Agora os dois vão para
    `escalado_humano` (transição somada à máquina de estados), também quando
    a resposta sai pelo Chats.
  - O despachante deixava sair DM de conversa em `escalado_humano`. Uma
    resposta da IA já reservada (`enviando`) não é cancelada pelo webhook e
    saía depois de o dono assumir. Agora resposta sem `aprovada_por` só sai em
    `em_conversa`. Resposta aprovada ou escrita por alguém (que volta para a
    fila pela reconciliação) continua saindo em `escalado_humano`.
  - O agente conferia o estado só antes de chamar o modelo. Agora confere de
    novo, com o lead travado, na hora de agendar: se alguém assumiu no meio,
    o rascunho fica `descartado`. Se o modelo decidiu chamar você e você já
    tinha assumido, não sai e-mail.
  - A checagem na Unipile antes do envio pulava as mensagens da conta. Agora
    registra também essas (o que já é nosso é reconhecido pelo id, pelo eco ou
    pela nota do convite) e roda antes de toda DM do SDR sozinho, não só da
    régua. Para a resposta da IA, só mensagem do dono cancela: a da pessoa é a
    que está sendo respondida.
- A nota do convite é reconhecida em qualquer estado. Antes, só com o convite
  pendente; se o `new_relation` chegasse antes da mensagem com a nota, ela
  passava por mensagem do dono e tirava o SDR à toa.
- Fica de fora: pessoa em triagem com quem o dono conversa. A mensagem vira
  conversa externa, e aprovar o lead depois ainda coloca a pessoa na fila.

### SDR-62 · Busca pela conversa (15/10/2026)

- Pedido do Arthur: deixar conversacional a adição de filtros da busca no
  LinkedIn. Decisões dele: a conversa é **só da sessão** (não grava
  histórico; o que fica é a busca) e **pode criar lista de empresas**.
- A conversa é um jeito de editar o formulário, não um formulário novo. Ela
  devolve o rascunho da busca para a tela (`conversarSobreABusca`, em
  `server/publicos/conversa-da-busca.ts`) e não salva nem roda: salvar e
  buscar continuam nos botões de sempre, com as mesmas regras. Assim a pessoa
  sempre vê o que vai rodar, e o cursor da busca só recomeça quando ela salva
  um filtro mudado (`mesmosFiltros`).
- O modelo devolve a busca inteira como deve ficar (`pedidoDeBusca`), com
  região, setor e lista **pelo nome**, mais a resposta. Devolver o estado
  inteiro, e não operações, deixa o "tira", "troca" e "só" com o modelo e o
  servidor só compara. O servidor resolve os nomes:
  - Região ou setor que já está na busca (mesmo nome, sem acento e caixa)
    fica com o id que tem, sem consultar o LinkedIn.
  - Os outros vão a `listarParametrosDeBusca` pela conta da campanha
    (consulta de lista, fora do teto do dia). Uma opção de mesmo nome, ou uma
    opção só: entra. Várias: vira dúvida com até 5 opções, que a pessoa
    responde em botões. Nenhuma: aviso.
  - Lista pelo nome igual, ou pela única que contém o nome dito.
- **Criar lista**: só com os nomes dados na conversa, até 200 (a saída do
  modelo repete os nomes; lista maior vai pela tela de Listas, que aceita
  arquivo e não tem teto). Usa `criarLista`, então repetidas entram uma vez.
  A tela da conversa procura as empresas no LinkedIn em seguida, de leva em
  leva, com `procurarEmpresasDoPainel`, como a tela da lista. A action
  revalida a página para o filtro "Só nestas empresas" já mostrar a lista
  nova e as pendentes.
- Modelo: o de classificação (`IA_MODELO_CLASSIFICACAO`, Haiku), sem
  pensamento: é extração de filtros de uma frase e a resposta tem de vir
  rápido. Nenhuma variável de ambiente nova. Cada mensagem grava o evento
  `busca_conversada` (mudanças, dúvidas, lista criada, modelo, custo,
  `versao_prompt`).
- O histórico vem da tela: as últimas 12 falas. Mensagem até 1000
  caracteres. Pedido sem cargo mantém os cargos (a busca precisa de um).
- A busca do LinkedIn não filtra porte nem exclui cargo; o prompt manda dizer
  isso em vez de inventar filtro.

### SDR-63 · Sugestão de públicos que não quebra por um campo longo (15/10/2026)

- Causa: `zodOutputFormat` não manda `maxLength`, `maxItems` nem
  `minItems` acima de 1 para a API como restrição (só como texto na
  descrição), mas valida a resposta com o esquema zod inteiro. Um campo acima
  do limite em um dos públicos (o `quem_nao_e` com vários sinais passava fácil
  de 400) fazia o SDK lançar `AnthropicError`, e a tela mostrava "a IA não
  respondeu" para a sugestão inteira.
- `sugestaoDePublicos` virou um esquema próprio, sem limite de tamanho. Os
  limites ficam no prompt (`publicos-4`) e em `publicosDaSugestao`: cargos e
  setores a mais são cortados nos primeiros; texto longo descarta só aquele
  público.
- Erro de parse da saída estruturada vira `ErroDoModelo` ("A resposta veio
  fora do formato") nos três clientes de `publicos/claude.ts`, com o detalhe
  no log. Erro de API continua "a IA não respondeu".
- O sugeridor sobe de 16k para 32k de `max_tokens`, como o leitor do site:
  pensamento adaptativo mais 5 públicos com aderência chegava perto do teto.

### SDR-64 · Mensagem que dá para responder (15/10/2026)

- A mensagem sem pergunta vinha de três prompts: a geração do SDR descrevia
  a abertura como "uma observação, sem pedir reunião", a entrada da abertura
  não pedia pergunta e a DM 1 do estilo "casa" dizia "Não pergunta nada".
- `entradaDaAbertura` exige a pergunta com par bom e ruim (o caso da
  Marina). Vai na entrada, e não só no SDR, porque os SDRs já gerados guardam
  a abertura antiga e valem até alguém gerar de novo.
- Na abordagem, a DM 1 "casa" passa a ter a pergunta e a DM 2 retoma com um
  ponto novo e outra pergunta: duas na sequência, dentro do teto de duas por
  conversa.
- Versões: `sdr-2`, `fluxo-3` e prompts do agente `2026-10-15.1`. A regra
  nova entra em `REGRAS_DA_CASA`, que o ajuste do SDR não pode desligar e o
  chat de teste mostra. Não há checagem no validador: dizer se uma frase é
  "de efeito" exige julgamento, e o eval é o lugar de medir.

### SDR-65 · O que a tela mostra enquanto o Kakou trabalha (15/10/2026)

- Pedido do Arthur: o aviso de que o site está sendo analisado podia ser
  melhor. A tela só usa o que o servidor sabe; nada de percentual nem tempo
  restante inventado.
- O progresso da leitura continua no `ofertas.leitura_progresso` (jsonb), sem
  migration. Ganhou três coisas:
  - `maxPaginas`: o teto da configuração `dossie`, gravado no começo da
    leitura, para a tela dizer "3 de até 8". Leitura antiga não tem e a tela
    conta só as lidas.
  - `trecho` em cada página: a primeira linha com cara de frase do texto que
    o `web_fetch` trouxe, sem marcação, cortada em até 120 caracteres numa
    palavra (`trechoDaPagina`, em `server/oferta/progresso.ts`). Página sem
    frase (menu, PDF) fica sem trecho. Entra também em `ofertas.fontes`; a
    estruturação continua recebendo só as URLs.
  - A etapa `mercado`. A estruturação passou de `messages.parse` para
    `messages.stream` com o mesmo formato, só para ver o JSON chegando:
    quando a chave `"mercado"` aparece (`comecouOMercado`), Negócio e Produto
    já saíram, porque o Mercado é a última parte do formato. O leitor avisa por
    `aoComecarMercado`, e a etapa vai para `mercado`.
- As gravações do progresso passaram a uma fila só (`anotar`), na ordem em que
  acontecem; falha nela não derruba a leitura, como já era com as páginas.
- Tempo decorrido: `leitura_iniciada_em` contra a hora da renderização, que
  se atualiza a cada 3 s (`tempoDecorrido`, em `lib/tempo.ts`). Depois de 2
  minutos, o aviso de que site grande demora e dá para fechar a aba (a
  leitura roda no servidor, depois da resposta).
- Abordagem: a escolha do público e a escrita são observáveis pela tela (o
  Suspense da página e o da coluna de mensagens). A revisão roda dentro da
  escrita (`escreverComRevisao`) e não é observável sem mudar o servidor;
  fica como próxima etapa, com o que ela faz, em vez de fingir que começou.
- O checklist é um componente só (`onboarding/etapas.tsx`), usado nas duas
  telas.

## Módulos, contatos e disparos (16/10/2026)

Pedido do Arthur em 15/10/2026, à noite, para adiantar enquanto ele dormia:
"disparador de meta", "disparador de telegram", "sistema de tagmento",
"segmentação de leads", "separar em módulos pra faturamento / precificação
(usuário não precisa contratar todas as ferramentas)" e "naming". Viraram o
Marco D do épico (§4.14 a §4.20, SDR-69 a SDR-73) e o `docs/naming.md`. As
interpretações abaixo são minhas e estão para o Arthur confirmar.

- **"Disparador de Meta" é o WhatsApp pela API oficial da Meta** (Cloud API),
  com template aprovado. Descartados: Instagram Direct e Messenger, que não
  deixam a empresa iniciar conversa em massa; e o WhatsApp da Unipile, que
  conecta pelo WhatsApp Web (sem template, sem status oficial e com risco de
  bloqueio do número em disparo). O Votto já tem um adaptador "WhatsApp
  oficial" que ainda não envia; o Kakou é o primeiro a ligar a Cloud API.
- **"Disparador de Telegram" é pela Bot API**, com o bot da organização. Bot só
  fala com quem falou com ele primeiro, então a lista nasce do link do bot.
  Descartado: conta de usuário pela Unipile, que faria disparo em massa por
  uma pessoa (contra os termos do Telegram e com risco de banimento).
- **"Segmentação de leads" vale para todos os contatos**, não só os do
  LinkedIn: o segmento é o público do disparo. Os leads do LinkedIn entram como
  contatos e são segmentáveis pela etapa do Pipeline, pela campanha e pela
  nota.
- **"Tags" e não "etiquetas"** na tela e no código: é a palavra que o Arthur
  usou e a que o mercado usa, e `etiqueta` já é a classe dos selos de status do
  painel.
- **Módulos sem cobrança automática.** A organização tem módulos ligados ou
  desligados; quem liga é a GuessLess, numa tela própria (`/platform`) aberta
  só para `PLATAFORMA_ADMINS`, como o `/admin` do GL Suite com o
  `ADMIN_EMAILS`. O GL Suite já vende ferramentas avulsas pelo Stripe
  (`subscriptions.kind = 'tool'`); o caminho natural é cada módulo virar uma
  ferramenta desse catálogo e o webhook do Stripe ligar o módulo no Kakou
  (D16). Não fiz essa ponte: o `sdr_servidor` não lê as tabelas do GL Suite
  por desenho, e a decisão de cruzar os dois produtos é do Arthur.
- **Contato separado de pessoa.** `pessoas` é a identidade do LinkedIn: o
  `provider_id` é único, há um perfil dono, e URL, fonte e data da coleta são
  obrigatórias (base do legítimo interesse). O motor inteiro depende disso.
  Contato do WhatsApp ou do Telegram não tem nada disso. Por isso `contatos` é
  uma tabela nova, da organização, e cada pessoa do LinkedIn ganha o contato
  dela por trigger (as antigas na migration). As tags e os segmentos ficam no
  contato.
- **Sair por canal** (D14): quem manda "SAIR" no WhatsApp sai do WhatsApp; o
  opt-out do LinkedIn e o "Não contatar mais" valem para tudo. A regra de
  opt-out global da §4.13 continua como estava para o LinkedIn.
- **A fila dos disparos copia o desenho do Votto** (migration
  `0085_disparos_em_massa`, que já roda em produção lá): a fila é a tabela de
  destinatários, congelada na confirmação; a reserva é por prazo; envio
  interrompido sem confirmação vira falha com "pode ter chegado" e nunca é
  repetido sozinho; pg_cron a cada minuto mais a chamada logo depois da
  confirmação.
- **Banco dividido com o GL Suite.** Cada tabela nova declara o próprio grant
  (`authenticated` e `sdr_servidor`) e cada migration começa conferindo que
  nenhuma tabela de mesmo nome já existe sem ser do Kakou: `create table if
  not exists` pularia a criação em silêncio e os `alter` seguintes mexeriam
  na tabela de outro produto. Os nomes foram conferidos contra os 587 arquivos
  SQL dos repositórios da GuessLess nesta máquina.
- **Tokens cifrados no banco** (AES-256-GCM, chave `SEGREDOS_CHAVE`): o token
  do WhatsApp dá acesso à conta de WhatsApp Business do cliente. O segredo do
  webhook do Telegram não é guardado: é derivado da mesma chave e do id do
  canal (HMAC), e o Kakou recalcula para conferir.
- Os tickets vão empilhados, um branch cada, a partir de
  `docs/epico-modulos-e-canais`, sem push. A ordem segue a dependência, não a
  da lista do pedido: módulos e contatos primeiro, porque os disparos usam os
  dois.

### SDR-69 · Módulos e plano (16/10/2026)

- Tabela `modulos_da_organizacao` (migration `20261016100000_modulos`), uma
  linha por organização e módulo, com `ativo`, `desde` (a última vez que
  ligou), o motivo e quem mudou (`alterado_por` é texto: o e-mail de quem é da
  plataforma, ou `sistema`). Desligar não apaga a linha: religar mantém o
  histórico e os dados de cada módulo ficam onde estão.
- O catálogo fica em `domain/modulos.ts`, sem `server-only`, porque o menu e
  as abas são client components. `NOME_DO_MODULO` é o único lugar dos nomes
  (D13).
- Organização nova ganha o `linkedin` por trigger (`ligar_modulo_padrao`), não
  no código do primeiro acesso: assim qualquer caminho que crie organização
  (o callback, o SQL do README, as fixtures dos testes) segue a regra. A
  migration liga o `linkedin` em todas as que existem e os três na
  `guessless`.
- **Escrita só pela conexão do sistema.** O RLS dá leitura à organização e
  nenhuma escrita ao `authenticated`: um admin da organização não liga módulo
  para si. A Plataforma confere `PLATAFORMA_ADMINS` (env, como o
  `ADMIN_EMAILS` do `/admin` do GL Suite) e quem não está recebe 404. A lista
  vem de variável de ambiente, e não de uma coluna, para que nenhum acesso ao
  banco da organização consiga se promover. Pelo mesmo motivo, o e-mail
  conferido é o do login (o JWT verificado do Supabase Auth, `ehDaPlataforma`),
  nunca o `operadores.email`: o RLS deixa o admin da organização editar as
  linhas de operadores dela, e ele poderia escrever ali o e-mail de alguém da
  GuessLess.
- `Operador` ganhou `modulos` (na ordem do catálogo), lidos na mesma consulta
  do operador. Os portões:
  - `exigirOperadorNoApp`: só manda para `/onboarding` quando o `linkedin` é
    o único módulo e o primeiro acesso não acabou (`soOPrimeiroAcesso`).
    Para as organizações que já existem, nada muda;
  - `exigirOperadorComModulo(modulo)`, nas páginas do LinkedIn (Chats,
    Pipeline, Campanhas, Empresa, SDR, LinkedIn): sem o módulo, redireciona
    para `/settings/plan?module=<id>`, que diz qual falta; com o primeiro
    acesso por fazer, para `/onboarding`;
  - `exigirOperadorComModuloNaAcao(modulo)`, em todas as ações do servidor do
    LinkedIn (painel, campanhas, listas, importação, chats, pipeline,
    configurações e primeiro acesso): sem o módulo, lança
    `ModuloNaoContratado`. As de Equipe (nome da organização, papel) seguem
    com `exigirOperador`. A exportação da planilha devolve 403;
  - o primeiro acesso abre só com o `linkedin` pendente
    (`linkedinNoPrimeiroAcesso`); sem o módulo, vai para o app.
- Menu (`itensDoMenu`): Chats, Pipeline e Campanhas exigem o `linkedin`; com
  ele pendente e outro módulo, os três viram um item "Configurar o SDR", que
  leva ao primeiro acesso, em vez de três itens que levariam ao mesmo lugar.
  "Plataforma" aparece só para quem é da plataforma. As abas de
  Configurações seguem a mesma regra (`lista-de-abas.ts`, fora do client
  component para o `/settings` do servidor poder usar) e ganharam "Plano".
- Dashboard: as partes do LinkedIn (contas, precisa de você, SDR, números)
  só com o módulo e o primeiro acesso feito; sem elas, o cartão do plano. Com
  o `linkedin` pendente, o cartão "Falta configurar o SDR no LinkedIn".
  Equipe sem o `linkedin` não mostra as contas que cada um opera.
- Desligar o `linkedin` pausa as contas ativas da organização com
  `pausarPerfil` (motivo "O módulo SDR no LinkedIn foi desligado: <motivo>",
  com o alerta de sempre), menos a conta da casa, que não é de nenhuma
  campanha. Os webhooks da Unipile continuam chegando e sendo guardados:
  nada sai porque o despachante ignora conta pausada. A pausa dos disparos ao
  desligar `whatsapp` ou `telegram` entra no SDR-72, quando os disparos
  existirem.
- Plano (`/settings/plan`): a base, cada módulo com o que faz, o que inclui,
  "Contratado desde" ou "Fora do plano", e o uso do mês só para o `linkedin`
  por enquanto (contas vinculadas, convites e mensagens enviadas, do dia 1 no
  horário de Brasília até agora, a organização inteira, pela conexão do
  sistema). Os contatos e os disparos entram no uso com os tickets deles.
  "Quero contratar" abre o `COMERCIAL_URL`; sem ele, a tela diz para falar
  com a GuessLess.

### SDR-70 · Contatos e tags (16/10/2026)

- Tabelas `contatos`, `tags`, `contato_tags` e `importacoes_de_contatos`
  (migration `20261016110000_contatos_e_tags`), com RLS pela organização e o
  grant para `sdr_servidor`. A migration começa pela conferência de nomes do
  banco dividido.
- **Contato do LinkedIn por trigger.** `pessoas_viram_contatos` cria o contato
  da pessoa nova na organização do perfil dono; `pessoas_atualizam_contatos`
  leva nome, empresa, cargo e o opt-out da pessoa para o contato (o LinkedIn é
  a fonte desses campos). Pessoa sem nome vira "Sem nome": a trigger não pode
  derrubar a importação do motor. As pessoas que já existem ganham o contato
  na migration. Contato do LinkedIn e contato importado da mesma pessoa ficam
  separados nesta versão: não há chave confiável para juntar (a pessoa do
  LinkedIn não tem telefone nem e-mail).
- **RLS do contato:** da organização e, se for lead do LinkedIn, só para quem
  enxerga a pessoa (a subconsulta em `pessoas` passa pelo RLS dela). Assim o
  operador não vê, pelos Contatos, os leads das contas que não opera.
  `contato_tags` segue o contato. Uma trigger confere que a tag e o contato
  são da mesma organização, venha a escrita de onde vier.
- **Telefone** em E.164 (`normalizarTelefone`, em `domain/contatos.ts`): sem
  DDI e com DDD vira +55; zero de interurbano na frente sai; celular antigo de
  8 dígitos começando em 6 a 9 ganha o 9. Fora do Brasil, só com + ou 00. O
  banco tem `check` do formato e índice único por organização e telefone.
- **Importação:** o navegador lê a planilha (`lerPlanilhaDeContatos`, colunas
  pelo nome, até 5.000 linhas, telefone ou e-mail obrigatório, repetidos
  juntados) e manda em partes de 1.000. O servidor importa pela conexão do
  sistema, preso à organização do operador, porque o contato de mesmo
  telefone pode ser de uma conta que o operador não opera e ainda assim não
  pode duplicar. Telefone igual faz upsert que completa só o vazio
  (`coalesce`); sem telefone, o e-mail igual (sem caixa) completa o contato
  mais antigo. As tags da planilha e as "para todos" são criadas se faltarem
  (`garantirTags`, com trava por organização e o teto de 200).
- **Autorização do WhatsApp** é da importação: a primeira parte grava a marca
  em `importacoes_de_contatos.autorizacao_whatsapp`, e as outras partes usam
  a gravada, não a que o navegador manda. O contato guarda
  `whatsapp_autorizado_em` e `whatsapp_autorizacao` (quem, qual importação,
  qual arquivo). Quem saiu do WhatsApp não ganha autorização de novo.
- **Filtro de contatos** (`domain/filtro-de-contatos.ts`): texto (nome,
  empresa, cargo, e-mail e, com 4 dígitos ou mais, telefone; `%` e `_` são
  texto), tags (todas, alguma, nenhuma), canal (WhatsApp, LinkedIn), origem e
  situação (podem ser contatados, padrão; não contatar; todos), em SQL
  parametrizado. É o mesmo SQL para a lista e para a tag em massa: "todos do
  filtro" manda o filtro, e o servidor roda de novo, então vale para todos,
  não só os da página. O SDR-71 aumenta este filtro para os segmentos.
- **Tag em massa** grava um evento por operação (`tag_posta`, `tag_tirada`,
  com quantos e se foi por marcados ou por filtro), e não um por contato.
- **"Não contatar mais"** marca o contato com o motivo e o nome de quem
  marcou e, se for lead do LinkedIn, chama o `registrarOptout` de sempre
  (fecha os leads e cancela as ações). Roda pela conexão do sistema, depois de
  conferir pelo RLS que o operador enxerga o contato. Não se desfaz pela tela.
- **Tags na tela:** só o ponto tem a cor (`.tag[data-cor]`), para não competir
  com o destaque menta nem com as cores de status (regra do tema). Paleta de
  8 cores fixas. O editor de tags do contato (`tags-do-contato.tsx`) serve à
  página do contato e ao painel do lead no Chats: pôr pelo nome (com
  sugestões) e tirar pelo ×. O Pipeline mostra até 3 tags no card e filtra por
  tag (`?tag=`).
- Telas: `/contacts` (filtros por URL, 50 por página, tag em massa),
  `/contacts/[id]`, `/contacts/import` e `/contacts/tags`. "Contatos" entra
  no menu como base, entre Campanhas e Configurações. O Plano mostra o total
  de contatos, e o Dashboard sem o SDR no LinkedIn também.

### SDR-71 · Segmentos (16/10/2026)

- Tabela `segmentos` (migration `20261016120000_segmentos`): nome, chave (sem
  caixa e acento, única na organização) e `filtros` (jsonb, no formato de
  `domain/filtro-de-contatos.ts`). RLS pela organização; grant para
  `sdr_servidor`.
- **O segmento é o filtro de Contatos com mais condições**, não uma lista: é
  recalculado a cada uso. O filtro ganhou `linkedin` (etapas do Pipeline,
  campanhas e nota mínima) e `desde` (a partir de que dia o contato entrou,
  meia-noite no horário de Brasília). Quem congela a lista é o disparo, na
  confirmação (§4.18).
- **As condições do LinkedIn valem juntas para o mesmo lead** da pessoa (um
  `exists` só em `leads`): "conversando na campanha X" não casa a pessoa que
  está encerrada em X e conversando em Y. Etapa usa as colunas do Pipeline
  (`COLUNAS_DO_PIPELINE`), traduzidas para os estados do lead.
- **Quem pediu para não ser contatado nunca entra:** `filtroDoSegmento`
  força a situação "podem" ao ler o filtro salvo, e o filtro guardado não leva
  a situação.
- Segmento sem nenhuma condição é recusado: ele seria a base inteira, e quem
  quer a base inteira usa a lista de Contatos.
- A prévia do editor chama o servidor 350 ms depois da última mudança e
  mostra o total, a descrição em português (`descreverFiltro`, agora com as
  campanhas e a data) e os 12 primeiros. A lista de segmentos conta cada um na
  hora (uma consulta por segmento; a organização tem poucos).
- **Tag usada por segmento não se apaga** (`segmentosComATag`, em
  `server/contatos/tags.ts`, procura o id nas três listas de tags do filtro):
  o segmento mudaria de gente sem ninguém ver. A tela diz quais segmentos
  usam.
- Contatos aceita `?segment=<id>`: com segmento, vale o filtro dele e o
  formulário dá lugar ao nome do segmento; a tag em massa "todos do filtro"
  manda o filtro do segmento. Segmento apagado ou de outra organização: a lista
  volta aos filtros de sempre, com o aviso.
- Telas: `/contacts/segments`, `/contacts/segments/new` e
  `/contacts/segments/[id]`. O botão "Segmentos" fica no cabeçalho de
  Contatos.

### SDR-72 · Disparos no WhatsApp (16/10/2026)

- Pesquisa em `docs/pesquisa/whatsapp-cloud-api.md` (fontes da Meta, lidas em
  16/10/2026): Graph API v26.0, cobrança por mensagem entregue, limite por
  portfólio em destinatários únicos por 24 h, 80 msg/s por número, sem chave de
  idempotência, webhooks repetidos por até 7 dias e fora de ordem, e a tabela
  de erros que a fila segue.
- **Conexão pelo app do próprio cliente**, e não por um app da GuessLess: é o
  único caminho que não pede App Review da GuessLess na Meta. Com isso, cada
  canal guarda o app secret do cliente (cifrado), e o webhook é por canal
  (`/api/webhooks/whatsapp/[canal]`), conferido com o segredo dele. A
  inscrição usa `POST /{waba}/subscribed_apps` com `override_callback_uri` e o
  verify token, para o cliente não ter de configurar o webhook à mão; se a
  Meta recusar, o canal conecta e a tela mostra a URL e o token. O épico
  (§4.19, T-9 e D15) foi corrigido neste PR: na primeira versão, ele previa o
  app da GuessLess. O Embedded Signup entra quando a GuessLess for Tech
  Provider, com a mesma tabela de canais.
- **Segredos:** `server/segredos.ts`, AES-256-GCM com `SEGREDOS_CHAVE`
  (formato `v1:iv:tag:corpo`). O verify token não é guardado: é um HMAC da
  mesma chave com o id do canal. O painel não lê credencial: o grant de
  `canais` para `authenticated` é por coluna, sem `credencial` e `segredo`
  (grant na tabela valeria para todas as colunas). Conectar e desconectar vão
  pela conexão do sistema, depois de conferir o admin e o módulo.
- **Tabelas:** `canais`, `disparos`, `envios_do_disparo` (a fila),
  `mensagens_dos_canais` (o que chega) e `webhooks_dos_canais` (o corpo cru,
  com chave de idempotência = SHA-256 do corpo). Os webhooks dos canais não
  usam `webhooks_recebidos`, porque o reprocessador do tick é da Unipile e
  pegaria o que não é dele. `contatos` ganhou `whatsapp_wa_id` e
  `whatsapp_usuario_id` (o BSUID, que pode vir sem telefone desde 04/2026).
  Duas configurações novas: `disparos` (janela, intervalo, ritmo, lote,
  tentativas, reserva) e `whatsapp` (preços do Brasil para a estimativa).
- **Rascunho como o operador, confirmação pelo sistema.** O rascunho é do
  RLS. A conferência e a lista da confirmação são montadas com o que o
  operador vê no segmento (`contatosDoSegmento`, com o RLS dos contatos): o
  disparo sai para quem a pessoa vê, e a tela mostra exatamente isso. A
  confirmação grava os envios (os que recebem e os que ficam de fora, com o
  motivo) numa transação do sistema, só se o disparo ainda é rascunho.
- **O template vem do que o Kakou leu da Meta**, nunca do navegador: o
  rascunho guarda o id e o servidor copia o template aprovado dos dados do
  canal. As variáveis (corpo, cabeçalho de texto, mídia do cabeçalho e sufixo
  de URL) vêm de um campo do contato ou de um texto fixo; o primeiro nome cai
  no `primeiroNome` do nome completo quando o contato não tem.
- **A fila** (`server/disparos/fila.ts`) segue o desenho do Votto: trava de
  rodada (`pegarTrava`, 5 min), reserva por prazo (`reservado_ate`, 120 s) com
  `for update skip locked`, e envio com a reserva vencida vira falha
  "interrompido" ("pode ter chegado") sem nunca voltar sozinho. Erro de rede e
  resposta sem o id também são "pode ter chegado". Os disparos saindo andam em
  rodízio, um lote (40) de cada vez, para um disparo grande não segurar os
  outros; a rodada para em 45 s e a próxima continua. Ritmo: 20 msg/s por
  canal, bem abaixo das 80 da Meta.
- **Conferência na hora do envio:** antes de cada mensagem, o contato é
  conferido de novo (não contatar, saiu do canal, outro disparo em 24 h): quem
  mudou depois da confirmação fica pulado, com o motivo.
- **Erros** pela tabela da pesquisa (`classificarErroDaMeta`): do contato,
  falha sem nova tentativa (131026); "saiu" (131050), falha e tira do
  WhatsApp; ritmo (130429, 131056, 80007…), espera 30 s, 60 s, 120 s e falha
  na terceira; "esperar" (131049), falha que volta no "Tentar de novo"; do
  template (132000, 132001, 132015, 132016…) e da conta (190, 10, 200,
  131042, 131048…), o envio volta para a fila sem gastar tentativa e o
  disparo pausa; da conta, o canal também fica com erro. Código desconhecido
  é tratado como ritmo (poucas tentativas).
- **Limite da Meta:** antes de cada lote, a fila conta os contatos únicos que
  o número alcançou em 24 h e pausa ao chegar no limite do tier do número
  (`whatsapp_business_manager_messaging_limit`). O limite é do portfólio:
  outro número ou outra ferramenta do mesmo portfólio não entram na conta, e
  aí quem segura é a Meta [verificar o erro que ela devolve].
- **Janela** das 8h às 21h em `America/Sao_Paulo`, todo dia (a configuração
  `disparos.janela`). "Agora" fora da janela agenda para a próxima abertura;
  agendar fora da janela é recusado com o horário que daria. O
  `datetime-local` do agendamento é lido no fuso da janela (`instanteLocal`),
  não no do servidor.
- **Webhook:** `statuses` só fazem o envio andar (`proximoStatusDoEnvio`;
  lida também marca entregue); `failed` traz o código e o motivo. `messages`
  guardam a mensagem, acham o contato pelo wa_id, pelo telefone do wa_id
  (normalizado, com o 9 do celular) ou pelo BSUID, e criam o contato que não
  existe (origem WhatsApp, sem autorização). A resposta conta para o envio do
  botão (`context.id`) ou para o último envio ao contato em 7 dias. "SAIR" e
  companhia, o botão de saída e o `user_preferences` com `stop` tiram do
  WhatsApp. Aviso de outro número da mesma WABA é ignorado. O status do
  template muda pelo `message_template_status_update`.
- **Módulo e canal:** desligar o módulo pausa os disparos daquele canal
  (`alterarModulo`, como o LinkedIn pausa as contas); desconectar pausa e
  apaga as credenciais. Retomar confere o módulo e o canal.
- Telas: `/broadcasts` (lista com o andamento), `/broadcasts/new` (canal,
  segmento, template, variáveis e a prévia com um contato de exemplo),
  `/broadcasts/[id]` (conferência e confirmação; depois, andamento, falhas,
  ficaram de fora e respostas, atualizando a cada 10 s enquanto sai) e
  Configurações > WhatsApp. "Disparos" entra no menu com o WhatsApp ou o
  Telegram. O Dashboard mostra os últimos disparos; o contato, os disparos que
  recebeu; o Plano, as mensagens do mês.
- [verificar] com um número real: o `override_callback_uri` dispensa mesmo a
  configuração do webhook no app; o app do cliente precisa estar em modo Live
  para receber webhook de produção; o 9º dígito no `wa_id`; o erro de quando
  passa do limite do portfólio.

### SDR-73 · Disparos no Telegram (16/10/2026)

- Pesquisa em `docs/pesquisa/telegram-bot-api.md` (Bot API 10.3): bot só fala
  com quem falou primeiro; `secret_token` no header de cada aviso; ~30 msg/s
  por bot e 1 msg/s por chat; 429 com `retry_after`; bloqueio chega como
  `my_chat_member` com `kicked`; sem chave de idempotência; código do
  `?start=` com até 64 caracteres `A-Za-z0-9_-`.
- **Um bot por organização, um bot numa organização só** (índice único no
  `botId`). O token fica cifrado; o `secret_token` do webhook é derivado do id
  do canal (HMAC da `SEGREDOS_CHAVE`), como o verify token do WhatsApp.
  Conectar confere o `getWebhookInfo`: bot com webhook de outro sistema só
  conecta com a confirmação na tela (`tomarDoOutro`), porque o
  `setWebhook` toma o lugar do outro.
- O contato ganhou `telegram_canal_id`, `telegram_id` (texto: o id pode ter
  52 bits), `telegram_usuario`, `telegram_entrou_em`, `telegram_saiu_em` e
  `telegram_motivo` (migration `20261016140000_telegram`), único por
  organização. O id vale só para o bot em que a pessoa entrou: a lista de
  quem recebe considera só quem entrou pelo bot conectado agora. Trocar o
  token do mesmo bot mantém a lista; trocar de bot, não.
- **Links de entrada** (`links_de_entrada`): nome, tag e um código aleatório
  de 12 caracteres (base64url), porque nome de tag com acento ou espaço não
  cabe no link. O /start com o código põe a tag (`por = 'telegram'`).
- **Webhook** (`/api/webhooks/telegram/[canal]`): segredo comparado em tempo
  constante, update guardado com a chave `telegram:<canal>:<update_id>` e
  processado numa transação; as respostas do bot (boas-vindas, confirmação de
  saída) saem depois de gravar, para a entrada ou a saída valer mesmo se o
  Telegram falhar. Só chat privado; mensagem de bot é ignorada.
  - /start: contato novo (origem Telegram, com nome e @usuário) ou de volta
    (limpa a saída), menos quem pediu para não ser contatado, que continua de
    fora e não recebe as boas-vindas;
  - /sair, /stop e as palavras de saída: sai do Telegram, e o bot confirma
    dizendo como voltar;
  - `kicked`: sai, com o motivo "Bloqueou o bot."; `member` (desbloqueio)
    não volta sozinho;
  - outra mensagem: guardada, e conta como resposta ao último envio em 7 dias.
- **A fila é a mesma do WhatsApp**, com o `enviadorDoTelegram`: texto sem
  `parse_mode` (nada de marcação quebrando o envio) e o botão com link como
  `inline_keyboard`. O id da mensagem é `chat:message_id`. Erros pela tabela
  da pesquisa (`classificarErroDoTelegram`): bloqueado sai do Telegram; conta
  apagada, "nunca deu /start" e `chat not found` falham sem nova tentativa;
  401 pausa o disparo e põe o canal com erro; 429 espera o `retry_after`; 5xx
  tenta de novo. O código guardado é `telegram_<HTTP>`, e o "Tentar de novo as
  falhas" volta só 429, 5xx e token.
- O texto troca `{{first_name}}` e `{{company}}` (`textoDoTelegram`), recusa
  variável desconhecida e confere os 4.096 caracteres depois da troca; quem não
  tem o campo fica de fora, com o motivo.
- O filtro de contatos e os segmentos ganharam o canal "podem receber pelo
  Telegram". O contato mostra o Telegram; a lista de Contatos também.
- Telas: Configurações > Telegram (conectar, link do bot, links com tag,
  boas-vindas, desconectar) e o Telegram no novo disparo (texto, botão,
  prévia com o contato de exemplo).
- [verificar] com um bot de verdade: o par `member`/`kicked` do bloqueio, se
  o "Stop Bot" chega igual ao bloqueio e se o webhook funciona no domínio de
  produção (o FAQ desconfia de certificado wildcard).

## Lançamentos, Instagram, Facebook e comunidades (16/10/2026)

Pedido do Arthur em 16/10/2026: "a próxima etapa: instagram, facebook e
comunidades (comunidades de whats, de telegram, de instagram, grupos em
geral)". Respostas dele às perguntas de escopo: o SDR fala com quem chega na
DM, disparos, comentários em posts e "sistema similar ao manychat"; só grupos
que a organização tem; nos grupos, disparo, boas-vindas, regras, membro
virando contato com tag, ler o grupo e o SDR; risco do WhatsApp pela conta da
pessoa aceito; só WhatsApp, Telegram, Instagram e Facebook; primeiro caso, a
GuessLess gerenciando lançamentos; app da Meta da GuessLess; um módulo por
canal mais Comunidades. Depois: reaproveitar o Marco D, desprender o SDR do
LinkedIn, lançamento como conceito. Viraram o Marco E do épico (§4.21 a
§4.29, SDR-74 a SDR-104, D18 a D29, T-11 a T-22). O plano saiu de um PM e de
um designer em paralelo, conciliados abaixo.

**Pesquisas** (fontes primárias, 16/10): `docs/pesquisa/instagram-messenger-api.md`,
`whatsapp-grupos.md`, `telegram-grupos.md` e `lancamentos-e-manychat.md`. O
que elas decidiram:

- **Instagram e Messenger servem para conversa, não para disparo.** O SDR só
  responde até 24 horas depois da última mensagem da pessoa; a tag
  `HUMAN_AGENT` (7 dias) é só humana. Comentário vira DM pela Private Reply
  (uma por comentário, até 7 dias). Não há disparo no Instagram fora da
  janela; no Messenger, só pelas Marketing Messages, pagas e com Tech
  Provider. Por isso o "sistema de disparos" do pedido ficou nos grupos
  (agenda) e nos disparos de WhatsApp e Telegram que já existem (D22).
- **O Marco D descartou Instagram e Messenger para disparo e a Unipile para o
  WhatsApp.** As duas razões continuam valendo: o Instagram e o Messenger
  entram agora para conversa, e a Unipile só para os grupos, num número
  separado, sem conversa de um para um (D20, D21).
- **Grupos do Instagram e do Facebook e a Comunidade do WhatsApp não têm
  API.** A Groups API do Facebook saiu em 22/04/2024; a Unipile não enxerga
  comunidade. Ficaram fora por impossibilidade, não por escolha.
- **A conexão da Unipile pode não funcionar.** Desde meados de 2026, o
  WhatsApp pede passkey para vincular aparelho em parte das contas, e o QR lido
  no servidor para (WAHA 2026.7, Whapi); a SendFlow trocou o QR por uma
  extensão de navegador. A doc da Unipile não fala de passkey. Daí o T-11 antes
  de qualquer ticket do número, e o modo sem número como padrão do lançamento.
- **No Telegram tudo é oficial,** mas o bot não cria grupo nem adiciona gente:
  a pessoa cria o grupo e põe o bot por link.
- **O básico do mercado** (SendFlow e afins): link que distribui entre
  grupos, agenda para todos os grupos, entradas e saídas. O link pode girar
  pelo clique, sem número conectado. A última linha da pesquisa de mercado
  ("Decisão do Arthur: sem conexão por QR") era uma pergunta para ele, não uma
  decisão; ele já tinha aceitado o risco. O PM e o designer leram como
  decisão; ficou corrigido.

**Interpretações e escolhas:**

- **O lançamento é o centro.** Grupos, link, agenda, compras, palavras-chave e
  o que o SDR sabe ficam debaixo dele. Comunidade perene fora de lançamento é,
  por ora, um lançamento sem datas.
- **O WhatsApp do lançamento tem dois modos, e o sem número é o padrão.** Sem
  número: a pessoa cola os convites, o link gira pelo clique e a agenda vira
  "feito por você" (o Kakou avisa na hora com o texto e a lista dos grupos).
  Com número: a agenda sai sozinha e os membros são contados. Se o número cair,
  o lançamento volta para o modo sem número sem perder nada.
- **Agenda com tabelas próprias** (`mensagens_do_lancamento` e
  `envios_aos_grupos`), com o desenho e o código da fila dos disparos
  (`pegarTrava`, reserva por prazo, "pode ter chegado", mesmo cron).
  `envios_do_disparo` é por contato (`contato_id not null`, único por disparo
  e contato) e carrega regras que não valem para grupo (saída do canal, 24
  horas entre disparos, janela das 8h às 21h, limite da Meta).
- **A identidade de cada canal novo fica na relação** (`conversas_dos_canais`,
  `membros_dos_grupos`), não em colunas do contato nem numa tabela de
  identidades: o IGSID e o PSID valem só para aquela conta, o contato já tem
  colunas de canal demais, e uma tabela de identidades teria um dono só,
  travando quatro tickets da mesma onda.
- **Os checks de `canais.tipo` e `contatos.origem` mudam uma vez, no SDR-74,
  com a lista final.** Três migrations reescrevendo o mesmo check na mesma
  onda apagariam o valor uma da outra.
- **Clique não é entrada.** No WhatsApp colado, o limite padrão é 900 cliques
  para um grupo de 1.024: robô de prévia, `HEAD` e a mesma pessoa (cookie) não
  contam, e "Corrigir a contagem" acerta pelo que a pessoa vê no celular.
- **A rota `/go/<código>` é uma transação curta**, sem serviço de fora no
  caminho: num pico de anúncio, a linha do grupo da vez é o ponto quente.
- **Pausar o lançamento pausa a agenda, não o link.** O designer propôs parar
  os dois; parar o link no meio de um anúncio pago perde gente, e o motivo de
  pausar é quase sempre uma mensagem errada ou o número caído.
- **Grupo com tarefa obrigatória aberta não recebe clique** (sugestão do
  designer): ninguém cai num grupo aberto onde qualquer um troca o nome ou
  chama gente de fora.
- **Tag por lançamento e por origem, nunca por grupo** (D29): 30 grupos por
  lançamento esgotariam o teto de 200 tags em poucos lançamentos.
- **Conversa de grupo fica no lançamento, não no Chats.** O Chats continua de
  um para um; o que o SDR passou para você no grupo sobe para o Precisa de
  você.
- **O número dos grupos nunca conversa de um para um.** O designer sugeria
  mostrar no Chats as DMs que chegam ao número; responder por ele somaria
  risco ao número que segura os grupos.
- **Facebook Login for Business** (D28): um app não tem os dois logins, e o
  Instagram Login exigiria um segundo app para o Messenger. Consequência: o
  Instagram do cliente precisa estar ligado a uma Página.
- **Polling dos comentários** no SDR-90: sem Advanced Access, nem a conta da
  própria GuessLess recebe o webhook de comentário; o polling deixa gravar o
  vídeo do App Review e cobre o que o webhook perder.
- **Webhooks respondem 200 e processam depois** (`after()` do Next 16, com
  retentativa no cron): a Meta desinscreve o app depois de 1 hora de falha.
- **O prompt do LinkedIn não muda.** O SDR-75 põe o canal na entrada do agente
  e exige teste com o prompt do LinkedIn igual byte a byte.
- **Menu:** Lançamentos e Comentários logo depois do Chats (o designer). O PM
  punha Lançamentos entre Contatos e Disparos e as palavras-chave dentro de
  Configurações; Comentários virou tela porque o pedido inclui "comentários em
  posts", não só a automação.
- **Cinco perguntas ficaram sem resposta do Arthur** quando ele aprovou o
  plano (D18 a data, D19 o ManyChat, D24 a Hotmart, D25 o preço, D26 o aviso
  no Telegram). Segui as sugestões e deixei cada uma aberta no épico: a regra
  de preço (§4.7) e o SDR-103 só existem por causa delas.
