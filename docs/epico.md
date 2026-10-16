# Épico · Kakou, o SDR de LinkedIn que nasce do seu site

10/10/2026 · uso interno · dono: Arthur · módulos, contatos e disparos em
16/10/2026 (Marco D)

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

Desde o Marco D, o Kakou é vendido em **módulos** (§4.14): o SDR no LinkedIn
é um deles; os outros disparam mensagens pelo WhatsApp (API oficial da Meta) e
pelo Telegram para um segmento dos contatos da organização. Toda organização
tem a base: contatos, tags e segmentos (§4.15 a §4.17).

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
2. **Análise.** Enquanto o Kakou lê o site, a tela mostra o que ele está lendo:
   a etapa em que está (abrindo o site, lendo as páginas, entendendo o negócio
   e o produto, montando o mercado), cada página aberta com título, caminho e
   um trecho, e há quanto tempo começou. O resultado vem em três blocos: **Negócio** (o que a empresa é e para quem),
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

Menu com até sete telas, nesta ordem. Cada uma aparece só com o módulo que a
libera (§4.14):

| Tela | Módulo | Para quê |
|---|---|---|
| **Dashboard** | base | a conta: LinkedIn conectado e saúde, quanto do teto de hoje já foi usado, os números da semana, o funil e o que precisa de você agora (§4.9); com disparos, os últimos disparos e como foram |
| **Chats** | SDR no LinkedIn | réplica das DMs do LinkedIn: lista à esquerda, conversa no meio, dados do lead à direita. Você vê o SDR conversando e responde você mesmo quando quiser (§4.8) |
| **Pipeline** | SDR no LinkedIn | os leads em colunas, do convite à reunião (§4.10) |
| **Campanhas** | SDR no LinkedIn | cada campanha é um público com a sua abordagem, rodando numa conta. Aqui a pessoa monta uma campanha específica para ela (§4.11) |
| **Contatos** | base | todos com quem a organização pode falar, em qualquer canal, com tags e segmentos (§4.15 a §4.17) |
| **Disparos** | WhatsApp ou Telegram | uma mensagem para um segmento, agora ou agendada, e como ela chegou (§4.18) |
| **Configurações** | base | tudo o que o primeiro acesso definiu: empresa, SDR, LinkedIn e equipe (§4.12); WhatsApp e Telegram conectados; o plano (§4.14) |

## 3 · Fora do escopo desta versão

- **Prospecção fora do Brasil.** As regras por praça (descadastro no Canadá,
  tarefa manual na Espanha) saíram. Perfis de outros países ficam pausados até
  as regras voltarem num épico próprio.
- **CRM externo.** O RD Station sai. O Pipeline é o CRM do Kakou.
- **Cadastro aberto.** No começo só entra e-mail de domínio liberado (§4.1).
- **Cobrança automática** (cartão, boleto, Pix) e termos de uso. Os módulos
  existem e cada um liga e desliga por organização (§4.14), mas quem liga é a
  GuessLess; a cobrança fica fora do Kakou (D16).
- E-mail, InMail e Sales Navigator.
- **Conversar pelo WhatsApp e pelo Telegram.** Os dois entram só para disparo
  (§4.18): a resposta do contato fica guardada e aparece no resultado do
  disparo, mas o Chats continua sendo do LinkedIn e o SDR não responde por
  esses canais.
- Criar e editar templates do WhatsApp (é no WhatsApp Manager da Meta) e o
  cadastro do número pelo Embedded Signup da Meta (D15).
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
| Quando chamar você | o que faz o SDR parar e passar a conversa para você, além do que sempre passa (§4.7) |
| Cautela | o quanto ele arrisca sozinho na dúvida: mais cauteloso, equilibrado (padrão) ou mais solto. Quem escolhe é a pessoa, nunca a IA |
| Link de agenda | vai só depois que o lead aceitar conversar |

- As **regras da casa** ficam por cima do SDR e não se editam: no máximo 30
  palavras por mensagem, uma pergunta por mensagem e duas na conversa, sem
  travessão, sem palavras vazias, sem frase de efeito (a primeira mensagem
  termina com uma pergunta fácil de responder), sem prometer resultado, sem levar para
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
  da conta da casa (§4.13). Como toda busca, a da prévia roda a qualquer
  hora: quem chega à noite também vê os nomes.
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
  pergunta preço, reclama, pede algo fora do comum, o pedido de parar não
  fica claro, quer marcar e não há link de agenda, a confiança da decisão
  fica abaixo do nível de cautela do SDR (mais cauteloso 0,8 · equilibrado
  0,7 · mais solto 0,6; sem SDR, `agente.limiar_confianca`), ou bate um item
  de "Quando chamar você" (§4.3). Os casos fixos não se desligam. Você é
  avisado por e-mail e no Dashboard.
- **Tudo isso numa seção só**, em Configurações > SDR: o que sempre passa, os
  casos da pessoa e a cautela, editáveis, com as conversas que o SDR passou
  nos últimos 30 dias (motivo e proporção sobre as mensagens que ele tratou)
  e o que acontece depois que ele passa. O chat de teste tem mensagens de
  lead prontas para cada caso fixo.
- **Você assume quando responde.** Respondeu pelo Chats ou fora do Kakou
  (LinkedIn no site, no celular ou em outra ferramenta), o SDR para naquela
  conversa: o lead vai para `escalado_humano` e nada mais sai sozinho, nem a
  sequência nem uma resposta que já estava agendada. Vale em qualquer etapa,
  inclusive antes da pessoa responder e depois de a sequência terminar sem
  resposta. "Devolver ao SDR" põe ele de volta.
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
- **Listas de empresas.** A organização guarda listas de empresas (nome da
  lista e as empresas, com o nome como veio), para buscar pessoas só nelas.
  Uma lista serve para várias campanhas. Entrada: colar os nomes, um por
  linha, ou subir CSV/TXT; a coluna é reconhecida pelo nome (empresa, nome,
  company, razão social, nome fantasia, organization…), e sem cabeçalho
  reconhecível vale a primeira coluna. Empresa repetida (mesma chave de
  empresa da §4.13: sem acento, pontuação e sufixo societário) entra uma vez.
  Não há teto de empresas por lista.
