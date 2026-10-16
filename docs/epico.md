# Épico · Kakou, o SDR de LinkedIn que nasce do seu site

10/10/2026 · uso interno · dono: Arthur · módulos, contatos e disparos em
16/10/2026 (Marco D) · lançamentos, Instagram, Facebook e comunidades em
16/10/2026 (Marco E) · multi-marca em 16/10/2026 (Marco F)

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

Desde o Marco E, o Kakou também roda **lançamentos** (§4.21): os grupos de
WhatsApp e de Telegram da organização, o link que enche um grupo e passa para
o próximo, a agenda de mensagens para todos os grupos e quem comprou. E o SDR
deixa de ser só do LinkedIn: responde no Instagram, no Messenger e no Telegram,
e quem comenta a palavra-chave num post recebe uma DM (§4.26 a §4.28). Entram
três módulos: Instagram, Facebook e Comunidades.

Desde o Marco F, a organização tem **marcas** (§4.30). A GuessLess opera as
marcas dos clientes dela numa organização só. Cada marca tem a própria análise,
o próprio SDR, os próprios canais e bots, contatos, campanhas e lançamentos, e
o dado de uma marca não aparece na outra. A conta do LinkedIn se conecta na
marca e pode servir a mais de uma (D43).

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

Menu com até nove telas, nesta ordem. Cada uma aparece só com o módulo que a
libera (§4.14):

| Tela | Módulo | Para quê |
|---|---|---|
| **Dashboard** | base | a conta: LinkedIn conectado e saúde, quanto do teto de hoje já foi usado, os números da semana, o funil e o que precisa de você agora (§4.9); com disparos, os últimos disparos e como foram; com lançamento no ar, o cartão dele |
| **Chats** | SDR no LinkedIn, Instagram ou Facebook | réplica das DMs do LinkedIn: lista à esquerda, conversa no meio, dados do lead à direita. Você vê o SDR conversando e responde você mesmo quando quiser (§4.8). Desde o Marco E, também as DMs do Instagram e do Messenger e o privado do bot do Telegram (§4.26) |
| **Lançamentos** | Comunidades, Instagram ou Facebook | cada lançamento com os grupos, o link que enche, a agenda, as palavras-chave, o que o SDR sabe e os números; a aba Hoje é a tela do dia (§4.21 a §4.25) |
| **Comentários** | Instagram ou Facebook | as palavras-chave (comentou, recebe a DM) e todos os comentários dos posts, para responder e ocultar (§4.27) |
| **Pipeline** | SDR no LinkedIn | os leads em colunas, do convite à reunião (§4.10) |
| **Campanhas** | SDR no LinkedIn | cada campanha é um público com a sua abordagem, rodando numa conta. Aqui a pessoa monta uma campanha específica para ela (§4.11) |
| **Contatos** | base | todos com quem a organização pode falar, em qualquer canal, com tags e segmentos (§4.15 a §4.17) |
| **Disparos** | WhatsApp ou Telegram | uma mensagem para um segmento, agora ou agendada, e como ela chegou (§4.18) |
| **Configurações** | base | tudo o que o primeiro acesso definiu: empresa, SDR, LinkedIn e equipe (§4.12); WhatsApp e Telegram conectados; o plano (§4.14); desde o Marco E, o Instagram e a Página, o número dos grupos, os grupos do Telegram e a Hotmart |

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
- **Conversar pelo WhatsApp.** O WhatsApp entra para disparo (§4.18) e para os
  grupos do lançamento (§4.22 e §4.29): a resposta do contato fica guardada e
  aparece no resultado do disparo, mas o SDR não responde pelo WhatsApp (D21).
  O Telegram, desde o Marco E, tem o SDR no privado do bot (§4.26).
- **Grupos sem API.** Grupos e canal de transmissão do Instagram, grupos do
  Facebook (a Meta tirou a API em 2024) e a Comunidade do WhatsApp com o grupo
  de avisos (a Unipile não enxerga).
- **Disparo no Instagram e no Messenger** e as Marketing Messages do
  Messenger (D22).
- Criar grupo do Telegram pelo Kakou (a Bot API não cria), pedido de entrada,
  Mini App e boas-vindas por pessoa nos grupos.
- Checkout que não seja a Hotmart (Kiwify, Eduzz) e juntar o mesmo contato
  entre canais.
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
  análise, SDR, contas e leads; desde o Marco F, cada **marca** da organização
  (§4.30).
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

**O SDR** é a forma como a organização conversa com quem pode comprar: no
LinkedIn e, desde o Marco E, no Instagram, no Messenger e no Telegram (§4.26).
É gerado da análise confirmada e guardado em versões. Ele tem:

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
- **Onde o canal pede, a regra da casa muda** (§4.26). O resto vale igual em
  todo canal:

  | Regra | LinkedIn | Instagram, Messenger e Telegram |
  |---|---|---|
  | Quem abre a conversa | o SDR, depois do convite aceito | a pessoa; o SDR nunca abre |
  | Links | só o de agenda, depois de a pessoa aceitar conversar | os do lançamento e o de agenda |
  | Levar para o WhatsApp | nunca | só pelo link do lançamento |
  | De onde veio o contato | o perfil público no LinkedIn | o que a pessoa fez: comentou, mandou DM, entrou pelo bot ou pelo grupo |
  | Tamanho | 30 palavras | 30 palavras; no Instagram, também até 1.000 bytes |
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
- **Vale em todo canal** em que o SDR responde (§4.26), com uma exceção
  (D25): num lançamento com o preço informado, pergunta de preço sobre aquele
  lançamento não passa para você; o SDR responde com o que o lançamento diz.
  Os outros casos fixos continuam.

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
- **Desde o Marco E, o Chats mostra os canais** (§4.26): as DMs do Instagram
  e do Messenger e o privado do bot do Telegram, com o canal em cada conversa
  e um filtro por canal quando há mais de um. Nessas conversas, o cabeçalho
  mostra a janela de 24 horas (Instagram e Messenger) e o campo de resposta
  diz quando não dá mais para responder; o painel ao lado é o do contato
  (canal, @, como começou, lançamento, tags), não o do lead. Conversa de grupo
  não entra: fica no lançamento.

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
- **Desde o Marco E,** o Precisa de você existe com qualquer módulo e ganha os
  itens dos lançamentos e dos canais (hora de mandar, faltou mandar, grupo
  enchendo sem próximo, tarefa no celular, canal caído, o SDR chamou você no
  Instagram, no Messenger, no Telegram ou num grupo). Lançamento no ar ganha
  um cartão: fase, pessoas nos grupos e a próxima mensagem.

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
  lista salva. Com lista, a região e o cargo deixam de ser obrigatórios (a
  lista já delimita); cargos, palavras-chave, setor e região continuam
  valendo juntos quando a pessoa põe. Com lista e nenhum outro filtro, a
  busca traz **todo mundo que trabalha nas empresas da lista**; um botão
  "Todo mundo destas empresas" tira os outros filtros de uma vez. Sem lista,
  a busca precisa de pelo menos um cargo e uma região.
  Empresa ainda não procurada ou esperando escolha fica fora da busca até ser
  resolvida, e a tela diz quantas são. A busca roda por partes: as achadas em
  grupos de 10 páginas (uma página por parte quando não há cargo, para
  nenhuma parte passar do teto de resultados do LinkedIn) e uma parte para
  cada empresa sem página. Teto do dia,
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
| SDR | os campos do SDR, editáveis; "Testar no chat", que abre o chat de teste; histórico de ajustes com desfazer; quando o SDR passa a conversa para você (§4.7); modo de resposta (sozinho ou aprovo cada resposta); link de agenda; onde o SDR responde, canal por canal (§4.26) |
| LinkedIn | contas vinculadas, status, rampa, teto, janela; nome e janela editáveis (o admin ou quem vinculou a conta); pausar e retomar; reconectar; vincular outra conta; excluir a conta (o admin ou quem vinculou; não vale para a conta da casa): arquiva, preserva o histórico e solta a conta da Unipile (SDR-125) |
| Instagram e Facebook | a Página e o Instagram conectados pelo app da GuessLess, as permissões e o último aviso da Meta; conectar, trocar de Página e desconectar (§4.27 e §4.28). Com Instagram ou Facebook |
| WhatsApp | o número conectado pela API oficial da Meta, a qualidade e o limite, os templates aprovados; conectar e desconectar (§4.19). Só com o módulo. Com Comunidades, também o número dos grupos (§4.29) |
| Telegram | o bot conectado, o link de entrada e os links com tag, a mensagem de boas-vindas; conectar e desconectar (§4.20). Só com o módulo. Com Comunidades, também os grupos e canais em que o bot está (§4.23) |
| Integrações | a Hotmart: a URL do postback e o hottok (§4.25). Com Lançamentos |
| Equipe | membros, papel (admin ou operador) e as contas que cada um opera. Só o admin muda. Cada pessoa liga os avisos no Telegram (§4.24) |
| Plano | os módulos, o que cada um faz, os contratados e o uso do mês (§4.14) |

Empresa e SDR aparecem com o SDR no LinkedIn, Instagram, Facebook ou
Comunidades (§4.26); LinkedIn, só com o SDR no LinkedIn. Conectar e
desconectar canais é do admin.

Desde o Marco F, as abas se dividem em **Marca** (Marca, Empresa, SDR,
LinkedIn, Instagram e Facebook, WhatsApp, Telegram, Integrações), que valem
para a marca atual, e **Organização** (Marcas, Equipe, Plano). A Equipe ganha
as marcas de cada um (§4.30).

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
  | **SDR no Instagram** | `instagram` | conectar o Instagram (com a Página), o SDR na DM, as palavras-chave e os comentários (§4.27); Lançamentos e Comentários |
  | **SDR no Facebook** | `facebook` | conectar a Página, o SDR no Messenger, as palavras-chave e os comentários dos posts da Página (§4.28); Lançamentos e Comentários |
  | **Comunidades** | `comunidades` | Lançamentos com grupos de WhatsApp e de Telegram: o link que enche, a agenda, os membros, quem comprou e o número dos grupos (§4.21 a §4.25 e §4.29) |

- Toda organização tem a **base**, sem contratar nada: Dashboard, Contatos
  (com tags e segmentos), Equipe e Plano (D12).
- Quem liga e desliga módulo é a GuessLess, na tela **Plataforma**, que só
  abre para quem está em `PLATAFORMA_ADMINS`: e-mails inteiros ou domínios
  começando com `@`. Em produção são `@guessless.com.br` e `@guessless.ca`,
  ou seja, todo e-mail da GuessLess (SDR-126). O domínio casa exato: o e-mail
  termina em `@<domínio>` e não tem outro `@`; subdomínio e sufixo parecido
  não abrem. Variável vazia, ninguém abre. Cada mudança grava quem, quando e o
  motivo. Não há cobrança automática nesta versão (§3, D16).
- Organização nova (§4.1) nasce com o SDR no LinkedIn, como hoje; as que já
  existem também. A organização da GuessLess ganha todos.
- **Módulo desligado:** as telas dele somem do menu; a rota abre o Plano
  dizendo que o módulo não está contratado; as ações do servidor recusam; e
  nada dele roda em segundo plano. Os dados ficam guardados: religar volta
  como estava.
  - Desligar o SDR no LinkedIn pausa as contas ativas da organização, com o
    motivo e o aviso de sempre (§4.13). Religar não despausa: despausar é
    sempre manual.
  - Desligar WhatsApp ou Telegram pausa os disparos daquele canal que estão
    agendados ou saindo, com o motivo. Religar não retoma: a pessoa retoma.
  - Desligar Instagram ou Facebook para o SDR e as palavras-chave do canal.
    Desligar Comunidades pausa a agenda dos lançamentos e o número dos
    grupos, e o link dos lançamentos deixa de mandar para grupo. Religar não
    retoma.
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
- A **Plataforma** mostra também a conta da casa de cada organização (§4.4),
  com o status da Unipile e desde quando, e o botão "Reconectar a conta da
  casa" ("Vincular", se ela ainda não tem LinkedIn). O hosted auth volta para
  a Plataforma. A conta da casa não aparece em Configurações: quando ela cai,
  é a GuessLess quem reconecta.

### 4.15 · Contatos

- **Contato** é qualquer pessoa com quem a organização pode falar, em qualquer
  canal: nome, empresa, cargo, e-mail e os canais (LinkedIn, WhatsApp,
  Telegram e, desde o Marco E, Instagram e Messenger). Contato é da
  organização.
- Ele vem de quatro lugares:
  - do LinkedIn: toda pessoa que entra numa campanha vira contato, ligado ao
    lead;
  - da importação de planilha;
  - de quem entra pelo bot do Telegram (§4.20);
  - de quem escreve primeiro para o WhatsApp da organização (§4.19);
  - desde o Marco E: de quem manda DM ou comenta no Instagram e no Messenger
    (§4.27 e §4.28), de quem entra num grupo do Telegram (§4.23) ou, com o
    número dos grupos, do WhatsApp (§4.29), da página de espera do
    lançamento (§4.22) e de quem compra (§4.25).
