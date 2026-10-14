# Épico · Kakou, o SDR de LinkedIn que nasce do seu site

10/10/2026 · uso interno · dono: Arthur

Substitui o épico de 29/09/2026 (jornada do Kakou, SDR-01 a SDR-34), que está
no histórico do git até o commit `604e192`. O motor construído naquele épico
(despachante, Unipile, agente, validador, teto, parada automática) continua; o
que muda é a experiência inteira por cima dele.

## 1 · O que é, em uma linha

A pessoa informa o site, o Kakou entende o negócio, monta um SDR que conversa
como ela, mostra quem no LinkedIn pode comprar e pede permissão para começar.
Depois disso o SDR prospecta e conversa sozinho pela conta do LinkedIn dela, e
ela acompanha tudo como se estivesse nas próprias DMs.

O essencial é o **SDR**: um chatbot de conversa que nasce da análise do site e
que a pessoa testa, no papel de lead, e refina até falar do jeito certo. É o
mesmo SDR que depois responde os leads de verdade.

## 2 · A experiência

### 2.1 · Primeiro acesso: seis passos, uma coisa por tela

```text
 Site ──► Análise ──► SDR ──► Leads ──► Abordagem ──► LinkedIn ──► o app
 qual o   negócio,    chat de  quem no   como vai      vincular a
 site?    produto e   teste:   LinkedIn  abordar       conta e
          mercado     você é   pode      [pode entrar  começar
          [confirma]  o lead   comprar   em contato?]
                      [ficou
                       bom]
```

Tela cheia, sem menu. No topo, a marca e os seis passos com o atual em
destaque. Cada tela faz uma pergunta e tem um botão principal. Quem fecha o
navegador no meio volta para o passo em que parou.

1. **Site.** "Qual o site da sua empresa?" Um campo e um botão.
2. **Análise.** Enquanto o Kakou lê o site, a tela mostra o que ele está lendo.
   O resultado vem em três blocos: **Negócio** (o que a empresa é e para quem),
   **Produto** (o que vende, diferenciais e provas) e **Mercado** (quem compra,
   o que usa hoje no lugar, o que faz ser a hora de comprar). A pessoa corrige
   qualquer item ali mesmo e confirma (§4.2).
3. **SDR.** Uma tela de chat. O SDR abre a conversa como faria depois de um
   convite aceito; a pessoa responde no papel de lead. Quando uma resposta não
   ficar boa, ela troca o modo do campo para "Ajustar o SDR" e diz o que
   mudar; o SDR aprende, mostra o que mudou e responde de novo. "Ficou bom"
   segue (§4.3).
4. **Leads.** "Quem compra de você": o perfil do lead (cargos, empresas,
   região, por que precisa) e uma lista de pessoas reais do LinkedIn, cada uma
   com a nota de aderência e o motivo numa linha. A pessoa tira quem não quer e
   pode trocar o perfil do lead (§4.4).