- Cada empresa é procurada no LinkedIn pela conta conectada e saudável da
  organização (a conta da casa só se não houver outra; sem conta, a tela
  avisa). Conta que a Unipile recusa na consulta (desconectada, mesmo com
  status OK) dá lugar à próxima saudável, e a tela diz qual reconectar. Todas
  recusadas de uma vez, a procura para e aponta a chave da API da Unipile, não
  as contas; a chave recusada (`missing_credentials`) para a procura na hora. Sem nenhuma página, a empresa fica **sem página** e a busca procura
  o nome dela no texto da empresa atual da pessoa. Se, entre as páginas
  achadas, exatamente uma tem a mesma chave do nome, ela é a **achada**. Senão
  a pessoa **escolhe** entre até 5 páginas, ou "nenhuma destas" (vira sem
  página). A procura vai de 20 em 20, com uma pausa aleatória de 1 a 3 s entre
  uma empresa e outra; erro de limite do LinkedIn para a procura e avisa. A
  procura não conta no teto de busca do dia (é consulta de lista, como região
  e setor).
- A busca da campanha tem o filtro opcional **"Só nestas empresas"**: uma
  lista salva. Com lista, a região deixa de ser obrigatória (a lista já
  delimita); cargos, palavras-chave, setor e região continuam valendo juntos.
  Empresa ainda não procurada ou esperando escolha fica fora da busca até ser
  resolvida, e a tela diz quantas são. A busca roda por partes: as achadas em
  grupos de 10 páginas e uma parte para cada empresa sem página. Teto do dia,
  suspensão por limite, opt-out, um alvo um dono, cooldown e nota seguem
  iguais. Trocar a lista é mudar o filtro: a busca recomeça do início. Se a
  lista mudar (empresa entra, sai ou é escolhida), a busca também recomeça do
  início da lista: quem já entrou aparece como repetido, ninguém fica de fora.
  Lista apagada: a busca não roda e pede outra lista ou tirar o filtro.
- **Busca pela conversa.** Em cima dos filtros, a pessoa diz quem quer achar
  em texto livre ("diretores de e-commerce em São Paulo, só varejo") e ajusta
  conversando ("põe também CMO", "tira o Rio"). A IA muda os filtros do
  formulário: cargos, palavras-chave, região, setor e lista de empresas. Quem
  acha região e setor no LinkedIn é a conta da campanha, pelo nome; a IA
  nunca escolhe o id. Com mais de uma opção para o nome (São Paulo cidade ou
  estado), a pessoa escolhe. A conversa não salva nem roda a busca: a pessoa
  confere os filtros e busca, como antes. Ela usa uma lista de empresas da
  organização pelo nome, ou cria uma com os nomes que a pessoa der (até 200;
  lista maior se cria em Listas de empresas), e a procura das empresas no
  LinkedIn começa na hora. O que a busca não filtra (porte, tempo de casa,
  excluir cargo) não vira filtro inventado: porte fica na nota. A conversa
  vale só enquanto a tela está aberta; o que fica é a busca.
- Pausar e retomar a campanha. Fluxo de campanha ativa com leads em andamento
  não muda por baixo deles: editar cria uma versão nova para quem entrar
  depois.

### 4.12 · Configurações

| Aba | O que tem |
|---|---|
| Empresa | a análise (Negócio, Produto, Mercado), editável; ler o site de novo |
| SDR | os campos do SDR, editáveis; "Testar no chat", que abre o chat de teste; histórico de ajustes com desfazer; quando o SDR passa a conversa para você (§4.7); modo de resposta (sozinho ou aprovo cada resposta); link de agenda |
| LinkedIn | contas vinculadas, status, rampa, teto, janela; nome e janela editáveis (o admin ou quem vinculou a conta); pausar e retomar; reconectar; vincular outra conta |
| WhatsApp | o número conectado pela API oficial da Meta, a qualidade e o limite, os templates aprovados; conectar e desconectar (§4.19). Só com o módulo |
| Telegram | o bot conectado, o link de entrada e os links com tag, a mensagem de boas-vindas; conectar e desconectar (§4.20). Só com o módulo |
| Equipe | membros, papel (admin ou operador) e as contas que cada um opera. Só o admin muda |
| Plano | os módulos, o que cada um faz, os contratados e o uso do mês (§4.14) |

Empresa, SDR e LinkedIn aparecem só com o SDR no LinkedIn. Conectar e
desconectar WhatsApp e Telegram é do admin.

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
  `pesquisa.max_por_dia`, padrão 20); a busca de leads roda a qualquer hora,
  inclusive fora da janela e no fim de semana, dentro do teto do dia; erro de
  limite na busca suspende só a busca até o dia útil seguinte.
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

### 4.14 · Módulos e plano

- O Kakou é vendido em módulos, e a organização contrata só o que usa. Os
  nomes de venda ficam em `docs/naming.md` (D13); no código, cada módulo tem
  um id que não muda.

  | Módulo | id | O que libera |
  |---|---|---|
  | **SDR no LinkedIn** | `linkedin` | o primeiro acesso, Chats, Pipeline, Campanhas, as abas Empresa, SDR e LinkedIn, e o motor (despachante, agente, busca) |
  | **Disparos no WhatsApp** | `whatsapp` | conectar o número do WhatsApp Business da organização e disparar templates aprovados (§4.19) |
  | **Disparos no Telegram** | `telegram` | conectar o bot da organização e disparar para quem entrou pelo bot (§4.20) |

- Toda organização tem a **base**, sem contratar nada: Dashboard, Contatos
  (com tags e segmentos), Equipe e Plano (D12).
- Quem liga e desliga módulo é a GuessLess, na tela **Plataforma**, que só
  abre para os e-mails em `PLATAFORMA_ADMINS`. Cada mudança grava quem, quando
  e o motivo. Não há cobrança automática nesta versão (§3, D16).