- Um contato por telefone e um por conta do Telegram, por organização.
- **A identidade no Instagram, no Messenger e nos grupos fica na conversa e
  no grupo, não no contato:** o id da pessoa no Instagram e no Messenger vale
  só para aquela conta. Juntar o mesmo contato entre canais fica para depois.
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
  - origem: LinkedIn, importação, Telegram, WhatsApp e as do Marco E
    (Instagram, Facebook, grupo do Telegram, grupo do WhatsApp, página de
    espera, checkout);
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
- Disparo é sempre de um para um. Mensagem em grupo é da agenda do
  lançamento (§4.24), com regras próprias. Instagram e Messenger não têm
  disparo (D22).
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
- **Desde o Marco E,** o mesmo bot entra nos grupos dos lançamentos (§4.23) e,
  com o SDR ligado, responde no privado (§4.26). O webhook passa a pedir os
  avisos de grupo, e os bots já conectados são atualizados sozinhos.

### 4.21 · Lançamentos

- Lançamento é da organização: nome, produto, as datas (a captação começa,
  as aulas com nome, data e link, o carrinho abre, o carrinho fecha), o link
  do carrinho, o preço e as condições, as perguntas frequentes, o que mais o
  SDR precisa saber (até 2.000 caracteres) e as regras dos grupos. Nasce com a
  tag do lançamento; nome igual ao de uma tag que já existe (sem diferença de
  caixa ou acento) reaproveita a tag.
- Debaixo dele ficam os grupos e o link que enche (§4.22 e §4.23), a agenda
  (§4.24), quem comprou (§4.25), as palavras-chave (§4.27) e o que o SDR
  sabe (§4.26).
- **Montando, no ar, encerrado.** O lançamento nasce montando: o link ainda
  não manda ninguém para grupo. "Pôr no ar" mostra a conferência (grupos
  prontos, itens da agenda e quem manda cada um, palavras-chave, preço e
  perguntas do SDR), exige pelo menos um grupo pronto e grava quem e quando.
- **A fase vem das datas:** captação até a primeira aula, aulas até o carrinho
  abrir, carrinho até fechar, encerrado depois. Sem datas, não há fase. Aula
  fora de ordem, ou carrinho que fecha antes de abrir, não salva.
- **Pausar o lançamento** pausa a agenda inteira (o que está agendado e o que
  está saindo). O link continua mandando para os grupos: parar o link no meio
  de um anúncio perde gente. Retomar é manual.
- **Encerrar** (à mão, ou sozinho 7 dias depois de o carrinho fechar): o link
  mostra "inscrições encerradas" ou leva para o endereço de saída do
  lançamento; a agenda pendente é cancelada, e a tela diz quantos itens antes
  de confirmar; o SDR deixa de usar o contexto do lançamento. Os dados ficam.
- A tela **Lançamentos** aparece com Comunidades, Instagram ou Facebook
  (§4.14). Dentro do lançamento, as abas seguem o módulo: Hoje e SDR sempre;
  Grupos, Link e Agenda com Comunidades; Palavras-chave com Instagram ou
  Facebook.
- **Hoje** é a tela do dia e funciona no celular: a régua das fases com o
  "agora"; o que precisa de você (hora de mandar, faltou mandar, grupo
  enchendo sem próximo, tudo lotou, tarefa no celular, o SDR passou para você,
  falha da agenda, canal caído); as próximas mensagens; e os números (cliques,
  entradas, saídas, DMs, comentários e compras, também por origem).

### 4.22 · Grupos e o link que enche

- **Grupo do WhatsApp:** entra colando o nome e o link de convite
  (`https://chat.whatsapp.com/...`), um por linha. Convite repetido no
  lançamento entra uma vez. Com o número dos grupos conectado, também pelos
  grupos do número (§4.29). **Grupo do Telegram:** entra pelo bot (§4.23).
- Cada grupo tem ordem e limite (padrão em `grupos.limite_padrao`: 900 cliques
  no WhatsApp colado, 10.000 membros no Telegram) e um destes estados, sempre
  com texto e nunca só cor: não pronto, na fila, recebendo, cheio, fora.
- **Tarefas no celular (WhatsApp).** O que a API não faz vira tarefa do grupo,
  marcada por quem fez (grava quem e quando):
  - só admins editam e adicionam (obrigatória);
  - só admins enviam (obrigatória quando os grupos do lançamento são
    fechados);
  - um admin humano da equipe (obrigatória com o número dos grupos,
    recomendada sem ele): se o número cair, essa pessoa segura o grupo;
  - descrição, foto e regras (opcional, com o texto e a foto para copiar).

  Grupo com tarefa obrigatória aberta fica **não pronto** e fora do rodízio.
- **O link.** Um link fixo por canal do lançamento (`/go/<código>`), com QR
  code. Cada clique vai para o grupo da vez: o primeiro, na ordem, que está
  pronto e não está cheio.
- **Quando o grupo enche:** no WhatsApp colado, pelos cliques; no Telegram e no
  WhatsApp com número, pelos membros de verdade. Grupo cheio sai do rodízio;
  aumentar o limite devolve. No WhatsApp colado, "Corrigir a contagem" troca
  os cliques pelo número de pessoas que a pessoa vê no celular.
- **O que conta como clique:** só navegador. Robô de prévia
  (facebookexternalhit, WhatsApp, TelegramBot e afins) e `HEAD` não contam. A
  mesma pessoa (cookie de 30 dias) volta para o mesmo grupo e não conta de
  novo. O clique nunca espera serviço de fora.
- **Origem.** O clique guarda `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_content` e `o`. Links por origem (`/go/<código>?o=stories`) se criam com
  nome. A tela mostra cliques por grupo e por origem, e entradas quando dá para
  contar.
- **Grupo quase cheio:** o último grupo com vaga passa de 80% do limite
  (editável no lançamento) e avisa quem opera (e-mail e Dashboard), uma vez por
  grupo.
- **Tudo cheio:** a página de espera (padrão) ou o endereço que o lançamento
  disser. Na espera, a pessoa deixa nome e WhatsApp ou e-mail e vira contato
  (origem página de espera, tag do lançamento). A autorização do WhatsApp
  (§4.15) só vale com a caixa marcada pela própria pessoa, desmarcada por
  padrão.
- Lançamento montando: o link diz quando abre. Encerrado: "inscrições
  encerradas" ou o endereço de saída.
- **Pixel (opcional):** com o id do Pixel da Meta no lançamento, o clique passa
  por uma página que dispara o Pixel e segue para o mesmo grupo que o link
  daria, com um botão para quem não for levado.

### 4.23 · Grupos do Telegram

- A pessoa cria o grupo no app do Telegram (o bot não cria) e põe o bot pelo
  link "Pôr o bot num grupo" do lançamento, que já pede os direitos de admin.
  O grupo cai no lançamento do link. Sem código, o grupo aparece para a pessoa
  escolher o lançamento; com código de outra organização, o bot sai.
- **Direitos do bot:** mudar informações, apagar mensagens, banir, convidar
  por link e fixar. Faltando algum, a tela diz qual e o que deixa de
  funcionar. Sem ser admin, o grupo fica não pronto: fora do rodízio e da
  agenda. Bot removido: o grupo fica fora, com quando foi.
- O bot cria o convite de cada grupo (e um por origem, §4.22) e aplica no
  grupo o nome, a descrição e as regras fixadas do lançamento. Regras fixadas
  sem notificar todo mundo; não há boas-vindas por pessoa.
- **Quem entra vira contato,** sem telefone: id, nome, @, a tag do lançamento
  e, se entrou por um convite de origem, a tag da origem. Quem sai fica
  registrado; a tag fica.
- **Estar no grupo não é ter dado /start:** membro de grupo só recebe disparo
  no privado depois do /start (§4.20).
- O grupo é aberto: entra quem tem o link. Pedido de entrada fica para depois.
- **O que se guarda (D27):** entradas e saídas. O texto do grupo não é
  guardado, a não ser o que chama o SDR (§4.26), por 90 dias, e nunca serve
  para treino.

### 4.24 · Agenda do lançamento

- Item da agenda: **mensagem** (até 4.096 caracteres, com imagem, vídeo, áudio
  ou PDF opcional; no Telegram, também um botão com link e "fixar"),
  **fechar os grupos** ou **abrir os grupos**. Vai para todos os grupos, só os
  de WhatsApp ou só os do Telegram, numa data e hora. O título do item é só da
  equipe.
- Ao pôr as datas, o Kakou sugere a agenda em rascunho (véspera e hora de cada
  aula, carrinho abre, último dia, faltam 2 horas, encerrado), sem texto.
  Rascunho não sai.
- **Quem recebe:** os grupos prontos do lançamento **na hora do envio**. Grupo
  que ficou pronto depois de agendar também recebe; não pronto e fora, não.
- **Nada sai sem "Agendar",** que grava quem e quando. Antes de começar, o item
  se edita e se cancela; depois, pausa, retoma ou cancela. Cancelar não desfaz
  o que já saiu.
- **Janela (D23):** das 7h à meia-noite, horário de Brasília
  (`agenda.janela`). Fora disso, é recusado com o horário em que daria.
- **Nunca duas vezes:** uma vez por grupo por item. Envio que caiu sem resposta
  do canal vira "pode ter chegado" e só volta pela mão da pessoa.
- **Telegram:** sai sozinho pelo bot, até 20 por minuto por grupo, esperando o
  `retry_after`. Fechar é tirar de todos a permissão de mandar mensagem; abrir
  devolve exatamente o que o grupo tinha.
- **WhatsApp sem número: feito por você.** Antes da hora (padrão 10 minutos) e
  na hora, o Kakou avisa quem opera (e-mail, Dashboard e o bot do Telegram da
  organização para quem ligou os avisos, D26) com o texto e o arquivo prontos
  e a lista dos grupos, cada um com "Abrir no WhatsApp" e "Mandei". "Mandei"
  grava quem e quando. Grupo sem marca em 2 horas vira "não confirmado", e
  "Faltou mandar em N grupos" fica no Precisa de você. Fechar e abrir grupo de
  WhatsApp é sempre feito por você.
- **WhatsApp com número (§4.29):** sai sozinho, de 10 a 20 s aleatórios entre
  um grupo e outro. Grupo em que o número não é admin continua feito por você.
- **Resultado** por item e por grupo: na fila, saindo, mandada, esperando você,
  mandada por você, não confirmada, falhou (com o motivo), pulada. "Tentar de
  novo as falhas" põe de volta só as que podem dar certo agora.
- Kill switch: `agenda.ativa`.

### 4.25 · Quem comprou

- A Hotmart (D24) conecta em Configurações > Integrações, só o admin: a tela
  mostra a URL para colar no postback da Hotmart e guarda o hottok cifrado.
  Cada lançamento diz quais produtos da Hotmart são dele.
- **Compra aprovada:** o contato é achado pelo e-mail (sem diferença de caixa)
  ou pelo telefone (formato internacional); sem contato, nasce um, com origem
  checkout. O contato ganha a tag "Comprou: <lançamento>".
- **Reembolso, chargeback ou cancelamento** tiram a tag. A mesma transação
  nunca conta duas vezes. Produto sem lançamento só fica registrado.
- Segmentos e disparos tiram o comprador pela tag (§4.17), sem regra nova. O
  contato mostra as compras; o lançamento, quantas e quanto.
- **"Tirar quem comprou dos grupos"**, ligado por lançamento: o bot tira o
  comprador dos grupos do Telegram sem banir (ele pode voltar por convite). No
  WhatsApp, fica com você.

### 4.26 · O SDR fora do LinkedIn

- **O SDR é da organização, não do LinkedIn.** O mesmo SDR (§4.3) responde no
  privado do bot do Telegram, na DM do Instagram, no Messenger e, quando
  chamado, nos grupos do Telegram, com as regras da casa do canal (§4.3).
  Organização sem o SDR no LinkedIn monta o SDR em Configurações > Empresa e
  SDR: lê o site, confirma a análise e testa no chat (§4.2 e §4.3), sem o
  primeiro acesso do LinkedIn.
- **Onde o SDR responde** (Configurações > SDR, só o admin): em cada canal,
  sozinho, aprovo cada resposta ou não responde (padrão); nos grupos do
  Telegram, quando chamado ou não responde (padrão), e cada grupo pode
  desligar. Organização sem SDR: ninguém responde sozinho, e a conversa fica
  com você. Kill switches: `sdr_nos_canais.ativo` e `sdr_nos_grupos.ativo`.
- **Uma conversa por pessoa em cada canal.** No Instagram e no Messenger, o SDR
  só responde até 24 horas depois da última mensagem da pessoa; você, até 7
  dias, com a feature Human Agent aprovada pela Meta (sem ela, também 24
  horas). Depois, ninguém responde até a pessoa escrever de novo, e a tela diz
  por quê.
