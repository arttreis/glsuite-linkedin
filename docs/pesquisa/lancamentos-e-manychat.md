# Lançamentos por grupo e ManyChat: o que o mercado entrega

Pesquisa nos sites, centrais de ajuda e páginas de preço de cada ferramenta, e nas FAQs e docs
da Meta e do Telegram, 16/10/2026. Objetivo: desenhar o MVP do Kakou para gerenciar lançamento
de infoproduto (captação → grupos de WhatsApp/Telegram → CPLs → abertura de carrinho →
fechamento), com a GuessLess como primeiro cliente, sem copiar feature à toa.

Números de clientes são declarados pelas próprias empresas. Não há ranking independente. Nem a
[Hotmart](https://help.hotmart.com/pt-br/article/115001757372/como-conecto-as-ferramentas-e-provedores-de-integracao-na-minha-conta-hotmart-)
nem a [Kiwify](https://ajuda.kiwify.com.br/pt-br/category/integracoes-1633r3w/) listam
ferramenta de grupos como integração oficial. Na [App Store da Eduzz](https://store.eduzz.com/)
aparece só o Whatsflow (li a 1ª de 3 páginas).

## As ferramentas de grupos

| Ferramenta | Por que entrou | Modelo |
|---|---|---|
| [SendFlow](https://sendflow.com.br/) | A mais completa. Integra Hotmart, Kiwify e Eduzz. | Conecta número (WhatsApp Web) |
| [Meu Grupo Vip](https://meugrupovip.com.br/) | "A automação Nº1 para empreendedores, experts e negócios digitais". Declara 89K+ grupos. | Conecta número ("instâncias") |
| [JoinZapp](https://joinzapp.io/new/) | "a ferramenta oficial do Lançamento Meteórico!". "mais de 3 bilhões de redirecionamentos". | Conecta número ("1 Celular Conectado") |
| [Devzapp Grupos](https://www.devzapp.com.br/grupos-v3) | "milhares de empresas em mais de 58 países". | Conecta número ("1 celular conectado") |
| [Grupos Inteligentes](https://gruposinteligentes.com/) | "15.000+" "Lançamentos gerenciados de ponta a ponta". | Só link, não conecta número |

Ficaram de fora: [Whatsflow](https://whatsflow.com.br/) (atendimento com grupos de lado; não
detalha link, abrir/fechar nem métricas), [Grupzap](https://www.grupzap.com/),
[Grupify](https://www.grupify.com.br/) (só link), [Lastlink](https://lastlink.com/) (comunidade
paga: "pagou entrou, cancelou saiu"). Os nomes da pauta não se confirmaram como gestor de
grupos: [ZapGrupos](https://zapgrupos.com.br) é diretório de grupos;
[Leadster](https://leadster.com.br/) é chatbot de site; Clint é CRM e só tem
[artigo](https://www.clint.digital/artigos/como-exportar-contatos-do-grupo-do-whatsapp) sobre
grupo; Grupos.Pro parece domínio estacionado. O Whats.ly (Empreender) tem link por cliques,
criação de grupo, agendamento e "Restringir mensagens", a R$ 97/mês, mas "não é possível utilizar
o Whats.Ly sem ter uma loja virtual… integração exclusiva com a Nuvemshop"
([ajuda](https://whatsly.sak.com.br/tem-como-usar-o-whatsly-sem-ter-uma-loja-virtual)). O
[Botconversa](https://botconversa.com.br/) é atendimento com IA e CRM; a home não fala de grupos.

## Features × ferramentas

Legenda: **sim** (a página diz), **não** (a página não diz ou o modelo não permite),
[verificar] (citado sem detalhe).

| Feature | SendFlow | Meu Grupo Vip | JoinZapp | Devzapp | Grupos Inteligentes | Classe |
|---|---|---|---|---|---|---|
| Link que distribui entre grupos | sim; conta clique ou membro real; cookie "impede que um lead entre em múltiplos grupos" (app) | sim, "por cliques" | sim | sim (1, 4 ou 8 links por plano) | sim | **básico** |
| Limite por grupo configurável | sim, "Limite de pessoas" (app) | [verificar] | [verificar] | [verificar] | sim, "de 1 a 1.024" | básico [verificar] |
| Criação automática de grupos | sim, grupos e comunidades | sim, com "grupos de reserva" | sim | sim (plano Black) | não | **básico** (de quem conecta número) |
| Mensagem agendada em todos os grupos | sim: texto, áudio, foto, vídeo, arquivo, evento; áudio "Enviar com gravação" (app) | sim | sim: texto, áudio, "mensagens de voz", vídeo | sim, "áudios… que parecem gravados na hora" | não | **básico** (de quem conecta número) |
| Fechar/abrir grupo (só admins) | sim, "Fechar Grupos", "Abrir Grupos", "Criar grupo aberto e fechar depois de 24h" (app) | não | sim, "Abertura e fechamento automatizada" | não | não | diferencial |
| Nome/descrição/foto em massa | sim, "Alterar grupos em lote" (app) | "Edite todos os Grupos de uma Vez" | sim | sim, "em 1 clique" | renomeia em lote | **básico** |
| Boas-vindas | sim, no grupo | só "ao Lotar o Grupo" | no privado (e para quem saiu) | sim, ao entrar | não | **básico** |
| Remoção | compradores; duplicados; antispam e blacklist (app) | quem está em mais de um grupo; blacklist de golpistas | não | blacklist, whitelist, aprovação | não | quase básico |
| Métricas | "Entradas e saídas por dia", "Cliques por grupo", UTM por clique, Pixel; só 90 dias (app) | "Relatórios Completos" | entrada, saída, cliques por lead | entrada e saída | vagas preenchidas; Pixel, GA4, UTM | **básico**: entrada/saída. Diferencial: origem/UTM |
| Checkout marca comprador | Hotmart: põe comprador no grupo VIP e "remove quem cancelar, pedir reembolso" (app); Kiwify e Eduzz [verificar] | não | Hotmart, Eduzz, Monetizze [verificar se marca] | genérico, via API | [verificar] | diferencial |
| Comunidade do WhatsApp | sim, importa o grupo de avisos (app) | [verificar] | agenda em comunidades | sim | [verificar] | quase básico |
| Telegram | não (nenhuma tela; rotas em `/whats/`) | não | não | não | não | **ninguém tem** |
| Lista de espera quando tudo lota | [verificar] | não | não | não | sim (plano Escalável) | diferencial |
| Conexão | WhatsApp Web por QR; agora extensão "SendFlow Bridge", porque a passkey "inviabiliza a conexão tradicional via QR Code em nossos servidores" (app) | instâncias de WhatsApp | celular conectado; "não possuímos qualquer… vínculo com o WhatsApp" | celular conectado | sem número; QR "ainda está em teste" | — |
| Preço público | R$ 1.125/6 meses (1 número) a R$ 5.000/ano (5 números), condição de Black Friday "válida até o dia 18 de Outubro" | R$ 1.697 a R$ 4.397/ano; só link: R$ 79,90/mês | R$ 269/mês | R$ 197 a R$ 697/mês | R$ 27, R$ 67 ou R$ 167/mês | — |

A SendFlow não tem central de ajuda pública (`sendflow.pro/ajuda` dá 404). O que está marcado
"(app)" é texto de tela lido nos arquivos JS públicos do [app](https://sendflow.pro/login) em
16/10/2026. Não é documentação e muda a cada versão.

Fontes por coluna: SendFlow, [home](https://sendflow.com.br/) e
[termos](https://sendflow.pro/termo-de-uso); Meu Grupo Vip,
[home](https://meugrupovip.com.br/) (o texto só aparece com JS); JoinZapp,
[new](https://joinzapp.io/new/) e [principal](https://joinzapp.io/principal/); Devzapp,
[grupos-v3](https://www.devzapp.com.br/grupos-v3); Grupos Inteligentes,
[home](https://gruposinteligentes.com/), [redirecionador](https://help.gruposinteligentes.com/features/redirector),
[monitoramento](https://help.gruposinteligentes.com/features/whatsapp-monitoring/) e
[atualização de participantes](https://help.gruposinteligentes.com/features/automatic-update-participants/).

**O básico do mercado:** um link fixo que distribui entre grupos; criação de grupo de reserva;
mensagem agendada (texto, mídia e áudio como se fosse gravado na hora) em todos os grupos de uma
vez; nome, descrição e foto em lote; boas-vindas; relatório de entrada e saída.

**Diferencial:** abrir/fechar o grupo por agenda (SendFlow, JoinZapp); marcar e remover
comprador pelo checkout (SendFlow); origem/UTM e Pixel por clique (SendFlow, Grupos
Inteligentes); lista de espera quando tudo lota (Grupos Inteligentes); lead scoring (SendFlow).
Antispam e remoção de duplicados estão virando básico (SendFlow, Meu Grupo Vip, Devzapp).
**Ninguém** faz Telegram.

## Como o link enche grupos, e por onde a ferramenta fala com o WhatsApp

- **O link.** Um endereço próprio (`dominio/g/lancamento`) manda cada visitante para o
  `chat.whatsapp.com/<código>` do grupo da vez. Quando o grupo enche, passa ao próximo.
  Um projeto aberto descreve o padrão: "sends each visitor to the next WhatsApp group with room",
  estratégias "fill… or balance", e quando tudo lota "auto-create the next group… or redirect to
  a fallback URL" ([WA-AKG PR #1](https://github.com/Sveci/WA-AKG/pull/1)). Se é HTTP 302 ou
  página intermediária: [verificar].
- **Contar clique.** O [Redir](https://assine.redir.app.br/) troca de grupo após N cliques e "não
  precisa de acesso ao seu WhatsApp". Sem risco de ban, mas clique não é entrada: clique repetido,
  robô de prévia de link e desistência enchem o contador antes da hora (inferência). O Whats.ly
  cai nisso quando não sincroniza: passa a "contabilizar cliques ao invés de participantes"
  ([ajuda](https://whatsly.sak.com.br/o-que-acontece-se-tiver-clics-sobrando-e-o-grupo-ja-estiver-cheio)).
  A SendFlow, por padrão, marca o grupo como cheio "quando a quantidade de cliques supera o
  limite", e deixa trocar para "a quantidade real de participantes" (app).
- **Contar membro.** Exige um número admin conectado lendo os participantes. A Z-API, usada por
  baixo por várias ferramentas, entrega isso: criar grupo, link de convite, `adminOnlyMessage`,
  nome/foto/descrição, comunidades e webhooks `GROUP_PARTICIPANT_ADD`/`LEAVE`
  ([doc](https://developer.z-api.io/group/update-group-settings.md),
  [webhooks](https://developer.z-api.io/webhooks/on-message-received-examples.md)). Mas é "uma
  sessão do WhatsApp Web" ([z-api](https://developer.z-api.io/)), e ela mesma avisa sobre
  banimento: "SIM, A POSSIBILIDADE EXISTE, E É REAL"
  ([dica](https://developer.z-api.io/tips/blockednumber.md)).
- **Quem conecta número joga o ban para o cliente.** Termos da SendFlow, §16: "bloqueios,
  banimentos… feitas pelo próprio WhatsApp, não é responsabilidade da Sendflow"
  ([termos](https://sendflow.pro/termo-de-uso)). A home diz o contrário, que "Usar o SendFlow não
  traz riscos ao seu chip" ([home](https://sendflow.com.br/)). No app, trocar os links após um
  ban exige "outra conta associada na campanha que seja administradora dos grupos", e renovar
  link mais de 2 vezes por dia "pode aumentar o risco de banimento" (app).
- **A API oficial não serve para grupo de lançamento.** A Groups API da Cloud API tem "Max group
  participants: 8", só para conta oficial (OBA), entrada só por convite
  ([overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/)).
- **Os Termos proíbem o resto.** "bulk messaging, auto-messaging" e acesso "through automated or
  other means" ([termos](https://www.whatsapp.com/legal/terms-of-service)). O WhatsApp diz que
  processa quem vende a ferramenta, com base em "public claims from companies about their ability
  to use WhatsApp in ways that violate our Terms"
  ([FAQ](https://faq.whatsapp.com/5957850900902049/?lang=en)). Já processou duas empresas
  brasileiras de disparo, com multa de R$ 50 mil por dia
  ([Tecnoblog, 2020](https://tecnoblog.net/noticias/whatsapp-processa-empresas-de-disparo-em-massa-no-brasil/)).
  Ban sem opção de revisão "is final" ([FAQ](https://faq.whatsapp.com/465883178708358/?lang=en)).
- **Limites do WhatsApp que mudam o desenho.**
  - Grupo: "up to 1024 members" ([FAQ](https://faq.whatsapp.com/841426356990637/?cms_platform=web&lang=en)).
  - Comunidade: até 100 grupos, mas "up to 2,000 members" no total, avisos incluídos. E "You
    can't currently create a community on the WhatsApp Business app"
    ([FAQ](https://faq.whatsapp.com/438859978317289/?cms_platform=android&lang=en)). Uma
    comunidade não segura nem dois grupos cheios.
  - Link redefinido não volta: "the previous link can't be restored"
    ([FAQ](https://faq.whatsapp.com/3242937609289432/?cms_platform=android&lang=en)).
  - Evento de grupo: "New members can't see events created before they joined"
    ([FAQ](https://faq.whatsapp.com/3313983622238973/?cms_platform=android&lang=en)).
- **O Telegram faz tudo isso pela API oficial**
  ([Bot API](https://core.telegram.org/bots/api#createchatinvitelink)).
  - `createChatInviteLink` com `member_limit` (1 a 99.999): é o "link que enche" nativo.
  - `chat_member` traz o `invite_link` usado: entrada e saída por origem.
  - `setChatPermissions` fecha o grupo; `setChatTitle`, `setChatDescription`, `setChatPhoto`.
  - O bot precisa ser admin. Não cria grupo (não há método na Bot API). Em grupo, "not… more
    than 20 messages per minute" ([FAQ](https://core.telegram.org/bots/faq)).
  - Grupo até "200,000 members" ([FAQ](https://telegram.org/faq)).

## ManyChat no Instagram e no Messenger

O manychat.com responde 403 para leitura automática. O help center foi lido pela API pública do
Zendesk dele. Os links abaixo são os dos artigos.

| Gatilho | Instagram | Messenger/Facebook | Fonte |
|---|---|---|---|
| Palavra-chave em comentário | post/reel específico, todos, ou "Next post or reel" | qualquer post ou um específico, inclusive agendado | [IG](https://help.manychat.com/hc/en-us/articles/14281316989724-Instagram-Post-and-Reel-Comments-trigger), [FB](https://help.manychat.com/hc/en-us/articles/14281386567836-Facebook-Comments-Trigger) |
| Comentário em live | sim, só com a live no ar | sim | [IG Live](https://help.manychat.com/hc/en-us/articles/14281275933724-Instagram-Live-Comments-Trigger) |
| Comentário em anúncio | só post que existe no perfil ("purely as an ad… won't be available") | "ad posts, dark posts, boosted posts" | [IG](https://help.manychat.com/hc/en-us/articles/14281316989724-Instagram-Post-and-Reel-Comments-trigger), [FB](https://help.manychat.com/hc/en-us/articles/14281386567836-Facebook-Comments-Trigger) |
| Resposta pública no comentário | sim, com variações sorteadas | sim, mais curtida | idem |
| DM depois do comentário | sim (private reply) | obrigatória | idem |
| Checa se segue / "follow to unlock" | sim, campo "Follows your Instagram account" (plano pago) | — | [Grow followers](https://help.manychat.com/hc/en-us/articles/20310878273692-Quick-Automation-Grow-followers-from-comments), [System Fields](https://help.manychat.com/hc/en-us/articles/14281292522652-System-Fields) |
| DM para quem acabou de seguir | beta; "only one Follow to DM message per user per week" | — | [Follow to DM](https://help.manychat.com/hc/en-us/articles/23096654243740-Follow-to-DM-on-Instagram-Say-Hi-to-New-Followers-BETA) |
| Resposta a story | todos ou um story específico; não dispara com curtida | — | [Story Reply](https://help.manychat.com/hc/en-us/articles/13556930006428-Instagram-Story-Reply-Trigger) |
| Menção em story | só de perfil público | — | [Story Mention](https://help.manychat.com/hc/en-us/articles/14281309502108-Instagram-Story-Mention-Reply-trigger) |
| Palavra-chave na DM | is, contains, begins with… ou intenção por IA | idem | [Keywords](https://help.manychat.com/hc/en-us/articles/14281211785884-How-to-use-Keywords-Trigger-in-Manychat) |
| Link com ref | `ig.me/m/conta?ref=...`, só no app | `m.me/...?ref=` | [IG Ref URL](https://help.manychat.com/hc/en-us/articles/14281276006684-Instagram-Ref-URL-Trigger) |

- **Coleta de e-mail e telefone.** Bloco Data Collection, "available on paid Manychat plans"
  ([doc](https://help.manychat.com/hc/en-us/articles/18362925739932-Data-Collection-Block)). O
  botão pré-preenchido da Meta "do not appear on Instagram", só no Messenger
  ([troubleshooting](https://help.manychat.com/hc/en-us/articles/14281308423452-Instagram-automation-troubleshooting)).
- **Integrações.** Hotmart nativa (carrinho abandonado, status da compra), mas só para quem já é
  contato ([doc](https://help.manychat.com/hc/en-us/articles/14281257928732-Hotmart-integration)).
  Kiwify: nada no help center [verificar]. Sheets, Zapier e External Request nos planos pagos.
- **Sequências.** Drip com atraso e faixa de horário
  ([doc](https://help.manychat.com/hc/en-us/articles/14281202572316-Setting-up-Manychat-Sequences)).

### Regras da Meta que o ManyChat segue

- **Uma DM por comentário**, e só no primeiro comentário da pessoa ("limitation on Instagram's
  side", [IG](https://help.manychat.com/hc/en-us/articles/14281316989724-Instagram-Post-and-Reel-Comments-trigger)).
  A Meta: "Only one message can be sent to the commenter", "within 7 days of the creation time of
  the comment" ([private replies](https://developers.facebook.com/docs/instagram-platform/private-replies)).
- **A DM do comentário não abre a janela de 24 h.** Abre "only after the user interacts". Essa
  primeira DM é um bloco só, sem pergunta e sem atraso (mesma página do ManyChat).
- **Fora da janela de 24 h, nada automático.** O ManyChat bloqueia sozinho. A tag Human Agent
  (7 dias) vale só para mensagem manual pelo Inbox
  ([janelas](https://help.manychat.com/hc/en-us/articles/23358636027932-Understanding-messaging-windows),
  [fora da janela](https://help.manychat.com/hc/en-us/articles/14281199732892-How-to-send-messages-outside-the-24-hour-and-7-day-windows-in-Messenger-and-Instagram)).
- **Messenger perdeu as saídas antigas.** Message Tags acabaram em 09/02/2026. Recurring
  Notifications foram trocadas por Marketing Messages, pagas e em poucos países
  ([doc](https://help.manychat.com/hc/en-us/articles/24351480518684-Marketing-Messages-on-Messenger)).
- **Teto da Meta:** private replies a 750 por hora por conta
  ([rate limits](https://developers.facebook.com/docs/graph-api/overview/rate-limiting)). Os
  "200 DMs/h" que circulam vêm só do fórum: [verificar].

### O que o ManyChat não faz

- **DM fria.** A Meta só deixa mandar mensagem depois que a pessoa escreve
  ([Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api)).
  As exceções são a resposta a comentário e o Follow to DM.
- **Disparo fora da janela.** Broadcast no Instagram nem aparece na lista de canais
  ([broadcast](https://help.manychat.com/hc/en-us/articles/14281228205212-Broadcasting-in-Manychat-Connecting-with-your-audience-at-scale)).
- **Conta pessoal.** "Personal accounts can't be used"
  ([conectar IG](https://help.manychat.com/hc/en-us/articles/14281290924444-How-to-connect-Instagram-to-Manychat)).
- **Grupo.** Não pega post em grupo do Facebook nem em perfil pessoal
  ([FB](https://help.manychat.com/hc/en-us/articles/14281386567836-Facebook-Comments-Trigger)).

### Preço (modelo novo, desde 02/03/2026, por contato ativo no mês)

| Plano | Mensal | Anual | Contatos ativos | Excedente |
|---|---|---|---|---|
| Free | US$ 0 | US$ 0 | 25 | — |
| Essential | US$ 17 | US$ 14 | 250 | US$ 0,10 |
| Pro | US$ 39 | US$ 29 | 2.500 | US$ 0,05 |
| Business | US$ 99 | US$ 69 | 7.500 | US$ 0,025 |
| Advanced | US$ 199 | US$ 139 | 25.000 | US$ 0,004 |

Fontes: [Essential](https://help.manychat.com/hc/en-us/articles/25800276116508-Essential-plan),
[Pro](https://help.manychat.com/hc/en-us/articles/25800228332572-Pro-plan),
[Active Contacts](https://help.manychat.com/hc/en-us/articles/25800323349020-Active-Contacts),
[pricing, snapshot de 09/10/2026](https://web.archive.org/web/20261009114350/https://manychat.com/pricing).
Checar seguidor e taggear exigem o Essential. Preço em reais: "determined by the user's billing
country" [verificar].

## O que dá errado em lançamento por grupo

- **Grupo cheio sem próximo.** "o link de convite do grupo 'cai' para novos participantes", e
  quando não há link novo "todas as campanhas e chamadas que dependiam desse endereço quebram"
  ([Grupos Inteligentes, 02/2026](https://gruposinteligentes.com/en/blog/motivos-links-grupos-caindo-como-evitar/)).
- **Número banido no meio.** "O medo de perder chips bloqueados é real em grandes lançamentos"; a
  saída é ter admins reserva ([Grupos Inteligentes, 06/2026](https://gruposinteligentes.com/pt-br/blog/whatsapp-lancamentos-11-praticas-para-nao-perder-vendas/)).
  Reclamações de ban no Reclame Aqui subiram 152% em 2026, para "9.978"
  ([Tecnoblog, 09/2026](https://tecnoblog.net/noticias/whatsapp-banido-reclamacoes-sobre-bloqueios-de-contas-sobem-152/)).
- **Ban leva a base junto.** "não existe exportação nativa da lista de membros de um grupo";
  recomenda co-admin humano e links salvos fora do celular
  ([Achadinho Pro](https://achadinho.pro/blog/tomou-ban-como-recuperar-o-numero-e-proteger-a-audiencia/)).
- **Gente sai ou silencia.** "a taxa de evasão bate picos históricos"; a última mensagem é vista
  por "menos de 30%" em público frio, que tende a "arquivar e manter silenciado"
  ([Agência 365, 03/2026](https://agencia365.com.br/artigos/grupo-whatsapp-lancamento)).
  Fonte que ligue a saída à abertura do carrinho: não achei [verificar].
- **Spam e golpe.** "Abrir antes sem moderação arrisca caos, desinformação e ataques de spam"
  (Agência 365, mesma página). Há relato de falso vendedor cobrando por Pix dentro de grupo de
  curso ([Reclame Aqui](https://www.reclameaqui.com.br/ticto/no-grupo-whatsapp-me-ligou-e-me-enganou_xyrAWf_G9f1qjAIJ/),
  [verificar] trecho). É por isso que Meu Grupo Vip e Devzapp vendem blacklist.
- **Exposição de números.** Grupo com desconhecidos "exceeds the limits of confidentiality"
  ([Hotmart](https://hotmart.com/en/blog/selling-on-whatsapp)). Fechar o grupo não esconde o
  número de quem entrou.

## O que isso sugere para o MVP do Kakou

**Tem que ter no primeiro lançamento**

- **Link rotativo por lançamento, contando clique, sem conectar número.** O operador cola os
  `chat.whatsapp.com` dos grupos e define o limite. É o básico de todo o mercado, e pela via que
  não arrisca o número nem a GuessLess.
- **Alerta de grupo quase cheio e página de espera quando tudo lota.** "Grupo cheio sem próximo"
  é a falha que derruba campanha paga. A página de espera ainda captura o contato.
- **Origem gravada no clique (UTM e Pixel).** O mercado mede entrada por grupo, mas só SendFlow
  e Grupos Inteligentes medem por origem. É o que a GuessLess vende como agência.
- **Telegram completo pelo bot.** `member_limit`, entrada e saída por origem, abrir/fechar, nome
  e foto, agendamento. Tudo oficial, e nenhuma ferramenta brasileira faz.
- **Comprador marcado pelo webhook do checkout.** Gera tag no contato e o tira dos envios de
  carrinho. Hoje só o SendFlow faz, e é o que evita cobrar quem já pagou.

**Depois**

- **Comentário no Instagram → resposta pública + DM com o link.** No primeiro lançamento, um
  ManyChat Pro (US$ 39/mês) apontando para o link do Kakou resolve. A Meta limita a uma DM por
  comentário, em até 7 dias, sem abrir janela.
- **Agenda do lançamento por fase, via template oficial no 1:1.** CPL no ar, carrinho aberto,
  última chamada, para o segmento do lançamento. O disparador já existe. O que falta é amarrar ao
  calendário.
- **Saídas por fase no painel** (antes e depois da abertura do carrinho). A dor é citada, mas sem
  número; medir primeiro no Telegram, onde o dado é oficial.

**Não fazer**

- **Conectar número por QR (Z-API, Baileys) para automatizar grupo de WhatsApp.** É o que dá
  agendamento e contagem real, mas os Termos proíbem, o ban é final, e o WhatsApp processa quem
  vende a ferramenta. E o QR está ficando mais difícil: a SendFlow já precisou trocar por
  extensão de navegador por causa da passkey.
- **Groups API oficial para o lançamento.** São 8 participantes por grupo.
- **Comunidade do WhatsApp como casa do lançamento.** São 2.000 membros no total, e não dá para
  criar comunidade no app Business.
- **DM fria ou disparo fora da janela no Instagram e no Messenger.** A Meta não permite. Nem o
  ManyChat faz.

A pergunta que isto deixava para o Arthur: sem conexão por QR, a mensagem agendada nos grupos de
WhatsApp (o básico do mercado) fica manual, e o Kakou deixa a mensagem pronta e lembra o operador
na hora. Respondida no épico (D20, 16/10/2026): ele aceitou o risco da conexão pela Unipile, num
número separado e atrás de um teste de conexão (T-11); o modo manual ("feito por você") é o padrão
do lançamento e funciona sem o número.