- Organização nova (§4.1) nasce com o SDR no LinkedIn, como hoje; as que já
  existem também. A organização da GuessLess ganha os três.
- **Módulo desligado:** as telas dele somem do menu; a rota abre o Plano
  dizendo que o módulo não está contratado; as ações do servidor recusam; e
  nada dele roda em segundo plano. Os dados ficam guardados: religar volta
  como estava.
  - Desligar o SDR no LinkedIn pausa as contas ativas da organização, com o
    motivo e o aviso de sempre (§4.13). Religar não despausa: despausar é
    sempre manual.
  - Desligar WhatsApp ou Telegram pausa os disparos daquele canal que estão
    agendados ou saindo, com o motivo. Religar não retoma: a pessoa retoma.
- **Primeiro acesso.** Ele é do SDR no LinkedIn (§2.1). Organização com esse
  módulo e sem o primeiro acesso concluído:
  - sem outro módulo, vê só o primeiro acesso, como hoje;
  - com outro módulo, entra no app, e as telas do LinkedIn levam ao primeiro
    acesso.

  Sem o módulo, a organização entra direto no app.
- **Configurações > Plano** mostra cada módulo: o que faz, se está contratado
  e desde quando, e o uso do mês (contas do LinkedIn vinculadas, convites e
  mensagens; mensagens enviadas por WhatsApp e por Telegram; contatos). Módulo
  fora do plano tem o botão "Quero contratar", que leva ao comercial da
  GuessLess (`COMERCIAL_URL`).

### 4.15 · Contatos

- **Contato** é qualquer pessoa com quem a organização pode falar, em qualquer
  canal: nome, empresa, cargo, e-mail e os canais (LinkedIn, WhatsApp e
  Telegram). Contato é da organização.
- Ele vem de quatro lugares:
  - do LinkedIn: toda pessoa que entra numa campanha vira contato, ligado ao
    lead;
  - da importação de planilha;
  - de quem entra pelo bot do Telegram (§4.20);
  - de quem escreve primeiro para o WhatsApp da organização (§4.19).
- Um contato por telefone e um por conta do Telegram, por organização.
  Importar de novo completa só o que estava vazio (não troca o que já existe)
  e soma as tags.
- **Telefone** fica no formato internacional (`+5511999998888`). Número com
  DDD e sem DDI ganha +55; número que não forma telefone válido não entra, e a
  linha volta com o motivo.
- **Importar planilha** (CSV ou texto colado): as colunas são reconhecidas
  pelo nome (nome, telefone, celular, whatsapp, e-mail, empresa, cargo, tags).
  Até 5.000 linhas por vez. Para o WhatsApp, quem importa marca que **essas
  pessoas autorizaram receber mensagens da empresa pelo WhatsApp**. Sem a
  marca, os contatos entram mas não recebem disparo pelo WhatsApp. A
  autorização guarda quem marcou, quando e em qual importação.
- **Sair** tem dois tamanhos (D14):
  - **sair de um canal**: o contato não recebe mais disparo por aquele canal.
    É o que acontece com "SAIR" ou o botão de parar no WhatsApp (§4.19) e com
    /sair ou bloquear o bot no Telegram (§4.20);
  - **não contatar mais**: o contato não recebe mais nada da organização, por
    nenhum canal. É o opt-out do LinkedIn (§4.13), que passa a valer também
    para os disparos, e o botão "Não contatar mais" no contato. Se o contato
    for lead do LinkedIn, o botão também registra o opt-out da §4.13.

  Pela tela, ninguém desfaz uma saída. Quem saiu do Telegram volta só pelo
  próprio Telegram (/start); quem saiu do WhatsApp não volta nesta versão.
- A tela **Contatos**: a lista com busca e filtros (tag, canal, origem,
  segmento, quem saiu), selecionar e pôr ou tirar tags em massa, importar, e
  o contato com os canais, as tags, os disparos que recebeu, as respostas e o
  lead do LinkedIn, se houver.

### 4.16 · Tags

- Tag é um rótulo da organização, com nome e cor, que se põe em contatos.
  Nome único na organização, sem diferença de maiúscula ou acento, até 40
  caracteres; até 200 tags por organização.
- Põe e tira: no contato; em massa, em Contatos (os selecionados ou todos do
  filtro); na importação (coluna tags, separadas por vírgula ou ponto e
  vírgula, e a tag que não existe é criada); no painel do lead no Chats; e
  pelo link de entrada do Telegram (§4.20).
- O Chats e o Pipeline mostram as tags do lead, e o Pipeline filtra por tag.
- Renomear ou trocar a cor vale para todos os contatos. Apagar tira a tag de
  todos, e a tela diz de quantos antes de confirmar. Tag usada por um
  segmento não se apaga: a tela diz quais segmentos usam.
- Pôr e tirar tag fica na trilha: quem, quando e em quantos contatos.

### 4.17 · Segmentos

- Segmento é um filtro de contatos com nome, salvo para usar de novo. Ele é
  recalculado a cada uso: quem passa a cumprir o filtro entra, quem deixa de
  cumprir sai.
- As condições valem juntas:
  - tags: tem todas estas; tem pelo menos uma destas; não tem nenhuma destas;
  - canal: pode receber pelo WhatsApp, pelo Telegram, ou é lead do LinkedIn;
  - origem: LinkedIn, importação, Telegram ou WhatsApp;
  - do LinkedIn: etapa do Pipeline (§4.10), campanha e nota mínima;
  - texto no nome, na empresa ou no cargo;
  - entrou a partir de uma data.