- **O SDR passa a conversa para você** nos casos de sempre (§4.7), com o aviso
  de sempre. Texto barrado pelo validador também passa, com a sugestão no
  campo de resposta.
- **Você assume quando responde,** pelo Chats ou pelo app do canal (o Kakou vê
  o eco do que saiu fora dele). "Devolver ao SDR" põe ele de volta.
- **Pedido para parar** tira a pessoa daquele canal (D14): o SDR e as
  palavras-chave não mandam mais nada por ele.
- **Com lançamento, o SDR sabe dele:** a fase, as próximas aulas, o carrinho, o
  preço, as perguntas frequentes e o que mais o lançamento diz. O lançamento
  da conversa vem da palavra-chave que a abriu, do link que a pessoa usou ou,
  sem pista, do único lançamento no ar da organização. Com o preço no
  lançamento, o SDR responde preço daquele lançamento sem passar para você
  (D25). Ele só manda os links do lançamento e o de agenda.
- **No grupo do Telegram:** responde só quando chamado (menção, resposta ao bot
  ou comando), curto, citando a mensagem, no mesmo tópico, no máximo uma
  resposta a cada 30 s por grupo. Assunto pessoal vai para o privado do bot,
  com um botão. O que ele passou para você no grupo aparece no lançamento
  (Menções) e no Precisa de você; conversa de grupo não entra no Chats.
- O número dos grupos do WhatsApp (§4.29) nunca responde de um para um, e o
  SDR não fala nos grupos do WhatsApp (D21).

### 4.27 · Instagram

- **Conectar** (Configurações > Instagram e Facebook, só o admin), pelo app da
  GuessLess na Meta com o login do Facebook (D28): a pessoa escolhe a Página, e
  o Instagram profissional ligado a ela vem junto. Um Instagram por
  organização, e um Instagram numa organização só. Instagram sem Página ligada
  não conecta, e a tela explica como ligar. O token fica cifrado.
- **DM:** quem manda DM vira contato (origem Instagram, com @ e nome), e a
  conversa aparece no Chats (§4.8). Mensagem que a pessoa apagou some do
  Kakou. Texto do Instagram tem até 1.000 bytes (acento conta 2): resposta
  maior sai em duas mensagens.
- **Palavras-chave** (tela Comentários e aba do lançamento): quem comenta a
  palavra num post recebe uma DM.
  - A palavra casa inteira, sem diferença de caixa ou acento ("quero" casa com
    "QUERO!!", não com "querosene"); a automação diz se o comentário pode ter
    mais texto ou tem de ser só a palavra.
  - Vale em todos os posts, num post ou no próximo post, até uma data.
  - A DM tem o texto, um link (o do lançamento, sugerido) e um botão quando a
    Meta aceitar; põe a tag da automação e a do lançamento.
  - Uma DM por comentário (regra da Meta) e uma por pessoa em cada automação.
    Até 7 dias depois do comentário e até 600 por hora por conta
    (`instagram.dms_por_hora`); o resto espera na fila. Comentário da própria
    conta não conta.
  - Resposta pública opcional, alternando até 3 versões, só se a DM saiu. Se a
    DM não chegar (a pessoa não recebe mensagens da conta, comentário que não
    aceita resposta), uma resposta pública de reserva, se ligada.
  - A mesma palavra mandada na DM recebe o texto da automação antes do SDR,
    uma vez por pessoa.
  - Nada sai antes de "Ligar". Pausar para na hora. Erro da conta pausa todas
    as automações do canal e avisa.
- **Todos os comentários** (tela Comentários): por post, com os filtros sem
  resposta, com palavra-chave e todos. Responder em público, mandar no direct
  (até 7 dias e se ainda não recebeu) e ocultar. O SDR não responde comentário
  sozinho.
- Sem disparo (D22). A exclusão de dados pedida pela Meta apaga a pessoa do
  canal. Desconectar apaga o token e para o SDR e as automações do canal.

### 4.28 · Facebook

- A Página conecta junto com o Instagram, no mesmo login (§4.27). Com só o
  módulo Facebook, só a Página conecta.
- **Messenger:** como a DM do Instagram (§4.26 e §4.27). O SDR responde em até
  30 s, sem o atraso do LinkedIn. Sem a feature de perfil aprovada pela Meta, a
  pessoa aparece como "Pessoa do Messenger".
- **Comentário em post da Página** entra nas mesmas palavras-chave e em Todos
  os comentários.
- Grupos do Facebook ficam fora: a Meta não tem mais API para eles.

### 4.29 · WhatsApp pelo número dos grupos

Só existe se o teste de conexão passar (T-11). O lançamento funciona sem ele.

- **Conectar** (Configurações > WhatsApp > Número dos grupos, com Comunidades,
  só o admin) pela Unipile, por QR code ou código de pareamento, depois de
  marcar o aviso do risco: a conexão não é a oficial da Meta, o WhatsApp pode
  restringir ou banir o número, e o número não pode ser o principal da empresa
  nem o da API oficial (§4.19). Um número por organização. Se o WhatsApp pedir
  passkey e não conectar, a tela diz isso e o lançamento segue sem número.
- **Aquecimento:** nada sai pelo número antes de 24 horas depois de conectar ou
  reconectar.
- **Grupos:** o número casa os grupos colados pelo convite e lista os grupos em
  que está. Grupo em que o número não é admin continua feito por você.
- **Membros:** contados de verdade (entradas e saídas). Quem está no grupo vira
  contato: com telefone quando ele vem, só com o id quando não vem, e a tag do
  lançamento. Mensagem comum do grupo não é guardada.
- **O que o número nunca faz:** responder de um para um, falar no grupo fora da
  agenda e ter o SDR.
- **Conta fora do ar** (desconectou, restringida, banida): tudo o que sai pelo
  número pausa, os lançamentos voltam ao feito por você e à contagem por
  clique, e quem opera é avisado. "Pausar o número" para tudo. Kill switch:
  `comunidades.numero_ativo`.

### 4.30 · Marcas

O primeiro caso é a GuessLess operando as marcas dos clientes dela: donos de
dados diferentes dentro de uma organização só (D42). Por isso a marca é a
fronteira dos dados, e a organização só agrupa a equipe e o plano.

- **O que é da marca:** a análise do site, o SDR (com versões e o chat de
  teste), os públicos, a prévia, a abordagem, as listas de empresas, as
  campanhas, os leads e as conversas, os contatos, as tags, os segmentos, os
  canais (WhatsApp, bot do Telegram, Instagram e Página, número dos grupos),
  os disparos, os lançamentos, o checkout e as palavras-chave. Os uniques de
  hoje passam a valer por marca: um SDR, um WhatsApp e um bot por marca.
- **O que é da organização:** a equipe e o papel (admin ou operador), os
  módulos e o plano, a conta da casa. Os módulos contratados valem para todas
  as marcas.
- **Acesso por marca** (D30). O admin vê todas as marcas. O operador vê só as
  que o admin deu a ele, na Equipe. Quem não tem acesso a uma marca não vê
  nada dela, nem pelo link de um aviso.
- **A marca atual.** O operador trabalha numa marca por vez, escolhida no
  seletor no topo da barra lateral (no celular, na barra de cima). A troca vale
  para o app inteiro e fica guardada. Com uma marca só, o seletor mostra o nome
  e não abre: nada muda para quem tem uma marca. O link de um aviso abre na
  marca do aviso.
- **A conta do LinkedIn se conecta na marca** (Configurações › Marca ›
  LinkedIn) e pode estar em mais de uma marca. Vincular de novo uma conta que
  já está noutra marca da organização não cria outro perfil: liga o mesmo
  perfil à marca ("Usar uma conta já conectada"). O mesmo LinkedIn nunca vira
  dois perfis.
  - A campanha é de uma marca e roda num perfil ligado a ela. O SDR que
    responde é o da marca da campanha.
  - O teto continua do perfil, somando as campanhas de todas as marcas
    (§4.13).
  - Conversa fora de campanha: num perfil de uma marca só, é dessa marca; num
    perfil de várias, fica sem marca, aparece para quem opera o perfil e só
    humano responde (D35).
  - Desligar a conta de uma marca pausa as campanhas daquela marca naquele
    perfil, com o motivo. Religar não retoma (D36).
- **Entre marcas** (D31 a D34):
  - o opt-out do LinkedIn continua valendo para o Kakou inteiro; a outra marca
    só vê "fora da busca", sem motivo nem origem;
  - o "Não contatar mais" é da marca, porque o contato é da marca;
  - um alvo, um dono continua global: uma régua ativa por pessoa. A outra
    marca vê "em contato por outra campanha", sem nome nem marca;
  - o cooldown de empresa vale também entre marcas no mesmo perfil.
- **Campanha sem SDR não ativa** (D37): numa conta compartilhada, a voz do
  perfil não é de cliente nenhum.