5. **Abordagem.** O Kakou recomenda como abordar: o convite e as mensagens,
   numa linha do tempo legível, com os textos editáveis, e o que vai
   acontecer ("18 pessoas, até 8 convites por dia, em dias úteis das 9h às
   18h; o SDR responde sozinho e chama você quando..."). O botão é **"Pode
   entrar em contato"** (§4.5).
6. **LinkedIn.** Por que vincular, o que o Kakou faz e não faz com a conta, e o
   botão "Vincular meu LinkedIn". Vinculou, a campanha começa e a pessoa entra
   no app (§4.6).

### 2.2 · O app

Menu com cinco telas, nesta ordem:

| Tela | Para quê |
|---|---|
| **Dashboard** | a conta: LinkedIn conectado e saúde, quanto do teto de hoje já foi usado, os números da semana, o funil e o que precisa de você agora (§4.9) |
| **Chats** | réplica das DMs do LinkedIn: lista à esquerda, conversa no meio, dados do lead à direita. Você vê o SDR conversando e responde você mesmo quando quiser (§4.8) |
| **Pipeline** | os leads em colunas, do convite à reunião (§4.10) |
| **Campanhas** | cada campanha é um público com a sua abordagem, rodando numa conta. Aqui a pessoa monta uma campanha específica para ela (§4.11) |
| **Configurações** | tudo o que o primeiro acesso definiu: empresa, SDR, LinkedIn e equipe (§4.12) |

## 3 · Fora do escopo desta versão

- **Prospecção fora do Brasil.** As regras por praça (descadastro no Canadá,
  tarefa manual na Espanha) saíram. Perfis de outros países ficam pausados até
  as regras voltarem num épico próprio.
- **CRM externo.** O RD Station sai. O Pipeline é o CRM do Kakou.
- **Cadastro aberto.** No começo só entra e-mail de domínio liberado (§4.1).
- Cobrança, planos e termos de uso.
- E-mail, WhatsApp, InMail e Sales Navigator.
- Busca de leads por sinal (quem comentou post, troca de emprego).

## 4 · As regras de negócio

Estas regras são requisito. Cada uma tem ticket que a implementa e teste que a
verifica.

### 4.1 · Acesso e organização

- O login continua por link no e-mail. Entra quem já é operador e quem tem
  e-mail de um domínio liberado (`CADASTRO_DOMINIOS`, começa só com
  `guessless.com.br`). Qualquer outro e-mail não recebe link.
- No primeiro acesso de um e-mail liberado que ainda não é operador, nasce uma
  organização nova, e a pessoa é admin dela. Cada organização tem a própria
  análise, SDR, contas e leads.
- Organização sem o primeiro acesso concluído só vê o primeiro acesso (§2.1).
  Concluído = LinkedIn vinculado e a primeira campanha com permissão. Depois
  disso o primeiro acesso não volta.
- Organização que já existia antes deste épico, com conta conectada, entra
  direto no app. O SDR dela nasce da oferta já confirmada quando alguém abre o
  SDR em Configurações. Até lá, o agente segue com a voz e as regras de cada
  perfil: nada muda na voz de quem já conversa sem alguém ver o SDR antes.

### 4.2 · Análise do site

- A IA lê a página inicial e as de sobre, produtos, preços e cases (até
  `dossie.max_paginas`, padrão 8), só no domínio informado. O texto do site é
  dado, nunca instrução para a IA.
- **Negócio e Produto são fato do site.** O que o site não diz fica vazio.
  Provas guardam a URL de origem e nunca levam nome de pessoa física.
- **Mercado é hipótese**, e a tela diz isso: segmentos que compram e por quê,
  o que o cliente usa hoje no lugar (concorrentes ou alternativas que o site
  cita ou que a categoria implica), gatilhos de compra. Sem número de tamanho
  de mercado: o Kakou não inventa dado.
- Recusa antes de chamar a IA: endereço que não é site público (IP, localhost,
  outro esquema, usuário e senha na URL). Leitura que falha guarda o motivo e
  não apaga a análise anterior. Uma leitura por vez; leitura parada há mais de
  5 minutos pode recomeçar.
- A pessoa corrige e confirma. Edição humana vale como fato. Ler o site de
  novo (em Configurações) gera um rascunho que só vale depois de confirmado.
- Kill switch: configuração `dossie.ativo`.

### 4.3 · O SDR e o chat de teste

**O SDR** é a forma como a organização conversa no LinkedIn, gerada da análise
confirmada e guardada em versões. Ele tem:

| Campo | O que é |
|---|---|
| Objetivo | o que conta como sucesso, ex.: "marcar 20 minutos com o Arthur" |
| Voz | como a pessoa fala: tom, tratamento, o que soa como ela |
| Abertura | o jeito da primeira mensagem depois do convite aceito |
| Qualificação | os sinais e as perguntas que mostram que o lead serve |
| Objeções | objeção → como responder |
| Regras | as regras da pessoa ("não falo de preço por mensagem") |
| Quando chamar você | o que faz o SDR parar e passar a conversa para você |
| Link de agenda | vai só depois que o lead aceitar conversar |

- As **regras da casa** ficam por cima do SDR e não se editam: no máximo 30
  palavras por mensagem, uma pergunta por mensagem e duas na conversa, sem
  travessão, sem palavras vazias, sem prometer resultado, sem levar para
  WhatsApp ou e-mail, nunca dizer que não é robô, dizer a verdade sobre de onde
  veio o contato. E o validador (§4.13) vale para tudo.
- **O chat de teste é o mesmo agente da produção.** Mesmo prompt, mesmo
  validador, mesma decisão; só o lead é fictício. O que a pessoa testa é o que
  vai rodar.
- No teste, a pessoa é um lead de um dos segmentos do Mercado (escolhe qual no
  topo do chat). O SDR abre com a mensagem de abertura e responde cada
  mensagem dela. Quando a decisão não é uma mensagem (propor reunião com link,
  encerrar, registrar opt-out, chamar você), o chat mostra uma nota dizendo o
  que aconteceria.
- **Ajuste.** O campo do chat tem dois modos: "Responder como lead" e
  "Ajustar o SDR". No segundo, a pessoa escreve o que mudar ("menos formal",
  "nunca ofereça desconto") ou, numa resposta específica, o que o SDR deveria
  ter dito. A IA reescreve o SDR, grava uma versão nova com o pedido e o
  resumo do que mudou, mostra esse resumo no chat e refaz a última resposta.
  Todo ajuste se desfaz.
- O ajuste muda só o SDR; nunca desliga regra da casa nem validador. Pedido
  que contraria uma regra da casa é recusado com o motivo.
- "Recomeçar conversa" limpa o teste sem mexer no SDR. O teste fica salvo:
  quem volta encontra a conversa onde parou.

### 4.4 · Leads: quem compra, pela conta da casa

- Da análise confirmada sai o **público** principal: cargos e senioridade,
  setores, porte, região, por que precisa (dor, gatilho, resultado), ângulo e
  quem não é. A IA sugere até 3; a pessoa escolhe um e pode editar.
- **Prévia pela conta da casa.** Antes de a pessoa vincular o LinkedIn, a
  busca roda por uma conta da GuessLess marcada como conta da casa: a do
  Arthur (D1). A conta da casa só busca: nunca envia convite, mensagem nem
  visita perfil, não roda campanha de nenhuma organização, e o despachante
  ignora ela. A busca da prévia roda pelo servidor em nome da organização que
  está no primeiro acesso, não como operador da GuessLess.
- A prévia traz até `previa.max_pessoas` pessoas por organização (padrão 25,
  somando todas as buscas do primeiro acesso), e conta no teto de busca do dia
  da conta da casa (§4.13). Ao contrário das buscas das contas que prospectam,
  a da prévia roda a qualquer hora: quem chega à noite também vê os nomes.
  Sem saldo, ou com a conta da casa fora do ar, a tela mostra o perfil do lead
  sem nomes e avisa que a lista vem quando a pessoa vincular o LinkedIn. Nunca
  trava o primeiro acesso.
- A busca usa os cargos do público e a região dele, que o Kakou acha no
  LinkedIn pelo texto do público (sem achar, Brasil). Setor e porte ficam para
  a nota.
- A prévia fica guardada à parte (uma por organização) e não vira lead: só
  quando a organização vincula o LinkedIn, as pessoas marcadas entram na
  campanha pela conta dela, e aí passam pelas regras de importação (um alvo um
  dono, cooldown de empresa, URL, fonte e data da coleta). Opt-out já fica de
  fora na prévia.
- Cada pessoa ganha a nota de aderência de 0 a 100, com o motivo numa linha,
  feita só com o que a busca devolve. A lista vem ordenada pela nota; quem
  está na nota de corte ou acima (`busca.nota_de_corte`, padrão 70) já vem
  marcado. A pessoa tira quem não quer. Nenhum lead entra na abordagem sem
  estar marcado.
- [verificar] Se o id da pessoa na busca da conta da casa não valer para a
  conta da pessoa, o Kakou resolve de novo pela URL pública ao vincular.

### 4.5 · Abordagem e permissão

- Ao escolher o público, o Kakou gera a abordagem: o fluxo padrão de 4 toques
  (convite, e as mensagens depois do aceite, com as esperas), com os textos
  escritos para aquele público, na voz do SDR, citando só prova da análise.
- A tela mostra a abordagem como linha do tempo, não como editor de blocos.
  Cada texto se edita ali. O editor de blocos fica em Campanhas, como opção
  avançada.
- Textos usam só `{{first_name}}` e `{{company}}` e passam no validador antes de
  chegar à pessoa. Texto barrado ganha uma reescrita; se falhar de novo, chega
  marcado e não deixa seguir. Nunca corrige em silêncio.
- A tela diz o que vai acontecer: quantas pessoas, quantos convites por dia na
  rampa, a janela, que o SDR responde sozinho e quando chama a pessoa, e que dá
  para pausar a qualquer momento.
- **Nada sai sem permissão.** "Pode entrar em contato" grava quem permitiu e
  quando. No primeiro acesso ainda não há campanha: a abordagem e a permissão
  ficam guardadas à parte e vão para a campanha quando a conta é vinculada.
  Fora do primeiro acesso, ativar a campanha é a permissão, e grava quem e
  quando. A permissão é por campanha; editar ou gerar de novo a abordagem do
  primeiro acesso apaga a permissão: a pessoa permite o que vê.

### 4.6 · Vincular o LinkedIn e começar

- O vínculo é pelo hosted auth da Unipile. A conta vira um perfil da
  organização, operado por quem vinculou, com a rampa e a janela padrão (D3).
  A conta leva o nome do dono do LinkedIn conectado, que é em nome de quem o
  SDR escreve; reconectar a mesma conta não troca o nome.
- Vinculou, com a permissão da §4.5 já dada: o perfil ativa, a campanha passa
  para essa conta e ativa, e as pessoas marcadas entram na fila. A primeira
  ação espera a conta estabilizar (`conta_estavel_minutos`).
- O primeiro acesso termina aqui e a pessoa cai no Dashboard.
- Conectar outra conta, reconectar e pausar ficam em Configurações.

### 4.7 · Autonomia: o SDR responde sozinho, você assume quando quiser

- Depois da permissão, o SDR responde os leads sozinho. É o modo padrão de
  toda conta vinculada no primeiro acesso. O gate de eval para o modo
  automático sai; o eval continua como ferramenta interna para comparar
  versões de prompt.
- O SDR chama você e para de responder naquela conversa quando: a pessoa
  pergunta preço, reclama, pede algo fora do comum, a confiança da decisão
  fica abaixo de `agente.limiar_confianca`, ou bate um item de "Quando chamar
  você" (§4.3). Você é avisado por e-mail e no Dashboard.
- **Você assume quando responde.** Respondeu pelo Chats ou direto no LinkedIn, o
  SDR sai daquela conversa (o lead vai para `escalado_humano`). "Devolver ao
  SDR" põe ele de volta.
- Em Configurações, a pessoa troca para **"Aprovo cada resposta"**: o SDR
  escreve, e a resposta espera dentro do próprio chat, com Enviar, Editar e
  Descartar.
- Texto do SDR barrado pelo validador nunca sai: vira resposta para aprovar,
  com o motivo.

### 4.8 · Chats

- Réplica das DMs: todas as conversas das contas que a pessoa opera, inclusive
  as que não vieram de campanha, na ordem da última mensagem. Filtros: Todas ·
  SDR conversando · Com você · Precisa de você.
- Na conversa, as mensagens do lead à esquerda e as da conta à direita, cada
  uma marcada como **SDR** ou **Você**. Os marcos aparecem no fio: convite
  enviado, aceitou, o SDR chamou você e por quê, você assumiu, devolveu ao
  SDR.
- Ao lado, os dados do lead: cargo, empresa, campanha, etapa do Pipeline, nota
  e o link do perfil no LinkedIn.
- O campo de resposta manda pela Unipile, na hora, e passa pelo validador como
  texto humano.
- Conversa fora de campanha é só leitura e resposta humana: o SDR não entra.
- O histórico vem da Unipile ao vincular a conta; daí em diante chega por
  webhook. A tela se atualiza sozinha.

### 4.9 · Dashboard

- **Conta:** cada LinkedIn vinculado, com status (ativo, pausado e por quê),
  semana da rampa, convites e mensagens de hoje contra o teto e a taxa de
  aceite.
- **Números** da semana e do mês: convites, aceites, conversas, qualificados,
  reuniões, com o funil.
- **Precisa de você:** conversas em que o SDR chamou você, respostas
  esperando aprovação, conta com problema. Cada item leva direto ao lugar de
  resolver.
- **SDR:** modo de resposta, versão e último ajuste.

### 4.10 · Pipeline

| Coluna | Estados do lead (§6.1) |
|---|---|
| Na fila | `na_fila` |
| Convite enviado | `convite_enviado` |
| Conectado | `aceito`, `em_sequencia` |
| Conversando | `em_conversa`, `escalado_humano` |
| Qualificado | `qualificado` |
| Reunião marcada | `reuniao_marcada` |
| Encerrado (recolhida) | `sem_resposta`, `convite_retirado`, `encerrado_nao`, `optout` |

- O card mostra nome, cargo, empresa, nota e a última atividade, e abre o
  chat.
- O sistema move os cards sozinho. À mão, a pessoa só move para Qualificado,
  Reunião marcada ou Encerrado, e só quando a transição é válida (§6.1).
- Filtro por campanha e por conta.

### 4.11 · Campanhas

- Campanha = público × abordagem × conta. A primeira nasce no primeiro acesso.
- Lista com o público, a conta, o status e os números de cada uma.
- Dentro da campanha: **Público** (editar), **Leads** (busca pela conta da
  campanha, nota, marcar e tirar, importar arquivo), **Abordagem** (linha do
  tempo editável; editor de blocos como avançado), **Instruções do SDR** (texto
  livre que vale só nesta campanha, por cima do SDR da organização) e
  **Resultados**.
- "Nova campanha" repete os passos 4 e 5 do primeiro acesso, com a busca já
  pela conta da pessoa. Termina na mesma permissão.
- Pausar e retomar a campanha. Fluxo de campanha ativa com leads em andamento
  não muda por baixo deles: editar cria uma versão nova para quem entrar
  depois.

### 4.12 · Configurações

| Aba | O que tem |
|---|---|
| Empresa | a análise (Negócio, Produto, Mercado), editável; ler o site de novo |
| SDR | os campos do SDR, editáveis; "Testar no chat", que abre o chat de teste; histórico de ajustes com desfazer; modo de resposta (sozinho ou aprovo cada resposta); link de agenda |
| LinkedIn | contas vinculadas, status, rampa, teto, janela; nome e janela editáveis (o admin ou quem vinculou a conta); pausar e retomar; reconectar; vincular outra conta |
| Equipe | membros, papel (admin ou operador) e as contas que cada um opera. Só o admin muda |

### 4.13 · Regras do motor que continuam

Vêm do épico anterior e não mudam:

- **Validador de copy.** Toda mensagem que sai passa por ele: template, texto
  do SDR e texto humano. Sem travessão nem meia-risca, sem as palavras
  proibidas da organização, sem URL no convite e nas mensagens do fluxo, teto
  de caracteres por bloco (padrão 250 · 350 · 250 · 180), limite do LinkedIn
  na nota do convite, nunca afirmar que foi escrito à mão. Falha bloqueia o
  envio e manda para revisão com o motivo.
- **Teto por perfil.** O LinkedIn conta ações por conta, então o teto é do
  perfil, somando todas as campanhas. Rampa padrão de convites por dia
  8 · 12 · 15 (semanas 1, 2 e 3+), teto de 75 convites por semana, mensagens
  15 · 20 · 25 por dia (D3). Dias úteis, 9h às 18h no fuso do perfil (padrão
  da conta nova; início e fim se editam por conta, com pelo menos 1 hora), com
  intervalo aleatório de 3 a 12 minutos entre ações. Mensagem só para conexão
  de 1º grau. Convite pendente há mais de 21 dias é retirado. Busca e visita de
  perfil têm teto próprio por dia (`busca.max_resultados_dia`, padrão 100;
  `pesquisa.max_por_dia`, padrão 20); erro de limite na busca suspende só a
  busca até o dia útil seguinte.
- **Parada automática.** O perfil pausa sozinho, e quem opera é avisado, quando
  a Unipile reporta conta desconectada, checkpoint ou captcha; quando erro de
  limite se repete; quando o aceite fica abaixo de 15% em 3 dias úteis (amostra
  mínima de 20 convites); ou numa queda brusca de aceite. Despausar é sempre
  manual. Qualquer operador pausa por um botão.

E três que são do próprio motor:

- **Quem responde sai da régua na hora:** as ações pendentes do lead são
  canceladas no mesmo processamento do webhook. Nunca dois toques no mesmo
  dia para a mesma pessoa, nunca em fim de semana ou feriado.
- **Opt-out** é imediato e vale para a organização inteira (D10 do épico
  anterior). A pessoa não volta em nenhuma busca nem importação.
- **Um alvo, um dono:** uma pessoa pertence a um perfil da organização, e
  pessoas da mesma empresa tocadas por perfis diferentes respeitam o cooldown
  de empresa (padrão 30 dias). Todo contato guarda URL, fonte e data da
  coleta.

## 5 · Arquitetura

O motor fica como está. Muda o que está por cima e entra a conta da casa:

```text
 Primeiro acesso                      App
 site → análise → SDR → leads →       Dashboard · Chats · Pipeline ·
 abordagem → LinkedIn                 Campanhas · Configurações
        │                                   │
        ▼                                   ▼
 ┌──────────────────────┐         ┌──────────────────────────────┐
 │ Supabase             │◄───────►│ Claude API                   │
 │ organizações · SDR   │         │ Haiku: classifica, dá nota   │
 │ análise · leads      │         │ Sonnet: lê o site, gera e    │
 │ ações · mensagens    │         │ ajusta o SDR, abordagem,     │
 └───┬──────────────▲───┘         │ rascunho                     │
     │ tick 5 min   │ webhooks    └──────────────────────────────┘
 ┌───▼─────────┐    │
 │ Despachante ├────┴──► Unipile ──► LinkedIn das organizações
 └─────────────┘           │
                           └──► conta da casa: só a busca da prévia
```

| Peça | Escolha |
|---|---|
| App | Next.js (App Router) + TypeScript na Vercel |
| Banco e auth | Supabase (Postgres, Auth, RLS); a organização é a raiz de todos os dados |
| LinkedIn | Unipile: hosted auth, busca, convite, DM, histórico, webhooks |
| Agendamento | tabela `acoes` + tick a cada 5 minutos; um despachante central soma o teto por perfil |
| IA | `@anthropic-ai/sdk`; Haiku classifica e dá nota; Sonnet lê o site, gera e ajusta o SDR, escreve a abordagem e rascunha. Modelos em variável de ambiente |
| Alertas | e-mail pela Resend |

## 6 · Modelo de dados: o que muda

O modelo do épico anterior continua (organizações, operadores, perfis,
campanhas, fluxos, pessoas, leads, ações, mensagens, conversas, optouts,
eventos). Entra e muda:

```text
organizacoes  + primeiro_acesso_em                 -- §4.1: concluído o primeiro acesso
ofertas       dossie ganha "mercado" (hipótese):   -- §4.2
              {segmentos:[{nome, por_que}], alternativas:[...], gatilhos:[...]}
sdrs (                                             -- §4.3, um por organização
  id, organizacao_id unique, versao, sdr jsonb,    -- os campos da tabela da §4.3
  gerado_de_oferta_em, atualizado_em, atualizado_por
)
sdr_versoes (id, sdr_id, versao, sdr jsonb, pedido, resumo, em, por)   -- ajustes e desfazer
sdr_testes (id, organizacao_id, segmento, mensagens jsonb, sdr_versao, atualizado_em)
perfis        + casa boolean                        -- §4.4: só busca, o despachante ignora
previas (                                          -- §4.4, uma por organização
  id, organizacao_id unique, publico_id, status,   -- 'buscando' | 'pronta' | 'sem_nomes'
  pessoas jsonb,                                   -- quem a busca trouxe, com nota e marcação
  buscadas, motivo, regiao, iniciada_em, confirmada_em
)
              modo_resposta: 'automatico' | 'aprovacao' (sai 'manual')
abordagens (                                       -- §4.5, a do primeiro acesso, uma por organização
  id, organizacao_id unique, publico_id, textos jsonb, problemas jsonb,
  gerada_em, editada_em, permitida_em, permitida_por
)
campanhas     + permitida_em, permitida_por         -- §4.5
              + instrucoes_sdr                      -- §4.11
rascunhos     + sdr_versao                          -- que versão do SDR escreveu
```

Sai: `rd_eventos`, `leads.rd_deal_id`, a configuração `rd_station`, as tarefas
manuais da Espanha e o rodapé obrigatório do Canadá. Fuso e feriados ficam no
perfil.

### 6.1 · Estados do lead

Não mudam:

```text
importado ─► triagem ─┬─► rejeitado
                      └─► na_fila ─► convite_enviado ─┬─► aceito ─► em_sequencia ─► sem_resposta
                                                      └─► convite_retirado (21 d)
qualquer estado depois do convite ──(mensagem recebida)──► em_conversa
em_conversa ─┬─► qualificado ─► reuniao_marcada
             ├─► encerrado_nao
             ├─► optout
             └─► escalado_humano ──(devolver ao SDR)──► em_conversa
o SDR chama você, ou você responde ──► escalado_humano
perfil pausado ⇒ ações congeladas, estado preservado
```

Pessoa marcada na prévia ou na lista de leads é `triagem → na_fila`; pessoa
tirada é `rejeitado`. Toda transição grava um evento.

## 7 · O agente

- Dois passos, como antes: classificação da última mensagem (Haiku) e decisão
  com rascunho (Sonnet): `responder | propor_reuniao | encerrar |
  registrar_optout | escalar_humano`.
- O prompt de sistema passa a ser: regras da casa (fixas) + o SDR da
  organização + o resumo da análise. As instruções da campanha e o lead vão na
  mensagem do usuário. O prompt de sistema é estável por versão do SDR e vai
  para o cache.
- Cada rascunho grava a versão dos prompts e a versão do SDR.
- O chat de teste chama a mesma função de decisão com um lead fictício do
  segmento escolhido. Nenhum caminho de teste existe só para o teste.
- O ajuste do SDR é uma chamada própria: recebe o SDR atual, o pedido e o
  trecho da conversa, e devolve o SDR novo e o resumo do que mudou, com saída
  estruturada.

## 8 · Travas que não são código

| # | Trava | Bloqueia | Dono |
|---|---|---|---|
| T-1 | ~~Unipile ativa e a conta da casa conectada~~ ✅ 10/10: chaves na Vercel e a conta do Arthur conectada (marcar como casa é do SDR-44) | prévia de leads (SDR-44) | Arthur |
| T-2 | ~~Chave da Anthropic na Vercel~~ ✅ 10/10 | análise, SDR, chat de teste, nota, abordagem | Arthur |
| T-3 | Domínio de produção nas Redirect URLs do Auth do GL Suite | login | Arthur |
| T-4 | Resend com domínio verificado | aviso de "o SDR chamou você" | Arthur |
| T-5 | `SUPABASE_SECRET_KEY` do projeto do GL Suite na Vercel | primeiro acesso de e-mail novo (SDR-40) | Arthur |

## 9 · Tickets

Convenção: um ticket = um branch = um PR, com os testes dos critérios de
aceite. A numeração começa no 40 para não confundir com o épico anterior
(SDR-31 a SDR-34 caíram). [verificar] = confirmar na documentação ou com
conta real antes de codar.

Ordem e dependências (a onda diz o que pode correr em paralelo):

| Onda | Ticket | Depende de |
|---|---|---|
| 1 | SDR-40 Acesso, organização e moldura do primeiro acesso | — |
| 2 | SDR-41 Análise do site | 40 |
| 2 | SDR-47 Menu novo e Dashboard | 40 |
| 3 | SDR-42 O SDR da organização | 41 |
| 3 | SDR-44 Leads e prévia pela conta da casa | 41 |
| 3 | SDR-48 Chats | 47 |
| 3 | SDR-49 Pipeline | 47 |
| 4 | SDR-43 Chat de teste | 42 |
| 4 | SDR-45 Abordagem e permissão | 42, 44 |
| 4 | SDR-52 O SDR responde sozinho | 42, 48 |
| 5 | SDR-46 Vincular o LinkedIn e começar | 45 |
| 5 | SDR-50 Campanhas | 45, 47 |
| 5 | SDR-51 Configurações | 43, 47 |
| 6 | SDR-53 Sai o que ficou para trás | 46, 48 a 52 |

### Marco A · Primeiro acesso

**SDR-40 · Acesso por domínio, organização nova e a moldura do primeiro acesso**
- Login aceita e-mail de domínio em `CADASTRO_DOMINIOS` (no `.env.example`,
  lida por `lerEnv`) e cria o usuário pelo servidor, com a chave secreta do
  Supabase (`SUPABASE_SECRET_KEY`), sem ligar o cadastro público do Auth, que é
  dividido com o GL Suite. Os outros só entram se já forem operadores.
- No callback, e-mail liberado sem operador ganha organização nova e vira admin
  dela, numa transação, com evento.
- Rota `/onboarding` em tela cheia com os seis passos (§2.1) e o portão:
  organização sem `primeiro_acesso_em` só abre `/onboarding`; com ele, `/onboarding`
  manda para o app. Cada passo abre no estado salvo.
- Organização que já existia com conta conectada recebe `primeiro_acesso_em`
  na migration.
- Aceite: e-mail de domínio não liberado não recebe link; primeiro login cria
  uma organização só, mesmo com dois cliques; portão nos dois sentidos.

**SDR-41 · Análise do site: negócio, produto e mercado**
- Passos 1 e 2 do primeiro acesso, sobre a leitura do site que já existe.
- O dossiê ganha `mercado` (§6), marcado como hipótese na tela.
- Progresso da leitura na tela (páginas lidas até agora).
- Três blocos, Negócio · Produto · Mercado, com edição item a item e
  "Confirmar".
- Aceite: os casos de recusa e de falha da §4.2; edição humana sobrevive a uma
  leitura nova até ser confirmada; mercado sem número inventado no prompt e no
  esquema.

**SDR-42 · O SDR da organização**
- Tabelas `sdrs` e `sdr_versoes` (§6) e o esquema do SDR (§4.3) no domínio.
- Gerar o SDR da análise confirmada, com saída estruturada.
- O agente passa a montar o prompt de sistema com regras da casa + SDR +
  análise (§7) no lugar de voz, regras e oferta do perfil; o rascunho grava a
  versão do SDR. Instruções da campanha entram na mensagem do usuário.
- O SDR nasce logo depois de confirmar a análise, no primeiro acesso. O
  agente nunca gera SDR sozinho: organização sem SDR segue com a voz e as
  regras do perfil e o texto de oferta da configuração, sem mudança.
- Aceite: prompt de sistema igual para a mesma versão do SDR (cache); as
  regras da casa aparecem sempre, com qualquer SDR; mudança de versão do SDR
  muda o prompt; sem SDR, o prompt não muda.

**SDR-43 · Chat de teste: você no papel de lead**
- Passo 3 do primeiro acesso, e o mesmo componente em Configurações › SDR.
- Escolha do segmento no topo; abertura do SDR; cada mensagem do lead passa
  pela mesma decisão da produção com lead fictício (§7). Decisões que não são
  mensagem viram nota no chat.
- Modo "Ajustar o SDR": chamada de ajuste (§7), versão nova com pedido e
  resumo, resumo no chat, última resposta refeita. Desfazer volta à versão
  anterior. Pedido contra regra da casa é recusado com o motivo.
- "Recomeçar conversa" e "Ficou bom". Teste salvo em `sdr_testes`.
- Aceite: o caminho de decisão do teste é o da produção (teste que falha se
  alguém criar um atalho); ajuste não remove regra da casa; desfazer restaura
  a versão exata.

**SDR-44 · Leads: público e prévia pela conta da casa**
- Passo 4 do primeiro acesso.
- Público principal sugerido da análise (até 3 opções, uma escolhida,
  editável), sobre os públicos que já existem.
- `perfis.casa`, marcado na conta do Arthur pela migration (D1); a conta da
  casa sai de qualquer campanha e não aparece para escolher conta. O
  despachante, a pesquisa e qualquer envio ignoram ela.
- Prévia: busca montada do público pela conta da casa, a qualquer hora, até
  `previa.max_pessoas` por organização, no teto de busca do dia dela; opt-out
  de fora; nota de aderência; marcados os que estão na nota de corte.
- Sem saldo ou sem conta da casa: perfil do lead sem nomes, com o aviso.
- A prévia fica em `previas`, à parte; vira lead no SDR-46.
- Aceite: a conta da casa nunca aparece como remetente de nada; o teto da
  prévia é por organização somando as buscas; opt-out não aparece na prévia;
  queda da conta da casa não trava o passo.

**SDR-45 · Abordagem recomendada e permissão**
- Passo 5 do primeiro acesso, sobre o fluxo gerado que já existe, agora na voz
  do SDR.
- Linha do tempo legível com textos editáveis, validador em cada texto, o
  resumo do que vai acontecer (§4.5).
- "Pode entrar em contato" grava `permitida_em` e `permitida_por` em
  `abordagens` (à parte, uma por organização), com evento. Ativar campanha
  grava a permissão na campanha.
- Aceite: texto barrado duas vezes não deixa seguir; editar apaga a
  permissão; a permissão registra quem e quando.

**SDR-46 · Vincular o LinkedIn e começar**
- Passo 6 do primeiro acesso, sobre a conexão pela Unipile que já existe.
- A conta vira perfil da organização, operado por quem vinculou, com a rampa
  padrão e `modo_resposta = automatico`.
- Com a permissão dada: perfil ativo, a campanha ganha o perfil e ativa, as
  pessoas marcadas na prévia entram pelas regras de importação e vão para
  `na_fila`, e grava `primeiro_acesso_em`. Prévia sem nomes: a busca roda pela
  conta nova, com o mesmo público.
- [verificar] id da pessoa da prévia na conta nova; se não valer, resolver de
  novo pela URL pública antes do primeiro convite.
- Roda pelo aviso da Unipile e pela volta da pessoa, o que vier primeiro;
  só um leva por vez.
- Aceite: callback repetido não cria dois perfis nem duas campanhas; a
  primeira ação respeita `conta_estavel_minutos`; termina no app.

### Marco B · O app

**SDR-47 · Menu novo e Dashboard**
- Menu: Dashboard · Chats · Pipeline · Campanhas · Configurações. As rotas
  antigas redirecionam para a tela nova que as substitui.
- Sai o portão dos primeiros passos; fica o portão do primeiro acesso
  (SDR-40).
- Dashboard da §4.9. Um elemento marcante por tela, o resto quieto: aqui, a
  conta do LinkedIn com o teto do dia.
- Aceite: cada item de "Precisa de você" leva ao lugar certo; números batem
  com os eventos.

**SDR-48 · Chats: a réplica das DMs**
- Lista, conversa e painel do lead (§4.8), sobre a inbox que já existe.
- Marcação SDR/Você em cada mensagem e os marcos no fio.
- Responder pelo Chats; "Devolver ao SDR".
- No modo "aprovo cada resposta", a resposta pendente aparece no fim da
  conversa com Enviar, Editar e Descartar.
- Aceite: mensagem enviada aparece no fio sem recarregar; responder põe o lead
  em `escalado_humano`; devolver volta para `em_conversa`; celular com uma
  coluna por vez.

**SDR-49 · Pipeline**
- Colunas da §4.10, cards, filtro por campanha e conta, mover à mão só nas
  transições permitidas.
- Aceite: movimento inválido não acontece; card abre o chat.

**SDR-50 · Campanhas**
- Lista e as abas da §4.11. "Nova campanha" reaproveita os passos 4 e 5, com
  busca pela conta da pessoa, e termina na permissão.
- Instruções do SDR por campanha (`campanhas.instrucoes_sdr`).
- Aceite: campanha nova sem permissão não ativa; instrução da campanha entra
  só nos rascunhos dela.

**SDR-51 · Configurações**
- Abas da §4.12. Empresa e SDR reaproveitam os passos 2 e 3.
- Modo de resposta por conta: sozinho ou aprovo cada resposta.
- Aceite: só o admin muda Equipe; trocar o modo vale para a próxima resposta.

**SDR-52 · O SDR responde sozinho**
- Modo `automatico` padrão para conta vinculada no primeiro acesso; sai o gate
  de eval do modo automático; sai o modo `manual`.
- Quando chamar você (§4.7): para a conversa, `escalado_humano`, e-mail e item
  no Dashboard.
- Resposta do dono direto no LinkedIn tira o SDR da conversa (já existe para a
  régua; passa a valer para a conversa).
- Aceite: preço, reclamação e confiança baixa chamam você; texto barrado
  nunca sai; depois de você assumir o SDR não responde mais naquela conversa.

### Marco C · Limpeza

**SDR-53 · Sai o que ficou para trás**
- Sai a integração com o RD Station (código, configuração, variáveis e a
  tabela `rd_eventos`).
- Saem as regras por praça: rodapé do Canadá, tarefa manual da Espanha, o
  campo de praça no público. Fuso e feriados ficam no perfil.
- Saem as telas antigas que não são mais rota de nada (Início da jornada,
  Oferta, Públicos, Triagem, Importar, Aprovação, Tarefas, Resultados) e o
  código dos primeiros passos.
- Aceite: build, lint, testes e typecheck sem referência ao que saiu; nenhuma
  rota antiga devolve 404 (redireciona).

### Depois do épico

**SDR-57 · Editar nome e horário da conta do LinkedIn**
- Ao conectar uma conta nova, o perfil leva o nome do dono no LinkedIn, e não
  o de quem vinculou.
- Em Configurações > LinkedIn, "Editar nome e horário": nome da conta e início
  e fim da janela. Só o admin ou quem vinculou a conta.
- Aceite: conta conectada fica com o nome do LinkedIn e reconectar não o
  troca; janela com menos de 1 hora ou fim antes do início é recusada; quem
  só opera a conta não edita; a edição fica na trilha.

## 10 · Decisões abertas

| # | Decisão | Sugestão | Dono |
|---|---|---|---|
| D1 | Que conta do LinkedIn é a conta da casa | ✅ decidido em 10/10: a do Arthur, só para busca; nenhuma campanha roda nela | Arthur |
| D2 | Tamanho da prévia por organização | 25 pessoas | Arthur |
| D3 | Rampa e teto de uma conta nova | 8 · 12 · 15 convites/dia, 75/semana, 15 · 20 · 25 mensagens/dia | Arthur |
| D4 | O que faz o SDR chamar você, além do que a pessoa configurar | preço, reclamação, pedido fora do comum, confiança abaixo de 0,7 | Arthur |
| D5 | Quando abrir o cadastro além de `guessless.com.br` | depois de cobrança e termos | Arthur |

Continuam decididas, do épico anterior: teto de busca de 100 resultados por
dia por perfil (D8), nota de corte 70 (D9), opt-out por organização (D10) e
cooldown de empresa de 30 dias (D4).

## 11 · Custos de operação

| Item | Custo/mês |
|---|---|
| Unipile | €49 até 10 contas; a conta da casa ocupa uma |
| Claude API · primeiro acesso | leitura do site, SDR, cada turno do chat de teste (classificação + rascunho) e cada ajuste. Estimativa a medir no SDR-43: menos de US$ 1 por primeiro acesso |
| Claude API · operação | ~US$ 20 a 40 por conta ativa (rascunhos), nota de aderência ~US$ 2 por conta |
| Vercel, Supabase, Resend | planos que a casa já tem |

## 12 · Como rodar este épico

1. Um ticket por PR, na ordem da §9. Branch `feature/sdr-XX-<descricao-curta>`.
2. Qualquer mudança de regra de negócio atualiza este arquivo primeiro, no
   mesmo PR do código.
3. Interpretações e decisões técnicas vão em
   `specs/2026-09-29-sdr-linkedin-guessless.md`, seção "Primeiro acesso e
   SDR (10/10/2026)".
4. Comentários no código que citam seções (§) do épico anterior apontam para a
   versão no git (`604e192`). Cada ticket atualiza os que tocar; o SDR-53
   limpa o resto.