- Quem pediu para não ser mais contatado (§4.15) nunca está em segmento.
- Enquanto a pessoa monta, a tela mostra quantos contatos o segmento tem
  agora, os primeiros deles e a descrição em português ("contatos com a tag
  Cliente, sem a tag Inativo, que podem receber pelo WhatsApp").
- Contatos aceita um segmento como filtro. Apagar um segmento não mexe nos
  disparos feitos com ele: cada disparo guarda o filtro que usou.

### 4.18 · Disparos

- Disparo é uma mensagem para um segmento, por um canal (WhatsApp ou
  Telegram), agora ou numa data e hora. Precisa do módulo do canal e do canal
  conectado.
- **Quem recebe é o segmento na hora da confirmação.** A lista congela ali e
  não muda durante o envio. Antes de confirmar, a tela mostra quantos vão
  receber, quantos ficam de fora e por quê (sem o canal, sem autorização do
  WhatsApp, saiu do canal, recebeu outro disparo há pouco, campo do template
  vazio), e a mensagem como chega para três contatos do segmento.
- **Nada sai sem confirmação.** "Disparar agora" ou "Agendar" grava quem
  confirmou e quando. Disparo confirmado não se edita: pausa, retoma ou
  cancela. Cancelar não desfaz o que já saiu.
- **Conferência na hora de cada envio:** quem não pode mais ser contatado,
  saiu do canal ou bloqueou depois da confirmação não recebe; fica pulado, com
  o motivo.
- **Uma mensagem por contato por disparo**, e um contato não recebe dois
  disparos pelo mesmo canal em menos de 24 horas (`disparos.intervalo_horas`,
  D17).
- **Janela:** disparo só sai das 8h às 21h no horário de Brasília
  (`disparos.janela`, D17). O que não coube continua no dia seguinte, às 8h.
  Agendar fora da janela é recusado com o horário em que daria.
- **Ritmo:** os envios saem numa fila, no ritmo de cada canal, sem depender da
  tela aberta. Fechar o navegador não para o disparo. A fila roda a cada
  minuto (`/api/cron/disparos`) e também logo depois da confirmação.
- **Nunca duas vezes:** envio que caiu no meio, sem a resposta do canal, não é
  repetido sozinho. Ele fica como falha com o motivo "pode ter chegado", e
  quem decide é a pessoa ("Tentar de novo as falhas").
- **Falhas:**
  - do contato (número sem WhatsApp, bot bloqueado, conta apagada): falha com o
    motivo, sem nova tentativa, e o contato sai do canal quando o motivo é
    definitivo;
  - de ritmo (limite por segundo do canal): espera e tenta de novo, até 3
    vezes;
  - da conta (token inválido, número restrito, template pausado ou apagado,
    limite diário da Meta): o disparo pausa sozinho, com o motivo, e quem
    confirmou é avisado no Dashboard.
- **Resultado:** na fila, enviadas, entregues, lidas (só WhatsApp),
  responderam, falharam e puladas, com o motivo de cada falha e as respostas.
  Resposta é mensagem do contato no canal em até 7 dias depois do envio.
  "Tentar de novo as falhas" põe de volta na fila só as falhas que podem dar
  certo agora (ritmo, conta, pode ter chegado), com nova conferência.

### 4.19 · WhatsApp pela API oficial da Meta

- **Conectar** (Configurações > WhatsApp, só o admin), pelo app da própria
  organização na Meta: ela informa o id da conta do WhatsApp Business (WABA),
  o id do número, um token permanente de usuário do sistema com as permissões
  `whatsapp_business_messaging` e `whatsapp_business_management`, e o segredo
  do app. O Kakou confere na Meta (número, nome verificado, qualidade e
  limite), guarda o token e o segredo cifrados e inscreve o app na conta com o
  webhook do Kakou, para receber os status e as respostas. Se a Meta não
  aceitar a inscrição, o canal conecta assim mesmo e a tela mostra a URL e o
  token para configurar no app. Um número por organização, e um número numa
  organização só. O Embedded Signup, com o app da GuessLess, fica para quando
  a GuessLess for Tech Provider (D15): até lá, nada é preciso do lado da
  GuessLess na Meta.
- **Templates:** o Kakou lista os templates aprovados da conta (nome,
  categoria, idioma e texto). O disparo só usa template aprovado. Cada
  variável do template vem de um campo do contato (primeiro nome, nome,
  empresa, cargo) ou de um texto fixo; contato sem o campo fica de fora, com
  o motivo. Cabeçalho com imagem, vídeo ou documento pede o link público do
  arquivo. Criar e editar template é no WhatsApp Manager.
- Recebe o disparo só quem tem telefone, autorização para o WhatsApp (§4.15) e
  não saiu do WhatsApp.
- Quem escreve primeiro para o número vira contato (origem WhatsApp), sem a
  autorização de disparo: escrever não é autorizar marketing.
- **Sair do WhatsApp:** a mensagem que é só "SAIR", "PARAR", "PARE", "STOP",
  "CANCELAR" ou "DESCADASTRAR" (sem diferença de maiúscula ou acento), um
  pedido claro para parar (o detector da §7) ou o botão de parar promoções da
  Meta tiram o contato do WhatsApp na hora.
- **Custo:** a Meta cobra cada mensagem de template entregue direto na conta
  do WhatsApp Business da organização; não passa pela GuessLess. A tela de
  confirmação mostra a estimativa com o preço por categoria da configuração
  `whatsapp.precos` e diz que o valor é da Meta.
- Status de entrega e de leitura chegam pelo webhook da Meta, assinado com o
  segredo do app da organização. Webhook sem assinatura válida é recusado.
  O status só anda para a frente (aviso repetido ou fora de ordem não volta
  estado).
- Erro da conta (token, permissão, pagamento, número restrito) pausa o
  disparo e deixa o canal com erro até alguém atualizar ou reconectar.
  Template pausado ou desativado pela Meta pausa o disparo. O limite de
  pessoas por 24 h da Meta (o do número) também pausa, com o aviso.

### 4.20 · Telegram

- **Conectar** (Configurações > Telegram, só o admin): a organização cria um
  bot no @BotFather e cola o token. O Kakou confere o bot, guarda o token
  cifrado e liga o webhook, com um segredo que o Telegram devolve em cada
  aviso. Bot tem um webhook só: se ele já manda os avisos para outro sistema,
  a tela avisa e só conecta se a pessoa confirmar que pode desligar o outro.
  Um bot é de uma organização só.
- Bot só fala com quem falou com ele primeiro (regra do Telegram). Por isso a
  lista do Telegram é feita de quem entra pelo **link do bot**
  (`t.me/<bot>?start=...`): quem abre e toca em Começar vira contato (origem
  Telegram), com nome e @usuário, e já pode receber disparo.
- **Links de entrada com tag:** a organização cria links que põem uma tag em
  quem entra por eles ("evento-sp", "site"), para saber de onde a pessoa veio
  e segmentar.
- O bot responde a entrada com a mensagem de boas-vindas da organização
  (padrão: "Pronto, {{first_name}}! Você vai receber as novidades da
  <organização> por aqui. Para sair, mande /sair.").
- **Sair do Telegram:** /sair, /stop ou a mensagem que é só "sair", "parar"
  ou "stop" tiram o contato do Telegram, e o bot confirma; /start volta.
  Bloquear o bot também tira; desbloquear não volta sozinho (volta com
  /start).
- O texto do disparo tem até 4.096 caracteres, usa `{{first_name}}` e
  `{{company}}` como os textos do LinkedIn (§4.5), sem formatação, e pode ter
  um botão com link.
- Mensagem que o contato manda para o bot fica guardada e conta como resposta
  ao último disparo que ele recebeu em até 7 dias.

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

 Marco D: contatos · tags · segmentos · disparos
 ┌──────────────────┐ cron 1 min ┌──────────────────────────────────┐
 │ Fila de disparos ├───────────►│ Meta Cloud API ──► WhatsApp      │
 │ envios_do_disparo│            │ Telegram Bot API ──► Telegram    │
 └──────────────────┘◄───────────┤ webhooks: status e respostas     │
                                 └──────────────────────────────────┘
```

| Peça | Escolha |
|---|---|
| App | Next.js (App Router) + TypeScript na Vercel |
| Banco e auth | Supabase (Postgres, Auth, RLS); a organização é a raiz de todos os dados |
| LinkedIn | Unipile: hosted auth, busca, convite, DM, histórico, webhooks |
| Agendamento | tabela `acoes` + tick a cada 5 minutos; um despachante central soma o teto por perfil |
| IA | `@anthropic-ai/sdk`; Haiku classifica e dá nota; Sonnet lê o site, gera e ajusta o SDR, escreve a abordagem e rascunha. Modelos em variável de ambiente |
| Alertas | e-mail pela Resend |
| WhatsApp | API oficial da Meta (Cloud API), chamada direto pelo Kakou, sem BSP no meio; o app de cada organização manda os webhooks para `/api/webhooks/whatsapp/<canal>`, assinados com o segredo dele ([pesquisa](pesquisa/whatsapp-cloud-api.md)) |
| Telegram | Bot API, um bot por organização, webhook com segredo por canal ([pesquisa](pesquisa/telegram-bot-api.md)) |
| Disparos | tabela `envios_do_disparo` como fila, com reserva por prazo; `/api/cron/disparos` a cada minuto pelo pg_cron e logo depois da confirmação |
| Segredos | tokens do WhatsApp e do Telegram cifrados (AES-256-GCM) com `SEGREDOS_CHAVE` |

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

Entra no Marco D (o banco é dividido com o GL Suite: nome novo de tabela é
conferido contra as dele, e a migration recusa rodar se achar uma tabela de
mesmo nome que não é do Kakou):

```text
modulos_da_organizacao (                           -- §4.14
  organizacao_id, modulo,                          -- 'linkedin' | 'whatsapp' | 'telegram'
  ativo, desde, motivo, alterado_em, alterado_por  -- alterado_por: e-mail de quem é da plataforma
)
contatos (                                         -- §4.15, um por telefone e um por Telegram na organização
  id, organizacao_id, nome, primeiro_nome, empresa, cargo, email,
  origem,                                          -- 'linkedin' | 'importacao' | 'telegram' | 'whatsapp'
  pessoa_id unique,                                -- o lead do LinkedIn, quando há
  telefone, whatsapp_autorizado_em, whatsapp_autorizacao jsonb, whatsapp_saiu_em, whatsapp_motivo,
  telegram_canal_id, telegram_id, telegram_usuario, telegram_entrou_em, telegram_saiu_em, telegram_motivo,
  nao_contatar_em, nao_contatar_motivo, criado_em, atualizado_em
)
tags (id, organizacao_id, nome, chave, cor, criado_em, criado_por)   -- §4.16; chave: nome sem acento e caixa
contato_tags (contato_id, tag_id, em, por)
segmentos (id, organizacao_id, nome, filtros jsonb, criado_em, criado_por, atualizado_em)   -- §4.17
canais (                                           -- §4.19 e §4.20, um por tipo na organização
  id, organizacao_id, tipo,                        -- 'whatsapp' | 'telegram'
  nome, status, credencial,                        -- credencial: token cifrado
  dados jsonb,                                     -- WABA, número, qualidade, limite | bot e @usuário
  boas_vindas, erro, conectado_em, conectado_por, verificado_em
)
links_de_entrada (id, canal_id, codigo unique, nome, tag_id, criado_em)   -- §4.20
disparos (                                         -- §4.18
  id, organizacao_id, canal_id, nome, segmento_id, filtros jsonb,  -- filtros: o do segmento na confirmação
  conteudo jsonb,                                  -- template e variáveis | texto e botão
  status,                                          -- 'rascunho' | 'agendado' | 'enviando' | 'pausado' | 'concluido' | 'cancelado'
  agendado_para, confirmado_em, confirmado_por, iniciado_em, concluido_em, motivo_pausa,
  total, criado_em, criado_por
)
envios_do_disparo (                                -- a fila: um por contato do disparo
  id, disparo_id, contato_id, destino, texto,
  status,                                          -- 'pendente' | 'enviando' | 'enviado' | 'entregue' | 'lido' | 'falhou' | 'pulado' | 'cancelado'
  motivo, provider_message_id, tentativas, reservado_ate, tentar_apos,
  enviado_em, entregue_em, lido_em, respondido_em
)
mensagens_dos_canais (                             -- o que chega pelo WhatsApp e pelo Telegram
  id, canal_id, contato_id, direcao, texto, provider_message_id, envio_id, em, payload
)
```

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
o SDR chama você, ou você responde (pelo Chats ou fora do Kakou) ──► escalado_humano
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
| T-6 | Migrations do Marco D aplicadas por SQL no banco do GL Suite (nunca por `db push`) | tudo do Marco D | Arthur |
| T-7 | `PLATAFORMA_ADMINS` e `COMERCIAL_URL` na Vercel | ligar módulos pela tela e o "Quero contratar" (SDR-69) | Arthur |
| T-8 | `SEGREDOS_CHAVE` (32 bytes aleatórios em base64) na Vercel. Trocar a chave invalida os tokens guardados | conectar WhatsApp e Telegram (SDR-72, SDR-73) | Arthur |
| T-9 | Um número de WhatsApp Business de verdade, com o app da empresa na Meta, para o primeiro disparo real (o código foi testado só com a Meta de mentira) | aceite do SDR-72 com serviço real | Arthur |
| T-10 | pg_cron dos disparos a cada minuto (`supabase/snippets/disparos-pg-cron.sql`) | disparo agendado e disparo que segue com a tela fechada (SDR-72) | Arthur |

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

**SDR-58 · Busca de leads a qualquer hora**
- A busca da campanha deixa de esperar a janela e o dia útil da conta. O teto
  de busca do dia e a suspensão por limite do LinkedIn continuam.
- Aceite: busca no sábado e de madrugada roda; o teto do dia segue valendo.

**SDR-59 · Lista de empresas na busca**
- Pedido: alimentar o Kakou com uma planilha que não é de leads (ex.: só os
  nomes de administradoras judiciais) para ele buscar pessoas nessas empresas.
- Listas de empresas da organização (§4.11) em Campanhas › Listas de
  empresas: criar colando nomes ou subindo CSV/TXT, procurar no LinkedIn,
  escolher a página certa quando há dúvida, adicionar, tirar, renomear e
  apagar.
- Na aba Leads, o filtro "Só nestas empresas" com uma lista salva. Com lista,
  a região fica opcional; a busca roda por partes (páginas achadas em grupos
  de 10, uma parte por empresa sem página) e recomeça do início quando a lista
  muda.
- Aceite: empresa repetida entra uma vez; lista grande entra inteira (sem
  teto de empresas); empresa com uma página de mesmo nome fica achada, com
  dúvida pede escolha, sem página vai pela busca do nome; pendentes ficam fora
  da busca e a tela diz quantas; busca com lista e sem região roda; a última
  parte esgotada encerra a busca; lista mudada recomeça do início; lista
  apagada não roda; sem lista, a busca é a mesma de antes.

**SDR-60 · Quando o SDR passa a conversa para você, numa seção só**
- Em Configurações > SDR, a seção da §4.7: o que sempre passa (não se
  desliga), os casos da pessoa e a cautela (mais cauteloso, equilibrado,
  mais solto), que sai do limiar global e passa a ser do SDR da organização.
- As conversas que o SDR passou nos últimos 30 dias, com o motivo, a conta,
  se ainda estão com você e a proporção sobre as mensagens que ele tratou;
  e o que acontece depois que ele passa.
- No chat de teste de Configurações, mensagens de lead prontas para cada caso
  fixo (preço, reclamação, pedido fora do comum, marcar conversa).
- Aceite: com cautela "mais cauteloso", uma decisão com 0,75 de certeza chama
  você; com "mais solto", vira resposta; SDR sem cautela vale o equilibrado;
  salvar a seção não desfaz o editor do SDR, e vice-versa; gerar o SDR de
  novo ou ajustar pelo chat não muda a cautela.

**SDR-61 · Quem escreve fora do Kakou tira o SDR**
- Mensagem da conta escrita fora do Kakou faz o SDR parar naquela conversa em
  qualquer etapa (§4.7), inclusive com a sequência terminada sem resposta ou
  o convite retirado.
- A resposta do SDR que já estava agendada ou saindo não sai mais; a checagem
  na Unipile antes de cada mensagem do SDR também procura mensagem da conta
  que o webhook não trouxe.
- Aceite: o dono escreve no LinkedIn enquanto o SDR rascunha, com a resposta
  agendada ou com ela já saindo, e nada sai; depois da sequência sem
  resposta, a pessoa responde e o SDR não volta; a nota do convite que chega
  depois do aceite não tira o SDR.

**SDR-62 · Busca pela conversa**
- Pedido: adicionar os filtros da busca de leads conversando, em vez de
  procurar região e setor um por um.
- Na aba Leads, uma caixa "Diga quem você quer achar" em cima dos filtros
  (§4.11). Cada mensagem volta com a resposta, o que entrou e saiu da busca,
  e as perguntas de região ou setor com mais de uma opção, em botões.
- Aceite: "diretores de e-commerce no Brasil, só varejo" preenche cargos,
  região e setor; "São Paulo" pergunta qual; "tira o setor" tira só o setor;
  o que já estava na busca não consulta o LinkedIn de novo; "só nas
  administradoras" usa a lista de mesmo nome, e lista que não existe avisa;
  "cria uma lista com A, B e C" cria a lista, põe na busca e procura as
  empresas; nada é salvo nem buscado sem o clique da pessoa; sem cargo no
  pedido, os cargos ficam; IA fora do ar não mexe nos filtros.

**SDR-63 · Sugestão de públicos que não quebra**
- Pedido: na abordagem, "Não consegui sugerir públicos: a IA não respondeu".
- Um público com texto longo demais sai sozinho, e os outros ficam; cargos e
  setores a mais ficam nos primeiros. Resposta fora do formato diz isso, e
  não que a IA não respondeu.
- Aceite: resposta com um campo longo num público traz os outros; 12 cargos
  viram os 10 primeiros.

**SDR-64 · Mensagem que dá para responder**
- Pedido: "Oi Marina, tudo bem? Toda vez que vejo uma AGC sendo montada no
  meio de planilha, e-mail e videochamada separados, penso em quanto tempo
  isso consome do administrador." Ninguém fala assim, e não tem o que
  responder.
- A primeira mensagem depois do aceite (abertura do SDR e DM 1 da
  abordagem) termina com uma pergunta curta sobre a realidade do lead, que
  ele responde em poucas palavras. Frase de efeito e reflexão em primeira
  pessoa viram regra da casa (§4.3).
- Aceite: o prompt da primeira mensagem exige a pergunta mesmo com um SDR
  antigo cuja abertura não fala nela; a regra aparece entre as regras da casa
  e o ajuste do SDR não a desliga.

**SDR-65 · O que a tela mostra enquanto o Kakou trabalha**
- Pedido: o aviso de que o site está sendo analisado podia ser melhor.
- Na Análise (§2.1, passo 2), as etapas em lista: abrindo o site, lendo as
  páginas (quantas de até quantas), entendendo o negócio e o produto,
  montando o mercado, pronto. A atual em destaque, as feitas com check, as
  próximas apagadas. Cada página aberta com título, caminho e um trecho do
  texto. Há quanto tempo começou; depois de 2 minutos, o aviso de que site
  grande demora e dá para fechar a aba.
- Na Abordagem, enquanto gera: escolhendo públicos, escrevendo o convite e as
  mensagens, revisando as regras.
- Sem percentual nem tempo restante: só o que o servidor sabe.
- Aceite: sem página aberta, "Abrindo o site" é a atual; com páginas, a tela
  conta quantas de até quantas e mostra cada uma; quando a IA passa ao
  Mercado, Negócio e Produto ficam feitos; leitura de mais de 2 minutos mostra
  o aviso; leitura antiga, sem o teto gravado, conta só as lidas.

### Marco D · Módulos, contatos e disparos

Pedido do Arthur em 15/10/2026: disparador pela Meta, disparador de
Telegram, tags, segmentação de leads, módulos para cobrar só o que a
organização usa, e os nomes (`docs/naming.md`).

| Onda | Ticket | Depende de |
|---|---|---|
| 7 | SDR-69 Módulos e plano | — |
| 7 | SDR-70 Contatos e tags | — |
| 8 | SDR-71 Segmentos | 70 |
| 9 | SDR-72 Disparos no WhatsApp | 69, 71 |
| 10 | SDR-73 Disparos no Telegram | 72 |

**SDR-69 · Módulos e plano**
- Tabela `modulos_da_organizacao` e o catálogo dos módulos no domínio (§4.14).
  Migration liga o SDR no LinkedIn em toda organização que existe e os três
  na da GuessLess; organização nova nasce com o SDR no LinkedIn.
- O menu, as abas de Configurações e as rotas seguem os módulos; ação do
  servidor de módulo desligado recusa; o portão do primeiro acesso vale só
  com o SDR no LinkedIn.
- Tela **Plataforma** (`/platform`), só para `PLATAFORMA_ADMINS`: as
  organizações, os módulos de cada uma, ligar e desligar com motivo.
  Desligar o SDR no LinkedIn pausa as contas ativas.
- Configurações > Plano: módulos, contratados, uso do mês e "Quero
  contratar".
- Aceite: organização sem o módulo não vê a tela no menu e a rota abre o
  Plano; a ação do servidor recusa mesmo chamada direto; desligar o LinkedIn
  pausa as contas e religar não despausa; organização só com WhatsApp entra
  no app sem o primeiro acesso; quem não está em `PLATAFORMA_ADMINS` não abre
  a Plataforma; toda mudança de módulo fica na trilha.

**SDR-70 · Contatos e tags**
- Tabelas `contatos`, `tags` e `contato_tags` (§6). Toda pessoa do LinkedIn
  vira contato da organização dela (as que já existem, na migration; as
  novas, ao entrar), e o opt-out do LinkedIn vira "não contatar mais".
- Tela Contatos (§4.15): lista, busca, filtros, contato, selecionar e pôr ou
  tirar tags em massa (selecionados ou todos do filtro), "Não contatar mais".
- Importar CSV ou texto colado, com telefone no formato internacional, tags e
  a marca de autorização do WhatsApp.
- Tags (§4.16): criar, renomear, cor, apagar com a contagem; no painel do lead
  no Chats; nos cards e no filtro do Pipeline.
- Aceite: pessoa nova do LinkedIn vira contato uma vez só; telefone igual não
  duplica e completa só o vazio; telefone inválido volta com o motivo;
  autorização do WhatsApp guarda quem e quando; tag com nome igual (caixa e
  acento) não duplica; apagar tag tira de todos; tag em massa vale para todos
  do filtro, não só os da tela; o opt-out do LinkedIn aparece como "não
  contatar mais"; contato de outra organização não aparece nem muda.

**SDR-71 · Segmentos**
- Tabela `segmentos` e os filtros da §4.17 no domínio, com o SQL parametrizado
  e a descrição em português.
- Tela de segmentos em Contatos: lista com a contagem de agora, editor com a
  contagem e os primeiros contatos ao vivo, salvar, renomear, apagar. Contatos
  filtra por segmento.
- Tag usada por segmento não se apaga (SDR-70 passa a conferir).
- Aceite: cada condição sozinha e juntas; "não tem nenhuma destas" com
  contato sem tag; quem não pode ser contatado nunca entra; segmento de outra
  organização não abre; contagem igual à lista; filtro com id de tag de outra
  organização não vaza contato.

**SDR-72 · Disparos no WhatsApp**
- Tabelas `canais`, `disparos`, `envios_do_disparo` e `mensagens_dos_canais`;
  cifra dos tokens com `SEGREDOS_CHAVE`.
- Configurações > WhatsApp: conectar (WABA, número, token), conferir na Meta,
  inscrever o app, mostrar qualidade, limite e templates aprovados;
  desconectar.
- Tela Disparos: novo disparo (canal, segmento, template, variáveis, nome),
  conferência (quem recebe, quem fica de fora e por quê, prévia de três,
  estimativa de custo), disparar agora ou agendar; pausar, retomar, cancelar;
  resultado com falhas e respostas; tentar de novo as falhas.
- A fila (§4.18): `/api/cron/disparos` a cada minuto (snippet do pg_cron) e
  logo depois da confirmação; reserva por prazo, conferência na hora, ritmo,
  janela, intervalo entre disparos, classificação dos erros da Meta, pausa
  por problema da conta.
- Webhook `/api/webhooks/whatsapp/[canal]`: verificação, assinatura com o segredo do app do cliente, status
  (enviada, entregue, lida, falhou), mensagens recebidas (contato novo,
  resposta, sair do WhatsApp).
- Aceite: nada sai sem confirmação; lista congelada na confirmação; quem saiu
  depois da confirmação é pulado; envio interrompido não se repete sozinho;
  número sem WhatsApp falha sem nova tentativa; token inválido pausa o
  disparo; webhook sem assinatura é recusado; status repetido não volta
  estado (lida não vira entregue); "SAIR" tira do WhatsApp; fora da janela não
  sai; módulo desligado pausa; dois contatos com o mesmo telefone não
  existem.

**SDR-73 · Disparos no Telegram**
- Configurações > Telegram: conectar o bot (token, `getMe`, `setWebhook` com
  segredo), boas-vindas, link de entrada e links com tag; desconectar.
- Webhook `/api/webhooks/telegram/[canal]`: /start com e sem código (contato
  novo ou de volta, tag do link, boas-vindas), /sair e as palavras de saída,
  bloqueio do bot, mensagens como resposta.
- O disparo da SDR-72 ganha o Telegram: texto com `{{first_name}}` e
  `{{company}}`, botão com link, prévia; a fila no ritmo do Telegram, com o
  `retry_after`.
- Aceite: /start com código põe a tag; /start de quem saiu volta; /sair
  confirma e tira; bot bloqueado vira falha definitiva e tira do Telegram;
  segredo errado no webhook é recusado; 429 espera o `retry_after`; texto com
  variável sem valor fica de fora com o motivo.

## 10 · Decisões abertas

| # | Decisão | Sugestão | Dono |
|---|---|---|---|
| D1 | Que conta do LinkedIn é a conta da casa | ✅ decidido em 10/10: a do Arthur, só para busca; nenhuma campanha roda nela | Arthur |
| D2 | Tamanho da prévia por organização | 25 pessoas | Arthur |
| D3 | Rampa e teto de uma conta nova | 8 · 12 · 15 convites/dia, 75/semana, 15 · 20 · 25 mensagens/dia | Arthur |
| D4 | O que faz o SDR chamar você, além do que a pessoa configurar | preço, reclamação, pedido fora do comum, confiança abaixo de 0,7. Desde o SDR-60, o 0,7 é o "equilibrado" e a pessoa escolhe 0,8 ou 0,6 | Arthur |
| D5 | Quando abrir o cadastro além de `guessless.com.br` | depois de cobrança e termos | Arthur |

Continuam decididas, do épico anterior: teto de busca de 100 resultados por
dia por perfil (D8), nota de corte 70 (D9), opt-out por organização (D10) e
cooldown de empresa de 30 dias (D4).

Do Marco D (a numeração segue do D11 para não confundir com as do épico
anterior):

| # | Decisão | Sugestão | Dono |
|---|---|---|---|
| D11 | Preço de cada módulo | ver `docs/naming.md` §4: SDR no LinkedIn por conta vinculada; WhatsApp e Telegram por mês, sem preço por mensagem (a Meta cobra direto a organização) | Arthur |
| D12 | O que é base e o que é módulo | contatos, tags e segmentos na base: os disparos dependem deles e eles organizam os leads do LinkedIn. Se virar módulo, o catálogo já aceita | Arthur |
| D13 | Nome dos módulos e do plano completo | ver `docs/naming.md` | Arthur |
| D14 | Sair de um canal ou de tudo | o pedido vale para o canal em que foi feito; o opt-out do LinkedIn e o "Não contatar mais" valem para todos | Arthur |
| D15 | Conectar o WhatsApp do cliente | agora, à mão, com o app do próprio cliente (WABA, número, token e segredo do app): não precisa de App Review da GuessLess; o Embedded Signup quando a GuessLess for Tech Provider da Meta (verificação do negócio e App Review) | Arthur |
| D16 | Cobrança | pela cobrança que o GL Suite já tem (Stripe, assinatura por ferramenta), com o webhook ligando o módulo no Kakou; até lá, a GuessLess liga à mão | Arthur |
| D17 | Janela e intervalo dos disparos | das 8h às 21h, horário de Brasília; 24 h entre dois disparos do mesmo canal para o mesmo contato | Arthur |

## 11 · Custos de operação

| Item | Custo/mês |
|---|---|
| Unipile | €49 até 10 contas; a conta da casa ocupa uma |
| Claude API · primeiro acesso | leitura do site, SDR, cada turno do chat de teste (classificação + rascunho) e cada ajuste. Estimativa a medir no SDR-43: menos de US$ 1 por primeiro acesso |
| Claude API · operação | ~US$ 20 a 40 por conta ativa (rascunhos), nota de aderência ~US$ 2 por conta; conversa da busca, uma chamada de Haiku por mensagem (centavos por conversa) |
| Vercel, Supabase, Resend | planos que a casa já tem |
| WhatsApp (Meta) | zero para a GuessLess: cada template entregue é cobrado pela Meta na conta do WhatsApp Business da organização (preços na [pesquisa](pesquisa/whatsapp-cloud-api.md)) |
| Telegram | zero: a Bot API é gratuita |
| Cron dos disparos | uma chamada por minuto (~43 mil por mês) na Vercel, a maioria sem trabalho |

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