- **Criar marca** (só admin, D38): pelo seletor ("+ Nova marca") ou em
  Configurações › Organização › Marcas. São três passos na moldura do primeiro
  acesso: **Marca** (nome, cor da paleta das tags e site opcional), **Análise**
  e **SDR**. A marca nasce no primeiro passo; quem fecha no meio vê a marca
  como "Configurando" e volta de onde parou. A análise se pula ("Pular por
  agora"). LinkedIn, canais e a primeira campanha vêm depois, em
  Configurações › Marca. A prévia pela conta da casa não roda para a marca
  nova. O primeiro acesso da organização (§2.1) continua igual e cria a marca
  1. Limite: `marcas.max_por_organizacao` (padrão 20).
- **Pausar e arquivar** (só admin). A marca pausada para tudo o que sai por
  ela (convites, o SDR, disparos, a agenda dos lançamentos); retomar não religa
  nada sozinho. Só se arquiva marca pausada: ela sai do seletor, fica só
  leitura e se restaura. Não existe excluir.
- **Configurações** se dividem em **Marca** (Marca, Empresa, SDR, LinkedIn,
  Instagram e Facebook, WhatsApp, Telegram, Integrações) e **Organização**
  (Marcas, Equipe, Plano).
- **Identidade:** o selo é a inicial sobre a cor da marca, sempre com o nome
  escrito ao lado.
- **Organização que já existe** vira uma marca só, com o nome dela e tudo o
  que tem. Todo operador ganha acesso a ela.
- Kill switch: `marcas.criar` (criar marca nova; desligado até as tabelas
  estarem todas por marca, SDR-115).

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

 Marco E: lançamentos, Instagram, Facebook e comunidades
 visitante ──► /go/<código> ──► grupo da vez (convite do WhatsApp · do Telegram)
 ┌──────────────────┐ cron 1 min ┌──────────────────────────────────────┐
 │ Agenda           ├───────────►│ Bot do Telegram ──► grupos            │
 │ envios_aos_grupos│            │ Unipile (número) ──► grupos WhatsApp  │
 └──────────────────┘            │ feito por você ──► aviso a quem opera │
                                 └──────────────────────────────────────┘
 Meta (app da GuessLess) ──webhook──► DM e comentário ──► SDR · palavras-chave
 Hotmart ──postback──► compras ──► tag "Comprou"
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
| Instagram e Messenger | API da Meta pelo app da GuessLess (Facebook Login for Business, D28), um webhook para todas as organizações em `/api/webhooks/meta`, assinado com o segredo do app e roteado pela conta de cada evento ([pesquisa](pesquisa/instagram-messenger-api.md)) |
| Grupos de WhatsApp | colados, com o link girando pelo clique; com o número dos grupos, pela Unipile como WhatsApp Web ([pesquisa](pesquisa/whatsapp-grupos.md)) |
| Grupos do Telegram | o bot da organização como admin, no mesmo webhook do SDR-73 ([pesquisa](pesquisa/telegram-grupos.md)) |
| Link do lançamento | rota pública `/go/<código>`: uma transação curta, sem serviço de fora no caminho do clique |
| Agenda | `envios_aos_grupos` como fila, com o desenho da fila dos disparos, no mesmo cron de 1 minuto |
| Compras | postback da Hotmart em `/api/webhooks/hotmart/<checkout>`, conferido pelo hottok |
| Mídia da agenda | Supabase Storage, bucket privado, upload direto do navegador por URL assinada |
| Mercado | o que as ferramentas de lançamento e o ManyChat fazem: [pesquisa](pesquisa/lancamentos-e-manychat.md) |

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

Entra no Marco E (nomes conferidos contra os SQL de todos os repositórios do
GL Suite; as migrations mantêm a guarda de nome do Marco D):

```text
modulos_da_organizacao.modulo  + 'instagram' | 'facebook' | 'comunidades'          -- §4.14
canais.tipo                    + 'instagram' | 'facebook' | 'whatsapp_app'        -- whatsapp_app: o número dos grupos (§4.29)
canais                         + sdr_modo                                          -- 'nao_responde' | 'sozinho' | 'aprovacao' (§4.26)
contatos.origem                + 'instagram' | 'facebook' | 'grupo_telegram' | 'grupo_whatsapp'
                                 | 'pagina_de_espera' | 'checkout'
operadores                     + telegram_id, telegram_avisos_em                  -- avisos da equipe no bot (§4.24)
lancamentos (                                                                     -- §4.21
  id, organizacao_id, nome, produto, tag_id,
  captacao_em, aulas jsonb,                        -- [{nome, quando, link}]
  carrinho_abre_em, carrinho_fecha_em, link_do_carrinho,
  preco, perguntas jsonb, sdr_sabe,                -- o que o SDR sabe (§4.26)
  regras, nome_dos_grupos, descricao_dos_grupos,   -- aparência dos grupos
  grupos_fechados, aviso_cheio_pct, destino_encerrado, pixel_id,
  produtos jsonb, tag_comprador_id, tirar_compradores,   -- §4.25
  status,                                          -- 'montando' | 'no_ar' | 'encerrado'
  no_ar_em, no_ar_por, pausado_em, pausado_por, encerrado_em, encerrado_por,
  criado_em, criado_por, atualizado_em
)
grupos (                                                                          -- §4.22
  id, organizacao_id, lancamento_id, canal_tipo,   -- 'whatsapp' | 'telegram'
  canal_id,                                        -- null no WhatsApp colado, sem número
  externo_id,                                      -- id do chat no Telegram | chat da Unipile
  nome, convite, ordem, limite, cliques, membros, membros_em,   -- membros_em null: conta por clique
  status,                                          -- 'nao_pronto' | 'ativo' | 'cheio' | 'fora'
  tarefas jsonb,                                   -- {tarefa: {feita_em, feita_por}}
  direitos jsonb, permissoes_antes jsonb, avisado_cheio_em, sdr_quando_chamado,
  criado_em, criado_por,
  unique (lancamento_id, convite), unique (canal_id, externo_id)
)
links_do_lancamento (id, lancamento_id, canal_tipo, codigo unique, ativo, criado_em)
cliques_dos_links (id, link_id, grupo_id, visitante, origem jsonb, em)
convites_dos_grupos (id, grupo_id, origem, convite, tag_id, criado_em, unique (grupo_id, origem))
membros_dos_grupos (grupo_id, externo_id, contato_id, entrou_em, saiu_em, convite_id,
                    primary key (grupo_id, externo_id, entrou_em))
mensagens_do_lancamento (                                                         -- §4.24
  id, lancamento_id, tipo,                         -- 'mensagem' | 'fechar' | 'abrir'
  para,                                            -- 'todos' | 'whatsapp' | 'telegram'
  titulo, conteudo jsonb,                          -- {texto, midia, botao, fixar}
  agendada_para, avisar_antes_min, sugerida,
  status,                                          -- 'rascunho' | 'agendada' | 'saindo' | 'pausada' | 'concluida' | 'cancelada'
  confirmada_em, confirmada_por, editada_em, editada_por, motivo_pausa, criado_em, criado_por
)
envios_aos_grupos (                                                               -- a fila: um por grupo e item
  id, mensagem_id, grupo_id, modo,                 -- 'bot' | 'numero' | 'voce'
  status,                                          -- 'pendente' | 'enviando' | 'enviado' | 'esperando_voce' | 'feito_por_voce'
                                                   -- | 'nao_confirmado' | 'falhou' | 'pulado' | 'cancelado'
  motivo, codigo_erro, provider_message_id, tentativas, reservado_ate, tentar_apos,
  enviado_em, marcado_por, criado_em, unique (mensagem_id, grupo_id)
)
checkouts (id, organizacao_id, plataforma, segredo, conectado_em, conectado_por)  -- §4.25; segredo cifrado
compras (id, organizacao_id, checkout_id, lancamento_id, contato_id, transacao, evento,
         produto_id, status, email, telefone, valor, moeda, em, payload,
         unique (checkout_id, transacao, evento))
conversas_dos_canais (                                                            -- §4.26: uma por pessoa e canal
  id, organizacao_id, canal_id, contato_id,
  externo_id,                                      -- chat do Telegram | IGSID | PSID
  usuario, nome, quem_responde,                    -- 'sdr' | 'voce'
  passou_em, motivo_da_passagem, lancamento_id, origem jsonb,
  ultima_entrada_em,                               -- abre a janela de 24 h
  ultima_em, saiu_em, saiu_motivo, criado_em, unique (canal_id, externo_id)
)
mensagens_dos_canais  + conversa_id, autor, apagada_em   -- autor: 'contato' | 'sdr' | 'voce' | 'automacao' | 'bot'
rascunhos_dos_canais (                                                            -- como os rascunhos do LinkedIn
  id, mensagem_id unique, conversa_id, resultado, categoria, confianca_categoria, sinais,
  acao_sugerida, texto, motivo, confianca, validacao, excecao, sdr_versao, modelos, uso,
  tentativas, criado_em, atualizado_em
)
automacoes_de_comentario (                                                        -- §4.27
  id, organizacao_id, canal_id, lancamento_id, nome, palavras text[], so_a_palavra,
  posts jsonb,                                     -- {tipo: 'todos' | 'um' | 'proximo', id?}
  texto_da_dm, botao jsonb, respostas_publicas text[], resposta_de_reserva, tag_id, vale_ate,
  status,                                          -- 'ligada' | 'pausada' | 'pausada_pelo_kakou' | 'encerrada'
  criado_em, criado_por, atualizado_em
)
respostas_aos_comentarios (                                                       -- uma por comentário
  id, automacao_id, canal_id, comentario_id unique, externo_id, contato_id, texto,
  status,                                          -- 'na_fila' | 'enviada' | 'pulada' | 'falhou'
  motivo, dm_id, publica_id, comentado_em, enviada_em
)                                                  -- e uma enviada por pessoa por automação
comentarios_dos_posts (id, canal_id, externo_id unique, post_id, autor_externo_id, autor_usuario,
                       texto, em, respondido_em, respondido_por, oculto_em, payload)
```

A identidade da pessoa em cada canal novo fica na relação com o canal
(`conversas_dos_canais.externo_id` na DM, `membros_dos_grupos.externo_id` no
grupo), não no contato: o id do Instagram e do Messenger vale só para aquela
conta, o contato já tem colunas de canal demais e uma tabela de identidades
teria um dono só, que travaria os tickets em paralelo. As colunas de WhatsApp
oficial e de Telegram do Marco D ficam como estão; o grupo do Telegram usa o
`telegram_id` do contato, porque o id da pessoa é o mesmo no privado e no
grupo.

Entra no Marco F (nomes conferidos contra o banco do GL Suite em 16/10: `marcas`,
`acessos_das_marcas` e `marcas_dos_perfis` estão livres; a `brands` de lá é do
GL Suite e não se mistura):

```text
marcas (                                                                          -- §4.30
  id, organizacao_id, nome, cor,                   -- cor: uma da paleta das tags
  status,                                          -- 'ativa' | 'pausada' | 'arquivada'
  analise_e_sdr_em,                                -- concluiu os três passos de criar marca
  criado_em, criado_por, pausada_em, pausada_por, arquivada_em, arquivada_por
)
acessos_das_marcas (operador_id, marca_id, criado_em, criado_por, primary key (operador_id, marca_id))
operadores        + marca_atual_id                 -- a marca do seletor
marcas_dos_perfis (perfil_id, marca_id, ligado_em, ligado_por, primary key (perfil_id, marca_id))
+ marca_id em ofertas, sdrs, sdr_testes, publicos, previas, abordagens, listas_de_empresas,
  campanhas, leads e conversas (denormalizados para o RLS), contatos, tags, segmentos,
  importacoes_de_contatos, canais, disparos, lancamentos e nas tabelas-raiz do Marco E
  (grupos, checkouts, conversas_dos_canais, automacoes_de_comentario, mencoes_dos_grupos)
public.pode_ver_marca(marca)   -- mesma organização e (admin ou acesso)
public.marca_atual()           -- operadores.marca_atual_id, quando pode ver; senão null
public.preencher_marca()       -- trigger: sem marca informada, usa a atual ou a única da
                               -- organização; com mais de uma e sem contexto, recusa
```

A migração é aditiva até o SDR-115: `marca_id` nullable com backfill para a
marca 1, unique novo ao lado do antigo, policy por `marca_id = marca_atual()`
(com uma marca por organização, devolve as mesmas linhas de hoje). O SDR-115
derruba os uniques por organização e põe `not null`, quando nenhum código no
ar depende mais deles.

Entra com o SDR-125:

```text
perfis        + arquivado_em timestamptz            -- §4.12: excluir a conta é arquivar; null é ativo no painel
```

Apagar a linha de `perfis` não dá: eventos, leads, ações, mensagens e
conversas apontam para ela. A conta arquivada some das listas do painel e fica
pausada e sem `unipile_account_id`; o histórico continua.

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
| T-4 | Resend com domínio verificado | aviso de "o SDR chamou você"; desde o Marco E, também o aviso de hora de mandar e o de grupo quase cheio (SDR-82, SDR-93), que sem ela só aparecem no Dashboard | Arthur |
| T-5 | `SUPABASE_SECRET_KEY` do projeto do GL Suite na Vercel | primeiro acesso de e-mail novo (SDR-40) | Arthur |
| T-6 | Migrations do Marco D aplicadas por SQL no banco do GL Suite (nunca por `db push`) | tudo do Marco D | Arthur |
| T-7 | `PLATAFORMA_ADMINS` e `COMERCIAL_URL` na Vercel. Em Production, `PLATAFORMA_ADMINS=@guessless.com.br,@guessless.ca` (SDR-126) e redeploy | ligar módulos pela tela e o "Quero contratar" (SDR-69); abrir a Plataforma (SDR-123, SDR-124) | Arthur |
| T-8 | `SEGREDOS_CHAVE` (32 bytes aleatórios em base64) na Vercel. Trocar a chave invalida os tokens guardados | conectar WhatsApp e Telegram (SDR-72, SDR-73) | Arthur |
| T-9 | Um número de WhatsApp Business de verdade, com o app da empresa na Meta, para o primeiro disparo real (o código foi testado só com a Meta de mentira) | aceite do SDR-72 com serviço real | Arthur |
| T-10 | pg_cron dos disparos a cada minuto (`supabase/snippets/disparos-pg-cron.sql`) | disparo agendado e disparo que segue com a tela fechada (SDR-72) | Arthur |
| T-11 | **Teste de conexão do número dos grupos:** conectar o segundo número da GuessLess na Unipile (QR e código de pareamento) e responder: conecta ou para em passkey? Qual o `type` do chat de grupo? `getInviteLink` funciona? Entrada por link chega como `event_type` 5 ou 0? Membro vem com telefone ou só LID? Registrar em `docs/pesquisa/whatsapp-grupos.md`. Antes de qualquer ticket do número | SDR-86, SDR-98, SDR-104 | Arthur |
| T-12 | Número só para os grupos: com histórico de uso (nunca chip novo), WhatsApp Business num celular ligado e com internet, um admin humano da equipe em cada grupo | uso real do SDR-86 | Arthur |
| T-13 | Verificação do negócio da GuessLess no portfólio dono do app da Meta. **Começar já**: é a primeira da fila do App Review | T-15, T-17 | Arthur |
| T-14 | App da Meta da GuessLess: tipo Business, produtos Instagram e Messenger, Facebook Login for Business com a configuração (`config_id`), webhooks `instagram` e `page` apontando para o Kakou; `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID` e `META_WEBHOOK_TOKEN` na Vercel | SDR-79 e SDR-80 com serviço real | Arthur |
| T-15 | Tech Provider (Access Verification, cerca de 5 dias) | App Review; clientes que não são a GuessLess | Arthur |
| T-16 | Política de privacidade e termos com o Kakou numa URL pública, ícone 1024×1024, categoria, organização de teste com login para o revisor da Meta | T-17 | Arthur |
| T-17 | **App Review, rodada 1** (cerca de 1 semana por rodada), em Advanced Access: `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`, `business_management` e a feature Human Agent. Um vídeo por permissão, legendado em inglês. No ar antes de gravar, com contas que têm papel no app: SDR-79 e SDR-80 (login, permissões, exclusão), SDR-87 e SDR-89 (o SDR responde a DM, você lê e responde no Chats: a Meta exige caminho para humano), SDR-90 e SDR-94 (a palavra-chave manda a DM; o polling do SDR-90 permite gravar sem o webhook de comentário). Pelo menos uma chamada bem-sucedida de cada permissão nos 30 dias antes do envio. O Messenger (SDR-96) entra se estiver pronto; senão, rodada 2 | SDR-89, SDR-90, SDR-94, SDR-95 e SDR-96 para quem não tem papel no app, inclusive o webhook de comentário da própria GuessLess | Arthur |
| T-18 | ManyChat Pro no Instagram da GuessLess, com a palavra-chave levando ao link do Kakou (`/go/<código>?utm_source=instagram`), enquanto o App Review não sai (D19) | Instagram no primeiro lançamento | Arthur |
| T-19 | Hotmart: o hottok, o postback apontando para a URL que o Kakou mostra e os produtos do lançamento | SDR-77 com serviço real | Arthur |
| T-20 | Id do Pixel da Meta da GuessLess | SDR-83 | Arthur |
| T-21 | Bot da GuessLess conectado (SDR-73) com grupos liberados no @BotFather (`/setjoingroups`) e o modo privacidade ligado; os grupos do lançamento criados no app do Telegram | SDR-84 em produção | Arthur |
| T-22 | Migrations do Marco E aplicadas por SQL no banco do GL Suite (como o T-6), incluindo o bucket de mídia com o nome conferido | tudo do Marco E | Arthur |
| T-23 | Migrations do Marco F aplicadas por SQL no banco do GL Suite (como o T-6), uma por ticket, antes do merge dele; a do SDR-115 só depois do smoke de `marca_id` nulo dar 0 em todas as tabelas | tudo do Marco F | Arthur |

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

**SDR-121 · Todo mundo das empresas da lista**
- Pedido: buscar os leads que trabalham nas empresas da lista selecionada sem
  pôr nenhum outro filtro, para achar todo mundo desses lugares.
- Com lista de empresas (§4.11), o cargo fica opcional, como a região. Sem
  cargo, cada empresa achada é uma parte da busca. Na aba Leads, "Todo mundo
  destas empresas" tira cargos, palavras-chave, regiões e setores. A busca
  pela conversa aceita "todo mundo dessas empresas" e deixa os cargos vazios.
- Aceite: com lista e sem nenhum outro filtro, a busca roda e traz todo mundo
  das empresas, uma página por parte, até esgotar; pôr um cargo de volta
  recomeça do início, em grupos de 10; sem lista, busca sem cargo não salva
  nem roda; teto do dia, opt-out, um alvo um dono, cooldown e nota seguem
  iguais.

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

### Marco E · Lançamentos, Instagram, Facebook e comunidades

Pedido do Arthur em 16/10/2026: Instagram, Facebook e comunidades (grupos de
WhatsApp, de Telegram, de Instagram, grupos em geral). Decidido com ele: o SDR
fala com quem chega na DM, palavra-chave no comentário vira DM, comentários
dos posts; só grupos que a organização tem, com disparo, regras, membro
virando contato com tag, leitura do grupo e o SDR; o risco do WhatsApp pela
Unipile aceito; só WhatsApp, Telegram, Instagram e Facebook; o primeiro caso é
a GuessLess gerenciando lançamentos; o app da Meta é o da GuessLess; um módulo
por canal mais Comunidades; reaproveitar o Marco D; desprender o SDR do
LinkedIn; lançamento como conceito do domínio. Pesquisas: Instagram e
Messenger, WhatsApp em grupos, Telegram em grupos e o mercado (§5).

**O corte.** O primeiro lançamento da GuessLess roda sem a Meta e sem número
de WhatsApp conectado: grupos de WhatsApp colados com o link girando pelo
clique e a agenda feita por você, Telegram completo pelo bot, Hotmart marcando
quem comprou e um ManyChat por fora no Instagram (D19). São 14 tickets (✅ na
tabela). Os outros rodam em paralelo, sem segurar o lançamento: o Instagram e o
Facebook começam já, porque são o que precisa estar no ar para gravar o App
Review (T-17); o número dos grupos só depois do T-11.

| Onda | Ticket | Depende de | 1º lançamento |
|---|---|---|---|
| 11 | SDR-74 Lançamentos e os módulos novos | — | ✅ |
| 11 | SDR-75 O SDR em cada canal, no chat de teste | — | |
| 12 | SDR-76 Grupos e o link que enche | 74 | ✅ |
| 12 | SDR-77 A Hotmart marca quem comprou | 74 | ✅ |
| 12 | SDR-78 O SDR no privado do bot do Telegram | 74, 75 | |
| 12 | SDR-79 Conectar o Instagram e a Página | 74 | |
| 12 | SDR-80 O webhook da Meta e a exclusão de dados | 74 | |
| 12 | SDR-81 O SDR para quem não tem o LinkedIn | 74 | |
| 13 | SDR-82 Grupo quase cheio, página de espera e tarefas no celular | 76 | ✅ |
| 13 | SDR-83 Pixel no clique | 76 | ✅ (sai se a data apertar) |
| 13 | SDR-84 O bot do Telegram entra nos grupos | 76 | ✅ |
| 13 | SDR-85 A agenda do lançamento: o motor | 76 | ✅ |
| 13 | SDR-86 Conectar o número dos grupos | 74, 76, T-11 | só com T-11 |
| 13 | SDR-87 Chats com os canais | 78 | |
| 13 | SDR-88 O SDR sabe do lançamento | 78 | |
| 13 | SDR-89 O SDR responde a DM do Instagram | 78, 79, 80 | |
| 13 | SDR-90 Comentário com a palavra vira DM: o motor | 78, 79, 80 | |
| 14 | SDR-91 Todos os comentários | 90 | |
| 14 | SDR-92 Quem entra no grupo do Telegram vira contato | 84 | ✅ |
| 14 | SDR-93 A agenda na tela e o feito por você | 85 | ✅ |
| 14 | SDR-94 Palavras-chave na tela | 90 | |
| 14 | SDR-95 Resposta pública e palavra na DM | 89, 90 | |
| 14 | SDR-96 Messenger e comentários da Página | 89, 90 | |
| 14 | SDR-97 O SDR no grupo do Telegram, quando chamado | 78, 84 | |
| 14 | SDR-98 A agenda sai pelo número dos grupos | 85, 86 | só com T-11 |
| 15 | SDR-99 A origem vira tag no Telegram | 76, 92 | ✅ |
| 15 | SDR-100 Quem comprou sai do grupo do Telegram | 77, 92 | ✅ |
| 15 | SDR-101 Imagem, vídeo, áudio e PDF na agenda | 93 | ✅ (sai se a data apertar) |
| 15 | SDR-102 Fechar, abrir e fixar pela agenda | 84, 93 | ✅ |
| 15 | SDR-103 O aviso de hora de mandar no Telegram da equipe | 93 | ✅ |
| 15 | SDR-104 Membros contados pelo número dos grupos | 86, 92 | só com T-11 |

Caminhos mais longos até o primeiro lançamento: 74 → 76 → 85 → 93 → 101, 102
e 103; e 74 → 76 → 84 → 92 → 99 e 100. Os tickets da onda 12 podem começar
contra os contratos do SDR-74 (abaixo) enquanto ele está em revisão. Arquivos
divididos sem dependência: o SDR-78 e o SDR-84 mexem no webhook do Telegram
(o 84 separa privado e grupo; o 78 só toca o privado); o SDR-77 e o SDR-82
mexem no formulário do lançamento do SDR-74.

**SDR-74 · Lançamentos e os módulos novos**
- Módulos `instagram`, `facebook` e `comunidades` no catálogo
  (`src/domain/modulos.ts`; nomes em `docs/naming.md`), na Plataforma, no
  Plano e no menu (§2.2, §4.14). A migration troca o check de
  `modulos_da_organizacao.modulo` e liga os três na organização da GuessLess.
- Os checks que o Marco E inteiro usa mudam aqui, uma vez só, com a lista
  final: `canais.tipo` e `contatos.origem` (§6). Três migrations reescrevendo o
  mesmo check na mesma onda apagariam o valor uma da outra. `TIPOS_DE_CANAL`
  ganha os tipos novos e o disparo passa a usar `CANAIS_DE_DISPARO` (troca
  mecânica em `domain/disparos.ts` e `server/disparos/*`).
- Tabela `lancamentos`, com a tag criada junto; `src/domain/lancamentos.ts` com
  a validação e `faseDoLancamento`.
- Telas: `/launches` (montando, no ar, encerrados recolhidos), `/launches/new`
  (nome, produto e datas) e `/launches/[id]` com Hoje (a régua das fases e as
  datas) e SDR (preço, perguntas, o que mais ele sabe, link do carrinho); Pôr
  no ar (por ora, só confere as datas), Pausar e Encerrar (à mão e sozinho 7
  dias depois do carrinho). As outras abas nascem nos tickets delas.
- O Precisa de você do Dashboard passa a existir com qualquer módulo, e o
  cartão do lançamento no ar entra no Dashboard.
- Aceite: organização sem os três módulos não vê Lançamentos e a rota abre o
  Plano; a ação do servidor recusa mesmo chamada direto; a tag do lançamento
  não duplica (caixa e acento); aula fora de ordem e carrinho invertido são
  recusados; fase certa nas bordas (no minuto em que o carrinho abre); encerra
  sozinho no 7º dia; lançamento de outra organização não abre; os checks
  aceitam os valores novos e recusam um inventado; os testes de disparo passam
  sem mudança.

**SDR-75 · O SDR em cada canal, no chat de teste**
- `EntradaDoAgente` ganha `canal` (padrão `linkedin`), `linksPermitidos`,
  `contextoDoLancamento` e `noGrupo` (contrato abaixo).
- `promptDeRascunho` e `promptDeClassificacao` montam o enquadramento e as
  regras da casa do canal (§4.3). No LinkedIn, ficam iguais aos de hoje. Fora
  do LinkedIn, o validador aceita só os `linksPermitidos`.
- O chat de teste (primeiro acesso e Configurações > SDR) ganha o canal no
  topo, ao lado do segmento, e chama a mesma `decidirResposta`.
  `VERSAO_DOS_PROMPTS` sobe.
- Aceite: o prompt do LinkedIn sai igual byte a byte ao de antes (teste com o
  texto gravado); mesmo canal e mesma versão do SDR dão o mesmo prompt de
  sistema (cache); no Instagram, link fora da lista é barrado e link da lista
  passa; o teste no canal Instagram passa pela mesma decisão da produção;
  regras da casa aparecem em todo canal.

**SDR-76 · Grupos do lançamento e o link que enche**
- Tabelas `grupos`, `links_do_lancamento` e `cliques_dos_links`; configuração
  `grupos.limite_padrao`.
- Aba Grupos: colar grupos do WhatsApp (nome e convite, um por linha), ordem,
  limite e estado; Corrigir a contagem, Marcar como cheio, Trocar o link,
  Tirar do lançamento. Aba Link: o link por canal com Copiar e o QR code, os
  links por origem, cliques por grupo e por origem.
- Rota pública `src/app/go/[codigo]/route.ts`, fora do portão de login
  (conferir o matcher do `proxy.ts`), sempre dinâmica: uma transação curta
  escolhe o grupo, soma o clique (`update ... set cliques = cliques + 1`),
  grava o clique e devolve 302. Nenhuma chamada externa no caminho. Funções
  puras em `domain/link-do-lancamento.ts`: `grupoDaVez`, `ehRoboDePrevia`,
  `origemDoClique`. Cookie `gl_go_<código>` de 30 dias.
- Montando, encerrado e sem vaga: páginas simples (a espera entra no SDR-82).
  Pôr no ar passa a exigir um grupo pronto. Hoje ganha os cliques do dia e por
  origem.
- Aceite: o 901º clique vai para o grupo 2; duas transações no último lugar
  não passam do limite (teste de concorrência); robô e `HEAD` não contam; o
  mesmo visitante volta ao mesmo grupo e não conta de novo; UTM gravada; grupo
  de outro lançamento nunca é escolhido; convite que não é
  `chat.whatsapp.com` é recusado; lançamento montando ou encerrado não manda
  para grupo; a rota responde sem login.

**SDR-77 · A Hotmart marca quem comprou**
- Pesquisa primeiro, na fonte da Hotmart: `docs/pesquisa/hotmart.md` com o
  postback 2.0 (eventos, `X-HOTMART-HOTTOK`, campos, transação).
- Tabelas `checkouts` e `compras`. Configurações > Integrações > Hotmart (só o
  admin): a URL do webhook e o hottok cifrado com `SEGREDOS_CHAVE`. No
  lançamento, os produtos e a tag de comprador.
- Webhook `/api/webhooks/hotmart/[checkout]`: hottok conferido em tempo
  constante; idempotente por transação e evento; aprovada acha ou cria o
  contato e põe a tag; reembolso, chargeback e cancelamento tiram; produto sem
  lançamento só grava. O contato mostra as compras; Hoje, as do lançamento.
- Aceite: hottok errado devolve 401; o mesmo evento duas vezes põe a tag uma
  vez; e-mail que já é contato não duplica; reembolso tira a tag; checkout de
  uma organização não mexe em contato de outra; o segmento "sem a tag Comprou"
  exclui o comprador.

**SDR-78 · O SDR conversa no privado do bot do Telegram**
- Tabelas `conversas_dos_canais` e `rascunhos_dos_canais`;
  `mensagens_dos_canais` ganha `conversa_id`, `autor` e `apagada_em`; `canais`
  ganha `sdr_modo`.
- Mensagem privada que não é /start nem pedido de saída entra na conversa da
  pessoa. O webhook grava e responde 200; `processarMensagemDoCanal` roda
  depois, por `after()` (ler `node_modules/next/dist/docs/` antes), com
  retentativa no cron e reserva por mensagem, como os rascunhos do LinkedIn. A
  decisão é a mesma `decidirResposta`, com canal `telegram`; a resposta sai na
  hora, sem o atraso do LinkedIn; no "aprovo cada resposta", espera na
  conversa.
- Passar para você: o aviso por e-mail leva ao contato, que mostra a conversa;
  item no Precisa de você. Texto barrado vira sugestão.
- Configurações > SDR: "Onde o SDR responde", com o Telegram, só o admin,
  desligado por padrão. Kill switch `sdr_nos_canais.ativo`.
- Aceite: update entregue duas vezes gera uma resposta; canal ou kill switch
  desligado, nada sai; preço chama você e nada sai; texto barrado não sai;
  depois de passar, a próxima mensagem da pessoa não aciona o SDR; /sair
  continua igual; organização sem SDR não responde; os testes do agente do
  LinkedIn passam sem mudança.

**SDR-79 · Conectar o Instagram e a Página do Facebook**
- Configurações > Instagram e Facebook (`/settings/meta`, só o admin, com
  Instagram ou Facebook): o que o Kakou faz e não faz, a conferência antes de
  conectar e "Continuar com o Facebook" (Facebook Login for Business com o
  `config_id`; o `code` é trocado no servidor).
- A pessoa escolhe a Página; com `facebook`, vira o canal `facebook`; com
  `instagram` e Instagram ligado, o canal `instagram`. Token cifrado;
  `subscribed_apps`; a tela mostra o @, a Página, as permissões dadas e as que
  faltam, e o último aviso da Meta, com os estados de erro (permissão
  negada, Página sem Instagram, acesso às mensagens desligado, token
  inválido, conta restrita).
- Instagram sem Página não conecta e a tela explica como ligar; um Instagram
  numa organização só (índice único). Desconectar apaga o token e para o SDR e
  as automações do canal. A tabela de erros da Meta fica em `domain/meta.ts`
  (190, 2534041, 2534029, 10/1893063). `META_*` entram no `.env.example`,
  lidos por `lerEnv`.
- Aceite: callback repetido não cria dois canais; Instagram de outra
  organização é recusado; organização só com `facebook` não cria canal de
  Instagram; o painel nunca lê o token; desconectar apaga o token.

**SDR-80 · O webhook da Meta e a exclusão de dados**
- `/api/webhooks/meta`: GET com o verify token; POST com
  `X-Hub-Signature-256` sobre o corpo cru; separa `entry[]` por conta, grava
  cada uma em `webhooks_dos_canais`, responde 200 e processa depois
  (`processarEventoDaMeta`, roteando para `MANIPULADORES_DA_META`); campo sem
  manipulador fica "ignorado". Retentativa pelo cron.
- Desautorizar e exclusão de dados (`signed_request` com o segredo do app):
  desautorizar desconecta o canal; a exclusão apaga as conversas, mensagens e
  contatos daquela pessoa que vieram só daquele canal e devolve a URL de
  status.
- A tela do canal mostra o último aviso e as falhas da última hora (a Meta
  desinscreve o app depois de 1 hora de falha).
- Aceite: assinatura errada devolve 401; lote com duas contas vira dois
  registros; entrega repetida não faz nada; responde em menos de 1 s com um
  manipulador lento; `signed_request` inválido é recusado; a exclusão apaga só
  a pessoa pedida.

**SDR-81 · O SDR para quem não tem o LinkedIn**
- Configurações > Empresa e SDR abrem com `linkedin`, `instagram`, `facebook`
  ou `comunidades`. Sem análise, Empresa mostra os passos Site e Análise do
  primeiro acesso; com a análise confirmada, `garantirSdr` gera o SDR em nome
  da organização e abre o chat de teste. Dashboard: "Falta montar o SDR". O
  primeiro acesso continua só do LinkedIn.
- Aceite: organização só com `instagram` lê o site, confirma, ganha o SDR e
  testa; organização só com `whatsapp` não vê as abas; o SDR fala em nome da
  organização; organização com LinkedIn não muda.

**SDR-82 · Grupo quase cheio, página de espera e tarefas no celular**
- Tarefas no celular dos grupos de WhatsApp (§4.22): o painel na aba Grupos
  com o progresso de cada tarefa e a tela de passo a passo
  (`/launches/[id]/tasks/[tarefa]`, pensada para o celular) com "Abrir no
  WhatsApp" e "Feito" por grupo. Grupo com tarefa obrigatória aberta fica não
  pronto e sai do rodízio.
- Aviso de 80%: e-mail (T-4) e Precisa de você, uma vez por grupo
  (`avisado_cheio_em`); não avisa se há próximo grupo com vaga.
- Tudo cheio: a página de espera (nome, WhatsApp ou e-mail, caixa de
  autorização desmarcada), com honeypot e limite por IP; vira contato com
  origem `pagina_de_espera` e a tag do lançamento; ou o endereço que o
  lançamento disser. A aba Grupos mostra quantos esperam.
- Aceite: grupo com tarefa obrigatória aberta nunca recebe clique; marcar grava
  quem e quando; o aviso sai uma vez; a espera só aparece com tudo cheio;
  telefone inválido volta com o motivo; contato repetido completa só o vazio;
  a autorização registra que veio da página.

**SDR-83 · Pixel no clique**
- Com `pixel_id` no lançamento, o clique passa por uma página com o Pixel
  (`PageView` e `Lead`) que segue para o grupo escolhido, com botão manual e
  `<noscript>`. Sem Pixel, o 302 de sempre.
- Aceite: com Pixel, o destino é o mesmo grupo do 302 e o clique conta uma
  vez; sem Pixel, nada muda; id de Pixel que não é número é recusado.

**SDR-84 · O bot do Telegram entra nos grupos do lançamento**
- `allowed_updates` passa a `message`, `edited_message`, `my_chat_member`,
  `chat_member` e `callback_query`, com a versão em
  `canais.dados.webhook.versao`; o cron refaz o `setWebhook` dos bots que
  estão atrás.
- O webhook separa privado (como hoje) de grupo (`processarUpdateDeGrupo`, em
  `server/grupos/telegram.ts`). "Pôr o bot num grupo":
  `t.me/<bot>?startgroup=<código>&admin=change_info+delete_messages+restrict_members+invite_users+pin_messages`.
- `my_chat_member` registra o grupo, lê os direitos e mostra o que falta; a
  saída do bot põe o grupo fora; código de outra organização faz o bot sair
  (`leaveChat`); `migrate_to_chat_id` troca o id. O bot cria o convite do grupo
  (`createChatInviteLink`), aplica o nome, a descrição e as regras fixadas do
  lançamento, e conta os membros (`getChatMemberCount`) ao entrar e uma vez
  por dia.
- Configurações > Telegram ganha Grupos e canais, com os estados da §4.23,
  inclusive "o bot não aceita grupos" (`can_join_groups`).
- Aceite: grupo posto pelo link cai no lançamento certo; sem admin, fica não
  pronto e fora do rodízio; grupo que vira supergrupo continua o mesmo; update
  repetido não duplica grupo; as regras são fixadas uma vez; os testes do
  SDR-73 passam; bot já conectado ganha os updates novos sem reconectar.

**SDR-85 · A agenda do lançamento: o motor**
- Tabelas `mensagens_do_lancamento` e `envios_aos_grupos` (§6), com o desenho e
  o código da fila dos disparos (`pegarTrava`, reserva por prazo, "pode ter
  chegado"). `domain/agenda.ts` com a janela `agenda.janela` (D23), os tetos e
  os estados.
- `processarAgenda` roda no `/api/cron/disparos`, com trava própria: na hora, o
  item vira saindo e cria os envios com os grupos prontos naquele momento.
  Modo por grupo: Telegram pelo bot (20 por minuto, `retry_after`); WhatsApp
  esperando você (o SDR-98 troca para o número).
- Ações do servidor: agendar, editar, pausar, retomar, cancelar, tentar de novo
  as falhas e marcar mandado por você. Kill switch `agenda.ativa`; Pausar o
  lançamento; encerrar cancela o pendente.
- Aceite: 3 grupos recebem uma vez cada; grupo pronto depois de agendar
  recebe; grupo fora ou não pronto não recebe; duas rodadas ao mesmo tempo não
  mandam duas vezes; envio sem resposta vira "pode ter chegado"; 429 espera;
  agendar à 0h30 é recusado; editar depois de começar é recusado; kill switch
  desligado não manda nada; WhatsApp fica esperando você.

**SDR-86 · Conectar o número dos grupos do WhatsApp** (só depois do T-11)
- Configurações > WhatsApp > Número dos grupos (com Comunidades, só o admin):
  o aviso do risco, a caixa de confirmação, QR code ou código de pareamento
  (no celular, o código primeiro) e os estados da §4.29 (esperando, aquecendo,
  conectado, não conectou por passkey, caiu, pode ser banimento).
- Hosted auth da Unipile com `providers: ['WHATSAPP']`: `gerarLinkDeConexao`
  ganha o provedor e o callback separa WhatsApp de LinkedIn. Canal
  `whatsapp_app`, aquecido 24 horas depois de conectar.
- Webhook da Unipile: `account_type: WHATSAPP` vai para o canal, **nunca**
  para o `registrarMensagem` do LinkedIn; status fora de OK põe o canal com
  erro, pausa e avisa; conversa de um para um é ignorada.
- Os grupos colados ganham o número, casando pelo código do convite. Grupo em
  que o número não é admin fica feito por você. "Pausar o número" e
  `comunidades.numero_ativo`.
- Aceite: conta WhatsApp nunca vira perfil; mensagem de grupo não chega ao
  agente do LinkedIn; nada sai antes de 24 horas; `CREDENTIALS` pausa e avisa;
  o grupo colado casa pelo código; número de outra organização é recusado.

**SDR-87 · Chats com as conversas dos canais**
- O Chats abre com `linkedin`, `instagram`, `facebook` ou um canal com o SDR
  ligado. Filtro por canal (`?channel=`) quando há mais de um; os filtros de
  situação valem para todos.
- O fio: o autor de cada mensagem (contato, SDR, Você, automação; "Você · pelo
  app do Instagram"), os marcos (comentou no post, a automação mandou DM, o SDR
  chamou você, você assumiu, devolveu, a janela fechou) e a janela no
  cabeçalho, com o campo de resposta de cada situação (§4.26).
- `responderComoVoce` (validador como texto humano) e "Devolver ao SDR". Painel
  do contato: canal, @ com link, como começou, lançamento, tags, Não contatar
  mais.
- Aceite: o LinkedIn fica igual; responder põe a conversa com você; devolver
  volta ao SDR; janela fechada não manda e diz por quê; mensagem apagada some
  do fio; a tela se atualiza sozinha.

**SDR-88 · O SDR sabe do lançamento**
- O lançamento da conversa vem da automação que a abriu, do `ref` do link
  (`ig.me`, `m.me`, `t.me`) ou do único lançamento no ar; com mais de um e sem
  pista, nenhum.
- A mensagem do usuário leva a fase, as próximas aulas, o carrinho, o preço,
  as perguntas frequentes e o que o SDR sabe. `linksPermitidos` = carrinho,
  aulas e o link `/go`. Com preço no lançamento, pergunta de preço não passa
  para você (D25; a §4.7 já diz isso). O chat de teste ganha a escolha do
  lançamento.
- Aceite: com o carrinho aberto, "quero comprar" responde com o link do
  carrinho e passa no validador; outro link é barrado; preço com preço no
  lançamento é respondido e, sem ele, chama você; reclamação continua chamando
  você; o prompt de sistema não muda com o lançamento nem com a fase (cache).

**SDR-89 · O SDR responde a DM no Instagram**
- `MANIPULADORES_DA_META['instagram:messages']`: acha o contato pelo IGSID na
  conversa; pessoa nova, `GET /<IGSID>?fields=name,username`, origem
  Instagram; a mensagem vai ao SDR com canal `instagram`.
- Eco (`is_echo`): eco que não saiu pelo Kakou é você assumindo; o do `mid` que
  o Kakou mandou é ignorado. `is_deleted` apaga o texto. Envio pelo token da
  Página, até 1.000 bytes (quebra em duas).
- Janela: o SDR até 24 horas; você até 7 dias com `HUMAN_AGENT` (configuração
  `meta.human_agent`, ligada quando a feature for aprovada). Configurações >
  SDR ganha o Instagram em "Onde o SDR responde".
- Aceite: mensagem repetida responde uma vez; resposta pelo app tira o SDR; o
  eco do Kakou não tira; 25 horas depois o SDR não manda; 1.200 bytes seus
  saem em duas mensagens; 2534041 marca o canal; GIF não quebra.

**SDR-90 · Comentário com a palavra vira DM: o motor**
- Tabelas `automacoes_de_comentario`, `respostas_aos_comentarios` e
  `comentarios_dos_posts`. `MANIPULADORES_DA_META['instagram:comments']`
  guarda todo comentário dos posts e roda as automações: a palavra casa por
  `casaComAPalavra`; resposta privada com `recipient.comment_id`; contato e
  conversa com o lançamento e a origem "comentário"; as tags.
- Uma DM por comentário (`comment_id` único) e uma por pessoa por automação;
  até 7 dias; até `instagram.dms_por_hora` (600) por hora, e o resto fica na
  fila e sai pelo cron. 10900 e 2534025 viram "pulado"; token inválido pausa
  as automações do canal.
- Polling de reserva a cada 5 minutos nos posts das automações ligadas: cobre
  o que o webhook não trouxe e deixa gravar o vídeo do App Review antes do
  acesso avançado. Kill switch `instagram.automacoes_ativas`.
- Aceite: "quero" casa com "QUERO!!", não com "querosene"; o segundo
  comentário da mesma pessoa não manda outra DM; comentário da própria conta é
  ignorado; webhook e polling do mesmo comentário mandam uma DM; 700 numa hora:
  600 saem e 100 esperam; comentário de 8 dias não manda; automação pausada não
  manda.

**SDR-91 · Todos os comentários**
- Tela Comentários (`/comments`), segmento Todos os comentários: por post, com
  os filtros sem resposta, com palavra-chave e todos; Responder (em público),
  Mandar no direct (até 7 dias e se ainda não recebeu) e Ocultar. Vale para o
  Instagram e, com o SDR-96, para a Página. O SDR não responde comentário.
- Aceite: responder aparece no post e marca o comentário; mandar no direct
  depois de 7 dias é recusado com o motivo; ocultar some do post e fica
  marcado; comentário de outra organização não aparece.

**SDR-92 · Quem entra no grupo do Telegram vira contato**
- Tabela `membros_dos_grupos`. Entrada e saída pelo `chat_member`, com a
  mensagem de serviço como reserva e dedupe por grupo, pessoa e `date`.
  Entrou: contato pelo `telegram_id` (novo, origem `grupo_telegram`) e a tag do
  lançamento. Saiu: `saiu_em`. O grupo ganha `membros` e `membros_em`, e o
  rodízio passa a contar membros.
- O disparo (`motivoParaPular`) passa a exigir `telegram_entrou_em` (o
  /start). O contato mostra os grupos. Hoje ganha entradas e saídas.
- Aceite: entrada conta uma vez pelas duas fontes; sair e voltar dá duas
  passagens; quem já deu /start é o mesmo contato; membro sem /start fica de
  fora do disparo, com o motivo; o rodízio troca pela contagem real; bot é
  ignorado.

**SDR-93 · A agenda na tela e o WhatsApp feito por você**
- Aba Agenda: os itens por dia, com a linha do agora e os dias passados
  recolhidos; a agenda sugerida pelas datas, em rascunho; o editor (quando,
  título, para quem, texto, avisar antes) com "Como chega"; agendar, editar,
  pausar, retomar, cancelar, mandar agora, duplicar; o resultado por grupo;
  tentar de novo as falhas.
- Feito por você: o aviso antes e na hora (e-mail com o T-4 e Precisa de você,
  no Dashboard e em Hoje); a tela Mandar à mão (`/launches/[id]/send/[item]`,
  pensada para o celular) com o texto para copiar, o arquivo, os grupos com
  Abrir no WhatsApp e Mandei, e Mandei em todos; sem marca em 2 horas, não
  confirmado, e "Faltou mandar em N grupos".
- Aceite: agendar fora da janela mostra a hora que daria; item editado antes da
  hora sai editado; Mandei grava quem e quando; a tela se atualiza enquanto
  sai; item cancelado não sai em grupo nenhum; a agenda sugerida não agenda
  nada sozinha.

**SDR-94 · Palavras-chave na tela**
- Tela Comentários, segmento Palavras-chave, e a aba Palavras-chave do
  lançamento (a mesma lista, filtrada): comentaram, DMs, clicaram e falharam;
  criar e editar (onde, palavra, se tem de ser só a palavra, posts pela lista
  da conta, texto da DM com o link do lançamento sugerido, botão, tag,
  lançamento, vale até) com "Como chega"; Ligar, Pausar, Encerrar; quem
  comentou, com o status da DM. O texto da DM passa no validador.
- Aceite: automação sem palavra não salva; duas automações ligadas com a mesma
  palavra no mesmo post são recusadas; pausar para na hora; as contagens batem
  com `respostas_aos_comentarios`.

**SDR-95 · Resposta pública e palavra na DM**
- Resposta pública: até 3 versões, alternadas, por `POST /<comment>/replies`,
  só se a DM saiu; resposta de reserva, se ligada, quando a DM não chega.
- Palavra na DM: a DM que casa com uma automação ligada recebe o texto dela
  antes do SDR, uma vez por pessoa.
- Aceite: as versões se alternam; DM que falhou não ganha a resposta normal e
  ganha a de reserva só se ligada; com a palavra na DM, o SDR não responde a
  mesma mensagem.

**SDR-96 · Messenger e comentários da Página**
- `page:messages` (canal `facebook`, PSID; o nome só com a feature aprovada,
  senão "Pessoa do Messenger"), `page:message_echoes` (`app_id` diferente do
  nosso é você assumindo) e `page:feed` (os comentários e as automações do
  canal `facebook`). O SDR responde no Messenger em até 30 s. Configurações >
  SDR ganha o Messenger.
- Aceite: os casos do SDR-89 e do SDR-90 no formato da Página; o eco da caixa
  da Página tira o SDR; `verb: edited` não dispara de novo.

**SDR-97 · O SDR no grupo do Telegram, quando chamado**
- "Onde o SDR responde" ganha os grupos do Telegram (quando chamado ou não
  responde), e cada grupo pode desligar. Kill switch `sdr_nos_grupos.ativo`.
- Chamado por menção, resposta ao bot ou `/pergunta@bot`: responde curto,
  citando, no mesmo tópico, uma vez a cada 30 s por grupo; assunto pessoal
  ganha o botão `t.me/<bot>?start=`. Aba SDR do lançamento: Menções (todas e
  as que passaram para você), com Responder no grupo.
- Guarda só o que chama o SDR, por 90 dias (D27).
- Aceite: mensagem sem menção nunca chega ao agente; preço sem preço no
  lançamento chama você e nada sai no grupo; desligar para na hora; 10 menções
  num minuto respeitam o ritmo; o texto some depois de 90 dias.

**SDR-98 · A agenda sai sozinha pelo número dos grupos** (só com T-11)
- `EnviadorDeGrupo` pela Unipile (`enviarNoGrupo`), de 10 a 20 s aleatórios
  entre grupos, só depois do aquecimento. Grupo sem o número continua feito
  por você. Erro da conta pausa o item e o número; grupo removido vira fora.
- Aceite: o intervalo fica entre 10 e 20 s; número aquecendo não manda;
  `CREDENTIALS` no meio pausa sem repetir o que saiu.

**SDR-99 · A origem vira tag no Telegram**
- Clique de link do Telegram com origem usa `convites_dos_grupos`
  (`createChatInviteLink` com o nome da origem, criado na primeira vez).
  `chat_member.invite_link` põe a tag da origem (criada se faltar, dentro do
  teto de 200). A aba Link mostra entradas por origem.
- Aceite: a mesma origem no mesmo grupo usa o mesmo convite; o convite
  "stories" põe a tag "stories"; o convite principal não põe tag de origem; o
  teto de tags avisa e não quebra a entrada.

**SDR-100 · Quem comprou sai do grupo do Telegram**
- Com "Tirar quem comprou dos grupos" ligado: `banChatMember` seguido de
  `unbanChatMember`, chamado no processamento da compra (SDR-77).
- Aceite: o comprador sai e pode voltar por convite; reembolso não põe de
  volta; quem não é membro não gera chamada; sem o direito de banir, avisa e
  não quebra.

**SDR-101 · Imagem, vídeo, áudio e PDF na agenda**
- Bucket privado no Supabase Storage (nome conferido, T-22), upload direto do
  navegador por URL assinada. Tetos: o menor entre os canais do item; legenda
  até 1.024 caracteres. Telegram: `sendPhoto`, `sendVideo`, `sendVoice`,
  `sendDocument`. Feito por você: o arquivo para baixar na tela Mandar à mão.
- Aceite: arquivo acima do teto é recusado antes de subir; legenda longa é
  recusada; mídia de outra organização não abre; áudio chega como mensagem de
  voz.

**SDR-102 · Fechar, abrir e fixar pela agenda**
- Telegram: fechar é `setChatPermissions` sem mandar mensagem, guardando
  `permissoes_antes`; abrir devolve; fixar sem notificar ou notificando, se
  marcado. WhatsApp: fechar e abrir entram como feito por você, com o caminho
  no app.
- Aceite: abrir volta exatamente o que o grupo tinha; sem
  `can_restrict_members`, falha com o motivo; fixar não notifica por padrão.

**SDR-103 · O aviso de hora de mandar no Telegram da equipe**
- Em Equipe, cada pessoa toca em "Receber avisos no Telegram", que abre o bot
  da organização com um código dela (`t.me/<bot>?start=equipe_<código>`); o
  bot guarda o id dela no operador. O aviso do feito por você e o de grupo
  quase cheio saem também por ali, com o link da tela Mandar à mão. Sem bot
  conectado, a opção não aparece.
- Aceite: o código vale só para aquele operador e vence; quem entra pelo código
  da equipe não vira contato; quem saiu da equipe não recebe; /sair no bot para
  os avisos; o aviso sai uma vez por item e pessoa.

**SDR-104 · Membros contados pelo número dos grupos** (só com T-11)
- `event_type` 5, 6 e 7 (o 0 depende do T-11) e os participantes de hora em
  hora em `membros_dos_grupos`; o rodízio passa a contar membros. Com telefone,
  casa com o contato do telefone; com LID, contato sem telefone (origem
  `grupo_whatsapp`); tag do lançamento.
- Aceite: entrada e saída mudam a contagem; o mesmo telefone em dois grupos é
  um contato só; LID não vira telefone; mensagem comum não é guardada.

**Contratos entre tickets.** O ticket bloqueado implementa contra estes
nomes enquanto o bloqueador não entra:

```ts
// SDR-74 · domain/modulos.ts, domain/canais.ts, domain/lancamentos.ts
export const MODULOS = ["linkedin", "whatsapp", "telegram", "instagram", "facebook", "comunidades"] as const;
export const TIPOS_DE_CANAL = ["whatsapp", "telegram", "instagram", "facebook", "whatsapp_app"] as const;
export const CANAIS_DE_DISPARO = ["whatsapp", "telegram"] as const;
export function faseDoLancamento(l: DatasDoLancamento, agora: Date): "sem_datas" | "captacao" | "aulas" | "carrinho" | "encerrado";

// SDR-75 · server/agente/decidir.ts
export type CanalDoSdr = "linkedin" | "instagram" | "facebook" | "telegram";
// EntradaDoAgente += { canal?: CanalDoSdr; linksPermitidos?: string[]; contextoDoLancamento?: string | null; noGrupo?: boolean }

// SDR-76 · domain/link-do-lancamento.ts, server/lancamentos/link.ts
export type GrupoNoRodizio = { id: string; ordem: number; limite: number; cliques: number; membros: number | null; status: "nao_pronto" | "ativo" | "cheio" | "fora"; convite: string | null };
export function grupoDaVez(grupos: readonly GrupoNoRodizio[]): GrupoNoRodizio | null;
export function registrarClique(db: Db, p: { codigo: string; url: string; userAgent: string | null; visitante: string | null; agora: Date }):
  Promise<{ tipo: "grupo"; grupoId: string; destino: string; visitante: string; origem: Record<string, string> } | { tipo: "cheio" | "montando" | "encerrado" | "robo" | "nao_existe"; lancamentoId: string | null }>;

// SDR-78 · server/conversas-dos-canais/*
export type EnviadorDeConversa = {
  responder(p: { canal: CanalParaEnvio; conversa: { id: string; externoId: string }; texto: string; quem: "sdr" | "voce" }): Promise<{ providerMessageId: string }>;
  tratar(erro: unknown): ErroTratado;
};
export function registrarEntrada(tx: Db, p: { canal: CanalParaEnvio; externoId: string; pessoa: { nome: string; usuario: string | null }; mensagem: { providerMessageId: string; texto: string; em: Date; payload: unknown }; origem?: Record<string, unknown>; lancamentoId?: string | null }):
  Promise<{ conversaId: string; contatoId: string; mensagemId: string | null /* null = repetida */ }>;
export function registrarSaidaDaConta(tx: Db, p: { canalId: string; externoId: string; providerMessageId: string; texto: string; em: Date }): Promise<"nossa" | "voce_assumiu">;
export function processarMensagemDoCanal(deps: DependenciasDoAgente & { enviadores: Partial<Record<TipoDeCanal, EnviadorDeConversa>> }, mensagemId: string): Promise<ResultadoDoAgente>;

// SDR-79 e SDR-80 · server/meta/*
export type DadosDaMeta = { pageId: string; pageNome: string; instagramId: string | null; instagramUsuario: string | null; permissoes: string[]; inscricao: { ok: boolean; erro: string | null } };
export type ManipuladorDaMeta = (tx: Db, p: { canal: CanalParaEnvio; objeto: "instagram" | "page"; campo: string; valor: unknown; agora: Date }) => Promise<void>;
export const MANIPULADORES_DA_META: Partial<Record<string /* 'instagram:messages' | 'instagram:comments' | 'page:messages' | 'page:feed' */, ManipuladorDaMeta>>;

// SDR-84 · server/grupos/telegram.ts
export function processarUpdateDeGrupo(tx: Db, p: { canal: CanalParaEnvio; update: Record<string, unknown>; agora: Date }): Promise<AcaoDoBot[]>;

// SDR-85 · server/agenda/*
export type ConteudoDaAgenda = { texto: string; midia: { tipo: "imagem" | "video" | "audio" | "pdf"; caminho: string; nome: string; bytes: number } | null; botao: { texto: string; url: string } | null; fixar: boolean };
export type EnviadorDeGrupo = {
  enviar(p: { canal: CanalParaEnvio; grupo: { id: string; externoId: string }; item: { tipo: "mensagem" | "fechar" | "abrir"; conteudo: ConteudoDaAgenda } }): Promise<{ providerMessageId: string | null }>;
  tratar(erro: unknown): ErroTratado & { grupoFora?: boolean };
};

// SDR-86 · ClienteUnipile (o SDR-98 acrescenta enviarNoGrupo)
listarGrupos(accountId: string): Promise<{ chatId: string; nome: string | null }[]>;
conviteDoGrupo(chatId: string): Promise<string>;

// SDR-90 · domain/automacoes.ts
export function casaComAPalavra(texto: string, palavras: readonly string[], soAPalavra: boolean): boolean;

// SDR-77 → SDR-100: dentro de processarCompra, a compra aprovada chama
tirarDosGruposDoTelegram(tx: Db, p: { contatoId: string; lancamentoId: string; agora: Date }): Promise<number>;
```

### Marco F · Multi-marca

Pedido do Arthur em 16/10/2026: "o usuário pode adicionar mais marcas dentro do
Kakou (cada marca tem seu contexto, seus bots, etc)". Decidido com ele: o
primeiro caso é a GuessLess operando os clientes dela; a marca fica dentro da
organização e é a fronteira dos dados (D42); a conta do LinkedIn se conecta na
marca e pode servir a mais de uma (D43); o Marco E segue em paralelo (D44).
Regras na §4.30, modelo na §6, decisões D30 a D44. Os tickets são as
sub-issues da #94; o corpo de cada uma é o prompt.

**O corte.** O SDR-115 é o portão: a segunda marca só nasce quando todas as
tabelas de dado são por marca. Até lá, cada ticket é aditivo e não muda nada
para quem tem uma marca só. "Todas as marcas" (a visão consolidada) vem depois
do MVP.

| Onda | Ticket | Issue | Depende de |
|---|---|---|---|
| 16 | SDR-105 As marcas, a marca atual de cada operador e o seletor | #95 | — |
| 17 | SDR-106 Análise, SDR e chat de teste por marca | #96 | 105 |
| 17 | SDR-108 Contas do LinkedIn ligadas a marcas (N:N) | #98 | 105 |
| 17 | SDR-109 Contatos, tags, segmentos e importação por marca | #99 | 105 |
| 17 | SDR-114 Lançamentos por marca | #104 | 105, SDR-74 (#63) |
| 18 | SDR-107 Campanha com marca e o agente pela marca da campanha | #97 | 106, 108, SDR-75 (#64) |
| 18 | SDR-111 WhatsApp e bot do Telegram por marca | #101 | 105, 109 |
| 18 | SDR-117 Acesso por marca na Equipe e avisos para quem tem acesso | #107 | 105, 107, SDR-78 (#67) |
| 19 | SDR-110 O lead do LinkedIn vira contato da marca da campanha | #100 | 107, 109 |
| 19 | SDR-112 Disparos por marca | #102 | 109, 111 |
| 19 | SDR-113 Públicos, prévia, abordagem e listas por marca | #103 | 107, 108 |
| 19 | SDR-116 Configurações divididas em Marca e Organização, com a aba Marcas | #106 | 106, 108, 111 |
| 20 | SDR-115 Criar uma marca em três passos (o portão) | #105 | 106 a 114 e as issues do E que criam tabela de marca já fechadas |
| 20 | SDR-118 Pausar, retomar e arquivar uma marca | #108 | 107, 111, 112, 114 |
| 21 | SDR-119 Todas as marcas: Dashboard e Precisa de você (refinar) | #109 | 115, 117 |
| 22 | SDR-120 Todas as marcas: Chats e Pipeline com selo e filtro (refinar) | #110 | 115, 119 |

Caminho crítico: 105 → 106 → 107 → 113 → 115. As issues do Marco E que ainda
não começaram ganham, no próprio corpo, a seção "Multi-marca (Marco F)" com o
`marca_id` da tabela delas e esperam o SDR-105.

### Contas do LinkedIn na Unipile

O que travou em 16/10/2026 com as contas na Unipile e o que faltava para
operá-las sem mexer no banco à mão. Os tickets são as sub-issues da #113.

| Onda | Ticket | Issue | Depende de |
|---|---|---|---|
| 1 | SDR-126 Abrir a Plataforma para todo e-mail @guessless.com.br e @guessless.ca (§4.14) | #124 | — |
| 2 | SDR-123 Reconectar a conta da casa pela Plataforma (§4.14) | #116 | — |
| 2 | SDR-125 Excluir uma conta do LinkedIn em Configurações, arquivando e preservando o histórico (§4.12) | #118 | — |

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

Do Marco E:

| # | Decisão | Sugestão | Dono |
|---|---|---|---|
| D18 | Data do primeiro lançamento da GuessLess no Kakou | aberta. Ela decide o corte: o código dos 14 tickets do primeiro lançamento cabe em poucos dias, mas as travas (T-4, T-19, T-21) e um ensaio com grupos de teste pedem umas 2 semanas a partir do ok. Com menos, saem a mídia (SDR-101) e o Pixel (SDR-83) | Arthur |
| D19 | Instagram no primeiro lançamento | um ManyChat Pro por fora (US$ 39/mês) na conta da GuessLess, com a palavra-chave levando ao link do Kakou, até o App Review sair (T-18). Sai quando o SDR-90 e o SDR-94 estiverem no ar com o App Review aprovado | Arthur |
| D20 | WhatsApp pela conta da pessoa (Unipile) | ✅ decidido em 16/10: risco aceito, num número separado do da API oficial, só para os grupos, atrás do teste de conexão (T-11). O lançamento não depende dele | Arthur |
| D21 | Onde o SDR responde fora do LinkedIn | ✅ decidido em 16/10: privado do bot do Telegram, DM do Instagram e do Messenger, e grupo do Telegram quando chamado. WhatsApp oficial na janela de 24 h, depois do primeiro lançamento. O número dos grupos e os grupos do WhatsApp, nunca | Arthur |
| D22 | Disparo no Instagram e no Messenger | ✅ decidido em 16/10: fora do Marco E. Fora da janela de 24 h, o Instagram não deixa e o Messenger só pelas Marketing Messages (pagas, com Tech Provider). Medir no primeiro lançamento com Instagram nativo quantas conversas estão com a janela aberta na hora da aula antes de construir | Arthur |
| D23 | Janela da agenda dos grupos | ✅ decidido em 16/10: das 7h à meia-noite, horário de Brasília, e não a dos disparos (D17): "o carrinho fecha à meia-noite" é a mensagem mais importante. Sem intervalo de 24 h, porque grupo não é contato | Arthur |
| D24 | Checkout | Hotmart primeiro: é o que o mercado integra com grupos. Confirmar que é o checkout da GuessLess; a tabela `checkouts` aceita outros depois | Arthur |
| D25 | Preço no lançamento | com o preço informado no lançamento, o SDR responde preço daquele lançamento sem passar para você (§4.7): no dia do carrinho, a equipe vira gargalo. Fora do lançamento, preço continua passando | Arthur |
| D26 | Aviso de hora de mandar (feito por você) | e-mail e Dashboard, e também o bot do Telegram da organização para quem da equipe ligar os avisos (SDR-103): e-mail se perde no celular, e é no celular que o grupo é mandado | Arthur |
| D27 | O que guardar dos grupos | ✅ decidido em 16/10: entradas e saídas sempre; texto só do que chama o SDR, por 90 dias, nunca para treino (termos do Telegram e LGPD) | Arthur |
| D28 | Login da Meta | ✅ decidido em 16/10: um app da GuessLess com Facebook Login for Business para Instagram e Messenger. Consequência: o Instagram do cliente precisa estar ligado a uma Página; quem não tem, não conecta nesta versão | Arthur |
| D29 | Tags do lançamento | ✅ decidido em 16/10: tag do lançamento e tag da origem, nunca uma por grupo (o teto é de 200 tags por organização). Em qual grupo a pessoa está aparece no contato | Arthur |

Do Marco F:

| # | Decisão | Sugestão | Dono |
|---|---|---|---|
| D30 | Papel e acesso | ✅ decidido em 16/10: papel (admin ou operador) por organização, acesso por marca. O admin vê todas; login de cliente e papel por marca ficam para depois | Arthur |
| D31 | Opt-out do LinkedIn entre marcas | ✅ decidido em 16/10: continua global; a outra marca só vê "fora da busca", sem motivo nem origem | Arthur |
| D32 | "Não contatar mais" | ✅ decidido em 16/10: por marca, porque o contato é da marca (o controlador do dado é o cliente) | Arthur |
| D33 | Um alvo, um dono | ✅ decidido em 16/10: continua global, uma régua ativa por pessoa; a outra marca vê "em contato por outra campanha" | Arthur |
| D34 | Cooldown de empresa | ✅ decidido em 16/10: vale também entre marcas no mesmo perfil | Arthur |
| D35 | Conversa fora de campanha num perfil de várias marcas | ✅ decidido em 16/10: fica sem marca e só humano responde; num perfil de uma marca, é dela | Arthur |
| D36 | Desligar a conta de uma marca | ✅ decidido em 16/10: pausa as campanhas da marca naquele perfil, com motivo; religar não retoma | Arthur |
| D37 | Marca sem SDR | ✅ decidido em 16/10: a campanha dela não ativa | Arthur |
| D38 | Criar marca | ✅ decidido em 16/10: três passos (Marca, Análise, SDR); LinkedIn, canais e campanha depois; sem prévia da conta da casa | Arthur |
| D39 | Módulos e limite | ✅ decidido em 16/10: módulos e plano por organização; até `marcas.max_por_organizacao` marcas (padrão 20, palpite) | Arthur |
| D40 | Nome das tabelas | ✅ conferido em 16/10: `marcas`, `acessos_das_marcas` e `marcas_dos_perfis` livres no GL Suite. Ligar a marca à `brands` do GL Suite fica para depois | Arthur |
| D41 | Hotmart | um checkout por marca; a mesma conta da Hotmart em duas marcas fica fora [verificar se a Hotmart aceita um postback por produto] | Arthur |
| D42 | Marca é organização ou fica dentro dela | ✅ decidido em 16/10: dentro da organização, com `marca_id`, e a marca é a fronteira dos dados. O primeiro caso é a GuessLess operando clientes | Arthur |
| D43 | Conta do LinkedIn e marca | ✅ decidido em 16/10: a conta se conecta na marca e pode servir a mais de uma (`marcas_dos_perfis`) | Arthur |
| D44 | Marco F e Marco E em paralelo | ✅ decidido em 16/10: o SDR-105 entra já; as issues do E que ainda não começaram ganham `marca_id` no texto e esperam o 105; a #63 e a #64 terminam como estão | Arthur |

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
| Instagram e Messenger (Meta) | zero: a API não cobra mensagem de conversa nem resposta a comentário |
| ManyChat Pro | US$ 39/mês enquanto o App Review não sai (D19) |
| Número dos grupos (Unipile) | uma conta a mais, dentro das 10 do plano de €49 |
| Claude API · SDR nos canais | como no LinkedIn, por conversa (centavos) |
| Supabase Storage | a mídia da agenda, menos de 1 GB por lançamento (palpite) |

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
