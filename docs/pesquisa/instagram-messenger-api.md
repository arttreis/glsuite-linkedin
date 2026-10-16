# Instagram e Messenger (Meta): o que o Kakou pode usar

Pesquisa nas fontes primárias da Meta (developers.facebook.com), 16/10/2026. Objetivo: base para o
Kakou atender DM no Instagram e no Messenger da Página, responder comentário com DM ("estilo
ManyChat"), fazer disparos e moderar comentários, tudo com **um app da Meta da GuessLess** para
todas as organizações.

A documentação está em `developers.facebook.com/documentation/...`. Toda página tem versão em
markdown (acrescente `.md`). Índices usados:
[raiz](https://developers.facebook.com/llms.txt),
[Instagram Platform](https://developers.facebook.com/documentation/instagram-platform/llms.txt),
[Instagram Messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/llms.txt),
[Messenger Platform](https://developers.facebook.com/documentation/business-messaging/messenger-platform/llms.txt)
e [Pages API](https://developers.facebook.com/documentation/pages-api/llms.txt).

Duas páginas importantes não abrem fora do navegador (só renderizam com JavaScript ou dão 404 no
`.md`): a referência da Send API do Messenger e a página "Marketing Messages" do índice do
Instagram Messaging. O que dependia delas está marcado `[verificar]`.

## Mapa rápido

| O que o Kakou quer | Instagram | Messenger (Página) |
|---|---|---|
| SDR responde DM | Sim, até 24 h depois da última mensagem da pessoa | Sim, até 24 h depois da última mensagem da pessoa |
| Comentário com palavra-chave → DM | Sim: Private Reply, 1 mensagem, até 7 dias depois do comentário | Sim: Private Reply, 1 mensagem, até 7 dias |
| Resposta pública no comentário | Sim (`POST /{comment-id}/replies`) | Sim (`POST /{comment-id}/comments`) |
| Disparo para lista | Só para quem falou nas últimas 24 h. Fora disso não achei caminho oficial | Dentro de 24 h, ou pela Marketing Message API (paga, opt-in, só Tech Provider) |
| Ler, ocultar, apagar comentário | Sim | Sim |
| Grupo / canal de transmissão | Não há API | Groups API removida em 22/04/2024 |

## Versão da Graph API

O changelog do Messenger diz "The latest version is: v26.0"
([changelog](https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog)).
Os exemplos da doc do Instagram e do Messenger usam v25.0. A versão vai no caminho, como no
WhatsApp (`docs/pesquisa/whatsapp-cloud-api.md`).

## Instagram: dois caminhos de integração

Fonte principal: [Instagram Platform overview](https://developers.facebook.com/documentation/instagram-platform/overview).

| | Instagram API with Instagram Login | Instagram API with Facebook Login for Business |
|---|---|---|
| Conta | Profissional (Business ou Creator) | Profissional ligada a uma Página do Facebook |
| Página do Facebook | Não precisa | Obrigatória; o usuário precisa ter tarefas na Página |
| Login do cliente | Credenciais do Instagram ([Business Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)) | Credenciais do Facebook ([Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)) |
| Token | Instagram User | Facebook User ou Page |
| Host | `graph.instagram.com` | `graph.facebook.com` |
| Mensagens | Sim, direto | Sim, "via Messenger Platform" ([Instagram Messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/overview)) |
| Comentários, menções, Private Replies | Sim | Sim |
| Não tem | Anúncios, tags de produto, hashtag | — |

Regras que pesam na arquitetura:

- "You can only add one setup per app. If you want to implement both setups, create an app for
  each setup" ([caso de uso Instagram](https://developers.facebook.com/documentation/development/create-an-app/instagram-use-case)).
  A [página de App Review](https://developers.facebook.com/documentation/instagram-platform/app-review)
  repete: "Your app can either use Facebook Login or Instagram Login but not both".
- O Messenger da Página só existe com Facebook Login for Business
  ([Messenger overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)).
  Logo, **um app só para Instagram e Messenger implica Facebook Login for Business nos dois**. Com
  Instagram Login, o Messenger vai para um segundo app.
- Recomendação da Meta: não há uma só. O [guia de migração](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/migration-guide)
  defende o Instagram Login: o onboarding caiu "from an average of 12 steps to just two", com
  "significant improvement in onboarding success rates". O Facebook Login for Business é "the
  preferred authentication [...] for tech providers" que integram as ferramentas de negócio da Meta
  ([FBL4B](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)).
- Conta Creator no caminho do Messenger: "must send an API request using the Instagram
  Conversations API before the account can receive webhooks"
  ([IG Messaging overview](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/overview)).
- No caminho do Messenger, a conta precisa ligar "Allow Access to Messages" em Configurações >
  Mensagens > Ferramentas conectadas
  ([get started](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started)).
  Sem isso, erro `200`/`2534041`.

### Permissões

| Uso | Instagram Login | Instagram via Facebook Login | Messenger (Página) |
|---|---|---|---|
| Base | `instagram_business_basic` | `instagram_basic`, `pages_show_list`, `pages_read_engagement`, `business_management` | `pages_show_list`, `pages_manage_metadata`, `business_management` |
| DM | `instagram_business_manage_messages` | `instagram_manage_messages`, `pages_manage_metadata` | `pages_messaging` |
| Comentários e Private Reply | `instagram_business_manage_comments` | `instagram_manage_comments`, `pages_read_engagement` (+ `ads_management` ou `ads_read` se o papel na Página veio do Business Manager) | `pages_manage_engagement`, `pages_read_engagement`, `pages_read_user_engagement` (comentar); `pages_messaging` (Private Reply) |
| Fora da janela por humano | feature Human Agent | feature Human Agent | feature Human Agent |
| Nome e foto de quem manda DM | já vem com as permissões de DM | já vem com as permissões de DM | feature Business Asset User Profile Access |

Fontes: [overview](https://developers.facebook.com/documentation/instagram-platform/overview),
[private replies](https://developers.facebook.com/documentation/instagram-platform/private-replies),
[comment moderation](https://developers.facebook.com/documentation/instagram-platform/comment-moderation),
[Messenger overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview),
[comentários na Página](https://developers.facebook.com/documentation/pages-api/comments-mentions),
[perfil no Messenger](https://developers.facebook.com/documentation/business-messaging/messenger-platform/identity/user-profile).

- As `business_*` antigas (`business_basic`, `business_manage_messages`…) deixaram de valer em
  27/01/2025. Usar só os nomes `instagram_business_*`.
- `business_management` é dependência de `pages_messaging`, `pages_show_list` e
  `instagram_manage_messages`, e precisa ser explicada no App Review.
- Quem gera o token de Página precisa das tarefas `MESSAGING` e `MODERATE` na Página.
- A página da Private Reply do Instagram Messaging pede `instagram_manage_comments` e
  `pages_messaging`, além da feature Human Agent
  ([IG Messaging private replies](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies)).
  A da Instagram Platform pede `instagram_basic`, `instagram_manage_comments` e
  `pages_read_engagement`. A lista certa: [verificar].

## Janela de mensagens

**Regra geral.** "A person must initiate the conversation". O app tem 24 h para responder
([Messenger overview](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview)).
"Messages sent within the 24 hour window may contain promotional content"
([send messages](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages)).

O que abre a janela (mesma página):

- a pessoa manda mensagem para a Página ou para a conta do Instagram;
- toca num botão como Get Started, num ice breaker ou no menu persistente;
- clica num anúncio Click-to-Messenger/Direct e manda mensagem;
- abre um link `m.me` ou `ig.me` para uma conversa que já existe;
- reage a uma mensagem;
- "comments on a post on your Page or Instagram Professional account" (ver a contradição em
  Private Replies);
- publica um post de visitante na Página.

`messaging_type`: `RESPONSE` (resposta), `UPDATE` (proativa, dentro da janela), `MESSAGE_TAG`
(fora da janela, com tag) e `UTILITY` (template de utilidade do Messenger)
([page/messages](https://developers.facebook.com/docs/graph-api/reference/page/messages)).

**Tag `HUMAN_AGENT`.**

- "For a message sent to a customer from a human agent in response to the customer's
  inquiries", até 7 dias depois da última mensagem da pessoa. "Only `HUMAN_AGENT` is available for
  Instagram Messaging" ([page/messages](https://developers.facebook.com/docs/graph-api/reference/page/messages)).
- É uma feature com App Review e verificação do negócio. Uso permitido: suporte humano quando o
  caso não se resolve em 24 h, "when the business is closed for the weekend"
  ([Human Agent](https://developers.facebook.com/documentation/development/features-reference/human-agent)).
- No App Review, "Only request this feature if you have a custom inbox solution" e explique "why it
  can take someone up to 7 days to reply"
  ([apps for other businesses](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/app-review/apps-for-other-businesses)).
- Conclusão: **só humano**. O SDR de IA não pode usar a tag.

**Fora da janela.** Mensagem livre falha: Instagram `10`/`2534022`, Messenger `10`/`2018278`, "This
message is sent outside of allowed window"
([error codes](https://developers.facebook.com/documentation/business-messaging/messenger-platform/error-codes)).
Mandar várias vezes com tag dispara `613`/`2018338` ("You must significantly decrease the rate").

**O que existe (ou existia) para mandar fora da janela:**

| Recurso | Messenger | Instagram | Situação |
|---|---|---|---|
| Tags `CONFIRMED_EVENT_UPDATE`, `ACCOUNT_UPDATE`, `POST_PURCHASE_UPDATE` | Tinha | Nunca teve | Desde 27/04/2026 devolvem erro `100`. Substituto: templates de utilidade ou Marketing Messages ([changelog, 27/03/2026](https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog)) |
| Utility templates (`messaging_type: UTILITY`) | Sim, sem conteúdo de marketing, permissão `page_utility_messaging` | Não | Ativo ([utility messages](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/utility-messages)) |
| One-time Notification | Sim, 1 mensagem por opt-in, token válido até 1 ano | "not available for IG Messaging API" | Ainda "Beta" na [política](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy). Se segue ativo: [verificar] |
| Sponsored Messages | Tinha | Não | Descontinuado em 31/07/2024 ([FAQ MM](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/faq)) |
| Recurring Notifications (antigo "Marketing Messages", com opt-in no chat) | Sim | Sim (havia limites próprios do Instagram) | Fim de integrações novas em 01/09/2025; descontinuado em 10/02/2026, exceto AU, UE, JP, KR e UK ([FAQ MM](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/faq), [página antiga](https://developers.facebook.com/docs/messenger-platform/marketing-messages)) |
| Marketing Message API for Messenger | Sim | Não | Ativo, ver abaixo |

**Instagram não tem equivalente que eu tenha confirmado.** O índice do Instagram Messaging ainda
lista "Marketing Messages" e "Ways to Get Opt-Ins", mas as duas páginas dão 404 (16/10/2026). A
página nova de Marketing Messages é só do Messenger. Hoje, no Instagram, fora da janela só sai
`HUMAN_AGENT` [verificar se existe produto novo para Instagram].

### Marketing Message API for Messenger

Fontes: [visão geral](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger),
[get started](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/get-started),
[envio](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/send-messages),
[público](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/grow-marketing-messages-audience),
[FAQ](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/faq),
[changelog](https://developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger/changelog).

- **Quem usa:** "available exclusively to tech providers" com App Review aprovado em
  `ads_management`, `pages_messaging` e `paid_marketing_messages` (ou
  `marketing_messages_messenger`), todas com Advanced Access. O app precisa estar em Live, ter
  Messenger, Facebook Login for Business e a feature Marketing API Access Tier. Só app web.
- **Brasil:** está na lista de países das empresas atendidas. Destinatários: todos os países menos
  UE, Japão, Coreia do Sul, Austrália e Reino Unido. Aberto a todos os Tech Providers desde
  01/07/2025.
- **Opt-in** (só para quem aceitou):
  - quem clica e responde um anúncio Click-to-Messenger vira inscrito automaticamente;
  - upload de lista (e-mail e/ou telefone) numa Custom Audience; casamento de 20% a 70%. PSID não
    serve;
  - pedido de opt-in no chat (template `notification_messages`), dentro da janela. O aceite chega
    no webhook `messaging_optins` com o `notification_messages_token`;
  - automações orgânicas: comentário com intenção de compra num post público da Página e conversa
    parada há 48 h geram convite automático.
- **Envio:** cria uma campanha (`POST /act_<AD_ACCOUNT_ID>/message_campaign`) e manda por
  `POST /act_<AD_ACCOUNT_ID>/messages` com `messenger_delivery_data.subscription_token`. É Marketing
  API, com conta de anúncios e forma de pagamento. Espera de 1 h depois de criar a campanha.
- **Limites:**
  - 1 mensagem a cada 12 h por token;
  - desde 10/04/2026, tetos de frequência pela razão entre marketing e conversa orgânica: 20% em 7
    dias, 40% em 1 dia e um mínimo de conversas orgânicas entre duas mensagens de marketing. Erros
    `WEEKLY_MM_LOAD_CAP_REACHED`, `DAILY_MM_LOAD_CAP_REACHED`, `MIN_ORGANIC_THREAD_NOT_REACHED`;
  - `min_conversation_gap_seconds` (11/06/2026) evita mandar para quem está conversando; bloqueio
    vira erro `2300052`.
- **Preço:** a Meta cobra a empresa "for each marketing message" entregue, na mesma fatura dos
  anúncios. O preço varia por país do destinatário e se estima pela Estimation API. Não achei
  tabela pública para o Brasil [verificar].
- **Saída:** toda mensagem leva um link de descadastro com texto fixo da Meta. "We currently do not
  send opt-out webhooks". Existe `POST /<PAGE_ID>/messaging_customer_base/unsubscribe` (11/06/2026).
  Os tokens "do not expire unless a subscriber opts out".
- **Janela:** resposta a uma mensagem de marketing abre 24 h, e as respostas da empresa nessa
  janela não são cobradas.
- **Faturamento:** desde 06/05/2026 o parceiro pode cobrar na própria conta de anúncios (Partner
  Billing Flow).

## Private Replies (comentário → DM)

### Instagram

Fontes: [Instagram Platform](https://developers.facebook.com/documentation/instagram-platform/private-replies),
[Instagram Messaging](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies).

```bash
curl -X POST "https://graph.instagram.com/v25.0/<IG_ID>/messages" \
  -H "Authorization: Bearer <INSTAGRAM_USER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "recipient": { "comment_id": "<COMMENT_ID>" }, "message": { "text": "Oi! Aqui está o link." } }'
```

Resposta: `{ "recipient_id": "<IGSID>", "message_id": "aWdfZ..." }`. No Facebook Login o envio vai
para `graph.facebook.com/<PAGE_ID>/messages` (ou `<IG_ID>`) com token de Página.

- **Uma mensagem por comentário.** "Only one message can be sent to the commenter".
- **Prazo:** até 7 dias depois do comentário. Em Live, só durante a transmissão.
- **Onde vale:** post, reel, story, Live e post de anúncio (a lista muda um pouco entre as duas
  páginas). No anúncio, o webhook traz `ad_id`, `ad_title` e `original_media_id`, e pode chegar
  duplicado.
- **Onde cai:** na caixa principal se a pessoa segue a conta, em Solicitações se não segue. A
  mensagem leva um link para o post comentado.
- **Janela:** "Follow-up messages can only be sent if the recipient responds, and must be sent
  within 24 hours of the response". A resposta da pessoa abre a janela normal.
- **Conteúdo:** os exemplos só mostram `text`. Se aceita quick replies e templates no Instagram:
  [verificar]. No Facebook a doc diz que todos os tipos da Send API valem.
- **Taxa:** 750 chamadas/h por conta para posts e reels; 100/s para comentários de Live
  ([rate limits](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview/rate-limiting)).
- **Acesso:** "Standard Access apps can only access data for people who have a role on the app".
  Para comentário de qualquer pessoa, Advanced Access.
- **Erros:** `100`/`2534025` "The comment is invalid for a private reply"
  ([error codes](https://developers.facebook.com/documentation/business-messaging/messenger-platform/error-codes));
  `10900` "Activity already replied to" e `10903` "This user cant reply to this activity"
  ([page/messages](https://developers.facebook.com/docs/graph-api/reference/page/messages)).
- **Perfil:** quem só comentou ainda não deu consentimento. Ler o perfil, ou mandar mensagem comum
  pelo IGSID, dá "User consent is required to access user profile"
  ([user profile](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile)).

**Contradição.** A [página de envio](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages)
põe "A person comments on a post" entre as ações que abrem a janela de 24 h. As páginas de Private
Reply dizem que só a resposta da pessoa permite continuar. A leitura segura é a mais restrita: o
comentário dá direito a uma Private Reply, e o resto espera a resposta [verificar com teste].

### Facebook (Página)

Fonte: [Private Replies do Messenger](https://developers.facebook.com/documentation/business-messaging/messenger-platform/discovery/private-replies).

- `POST /<PAGE_ID>/messages` com `recipient: { "comment_id": "..." }` ou `{ "post_id": "..." }`.
- Vale para comentário em post da Página, post de visitante, comentário em comentário e post da
  Página dentro de um Grupo (webhook `group_feed`). Reels do Facebook desde 12/10/2023
  ([changelog](https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog)).
  Anúncios: a página de envio cita "comment on one of your posts or ads". Live do Facebook:
  [verificar].
- Uma mensagem, até 7 dias, com link para o comentário. Continua só se a pessoa responder.
- "All messaging types available for using the Send API are available for private replies".
- O comentário tem `can_reply_privately` e `private_reply_conversation`
  ([Comment](https://developers.facebook.com/docs/graph-api/reference/comment/)), que servem
  para checar antes e evitar resposta dupla.
- Pré-requisitos: token de Página com a tarefa `MESSAGING` e `pages_messaging`. O ID vem do webhook
  `feed` da Página.

## Comentários

### Instagram

Fontes: [comment moderation](https://developers.facebook.com/documentation/instagram-platform/comment-moderation),
[IG Comment](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-comment),
[replies](https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-comment/replies),
[webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks),
[exemplos](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples).

Webhook `comments` (e `live_comments`) no Instagram Login:

```json
{ "object": "instagram",
  "entry": [{ "id": "<IG_ID>", "time": 1760600000,
    "field": "comments",
    "value": {
      "id": "<COMMENT_ID>",
      "from": { "id": "<IGSID>", "username": "anasouza" },
      "text": "QUERO",
      "media": { "id": "<MEDIA_ID>", "media_product_type": "REELS" } } }] }
```

No Facebook Login o mesmo dado vem dentro de `entry[].changes[]`, com `comment_id`, `parent_id`
(resposta a comentário) e, em anúncio, `media.ad_id`, `ad_title` e `original_media_id`. Os dois
formatos são diferentes: o parser precisa saber de qual caminho veio. O valor exato de
`media_product_type` (`FEED`, `REELS`, `STORY`, `AD`…): [verificar] no primeiro webhook real.

Para receber:

- "Advanced Access is required to receive `comments` and `live_comments` webhook notifications".
- O app precisa estar em Live e a conta "must be public".
- `live_comments` só chega durante a transmissão.
- `mentions`: no Instagram Login vem dentro de `comments`.

| Ação | Chamada | Limites |
|---|---|---|
| Ler | `GET /<IG_MEDIA_ID>/comments` → `timestamp`, `text`, `id` | A Meta recomenda webhook para não estourar a cota |
| Um comentário | `GET /<IG_COMMENT_ID>?fields=from,text,media,parent_id,hidden,timestamp` | `username` de terceiros exige a permissão de comentários (desde 27/08/2024) |
| Responder em público | `POST /<IG_COMMENT_ID>/replies` com `message` → `{ "id" }` | Só em comentário de primeiro nível; resposta a resposta sobe para o de cima. Não responde comentário oculto nem de Live |
| Ocultar/mostrar | `POST /<IG_COMMENT_ID>?hide=true` | Comentário do dono da mídia nunca some; Live não |
| Apagar | `DELETE /<IG_COMMENT_ID>` | Só o dono da mídia apaga; Live não |
| Desligar comentários | `POST /<IG_MEDIA_ID>?comment_enabled=false` ([IG Media](https://developers.facebook.com/documentation/instagram-platform/reference/instagram-media)) | |

Cota das chamadas fora de mensagem: "4800 * Number of Impressions" por conta em 24 h móveis
([overview](https://developers.facebook.com/documentation/instagram-platform/overview#rate-limiting)).

### Facebook (Página)

Fontes: [webhooks de Página](https://developers.facebook.com/documentation/pages-api/webhooks-for-pages),
[referência do `feed`](https://developers.facebook.com/docs/graph-api/webhooks/reference/page/),
[comentários e menções](https://developers.facebook.com/documentation/pages-api/comments-mentions),
[/comments](https://developers.facebook.com/docs/graph-api/reference/object/comments/),
[Comment](https://developers.facebook.com/docs/graph-api/reference/comment/).

- Webhook `feed` (objeto `page`). `value` traz `item` (`comment`, `post`, `reaction`…), `verb`
  (`add`, `edited`, `remove`, `hide`, `unhide`…), `comment_id`, `post_id`, `parent_id`,
  `from { id, name }`, `message`, `created_time`. Não há webhook para post de anúncio, mas há para
  comentário em post de anúncio. Exige `pages_manage_metadata` e `pages_show_list`.
- Responder em público: `POST /{comment-id}/comments` com `message`. Exige `pages_manage_engagement`
  ou token de quem tem a tarefa `MODERATE`.
- Ocultar: `POST /{comment-id}` com `is_hidden=true` ("Only applicable to Page comments").
- Apagar: `DELETE /{comment-id}`.
- Marcar a pessoa: `message` com `@[PSID]`, se ela comentou ou criou o post. Precisa da feature Page
  Mentioning.

## Webhooks

**Verificação (GET).** `hub.mode=subscribe`, `hub.challenge`, `hub.verify_token`. Se o token bater,
devolver o `hub.challenge`
([IG webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks)).

**Assinatura (POST).** `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 do corpo com o **app
secret**. Calcular sobre o corpo cru. No Instagram Login o painel mostra um "Instagram app secret"
separado do app secret da Meta. Qual dos dois assina o webhook: [verificar] (um blog de terceiro
diz que é o do Instagram). Certificado autoassinado não serve. mTLS é opcional
(CA `meta-outbound-api-ca-2025-12.pem`, CN `client.webhooks.fbclientcerts.com`).

**Entrega e retentativa:**

| | Instagram Platform (comentários, menções) | Messenger e mensagens do Instagram |
|---|---|---|
| Lote | Até 1.000 atualizações, sem garantia | Idem |
| Falha | Repete na hora e depois com frequência menor por 36 h; depois descarta | Repete algumas vezes. 15 min de falha geram alerta; **1 h de falha desliga o webhook e desinscreve o app** da Página/conta |
| Prazo de resposta | não informado | 20 s ([FAQ](https://developers.facebook.com/documentation/business-messaging/messenger-platform/faq), [App Review](https://developers.facebook.com/documentation/business-messaging/messenger-platform/app-review)) |
| Ordem | — | "always use the webhook timestamp" |

Fontes: [IG webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks),
[Messenger webhooks](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks).
Não há API de histórico: "You will not be able to query historical webhook event notification
data". Que regra vale para as DMs do Instagram no Instagram Login: [verificar] (a página do
Instagram remete à do Messenger).

**Campos do Instagram** ([tabela](https://developers.facebook.com/documentation/instagram-platform/webhooks#fields)):

| Campo | Instagram Login | Facebook Login / Messenger |
|---|---|---|
| `comments`, `live_comments` | Sim | Sim |
| `mentions` | Dentro de `comments` | Sim |
| `messages` (inclui eco `is_echo`) | Sim | Sim |
| `message_echoes` | Sim | Dentro de `messages` |
| `message_reactions`, `messaging_postbacks`, `messaging_seen`, `messaging_referral`, `messaging_handover`, `standby` | Sim | Sim |
| `messaging_optins` | Sim | Não |
| `messaging_policy_enforcement`, `response_feedback` | Não | Sim |
| `story_insights` | Não | Sim (`instagram_manage_insights`) |
| `message_edit` | Sim (10/09/2025) | Sim |

**Campos do Messenger:** `messages`, `message_echoes`, `message_deliveries`, `message_reads`,
`message_reactions`, `message_edits`, `messaging_postbacks`, `messaging_optins`,
`messaging_referrals`, `messaging_handovers`, `standby`, `messaging_policy_enforcement`,
`messenger_template_status_update`, `response_feedback`. Para comentários, `feed`.

**Vários clientes no mesmo app:**

- O app tem uma URL de callback por objeto (`instagram`, `page`). Todo evento traz `entry[].id`
  (conta do Instagram ou Página): é por ele que o Kakou acha a organização. Um lote pode misturar
  contas ("Multiple changes from different objects [...] may be batched together").
- Cada conta precisa inscrever o app:
  - Instagram Login: `POST https://graph.instagram.com/v25.0/me/subscribed_apps?subscribed_fields=comments,messages`
    com o token da conta → `{ "success": true }`;
  - Página: `POST /<PAGE_ID>/subscribed_apps?subscribed_fields=messages,feed` com token de Página
    (tarefa `MODERATE`, `pages_messaging` e `pages_manage_metadata`).
- "Account level webhooks customization is not supported": a conta inscrita recebe todos os campos
  que o app assina.
- "Your app must be set to Live [...] for Meta to send webhook notifications".
- Sem Advanced Access, só chegam eventos de quem tem papel no app.

Mensagem recebida no Instagram:

```json
{ "object": "instagram",
  "entry": [{ "id": "<IG_ID>", "time": 1760600001000,
    "messaging": [{
      "sender": { "id": "<IGSID>" }, "recipient": { "id": "<IG_ID>" }, "timestamp": 1760600000900,
      "message": { "mid": "aWdf...", "text": "quero saber o preço" } }] }] }
```

Outros campos possíveis em `message`: `attachments[]` (`image`, `video`, `audio`, `file`,
`ig_reel`, `ig_post`, `story_mention`…), `quick_reply.payload`, `reply_to` (com `story.url` e
`link_sticker_url`), `referral` (anúncio CTD ou link `ig.me`), `is_deleted`, `is_unsupported`,
`is_echo`. GIF e figurinha não geram webhook
([IG Messaging webhooks](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/webhooks)).
O anexo `share` de post foi trocado por `ig_post`; a remoção do `share` está em andamento desde
27/04/2026 ([changelog](https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog)).

## Envio

| Canal | Endpoint | Destinatário |
|---|---|---|
| Instagram (Instagram Login) | `POST https://graph.instagram.com/v25.0/<IG_ID>/messages` (ou `/me/messages`), `Authorization: Bearer` | `{ "id": "<IGSID>" }` ou `{ "comment_id": "..." }` |
| Instagram (Facebook Login) | `POST https://graph.facebook.com/v25.0/<PAGE_ID>/messages`, token de Página | Idem |
| Messenger | `POST https://graph.facebook.com/v25.0/<PAGE_ID>/messages`, token de Página | `{ "id": "<PSID>" }`, `comment_id`, `post_id`, `user_ref` ou `notification_messages_token` |

Resposta: `{ "recipient_id": "...", "message_id": "..." }`. Fontes:
[IG Login messaging](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api),
[IG Messaging send](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/send-message),
[Messenger send](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages).

| Conteúdo | Instagram | Messenger |
|---|---|---|
| Texto | UTF-8, até **1.000 bytes** (acento conta 2) | Limite: [verificar] (2.000 caracteres é o conhecido, a referência não abriu) |
| Link | No texto | No texto ou em botão |
| Imagem | png/jpeg até 8 MB; até 10 por mensagem; `url` ou `attachment_id` | Sim; `is_reusable` e Attachment Upload API |
| Áudio, vídeo, PDF | 25 MB | Sim |
| Quick replies | Até 13, 20 caracteres, só texto (e opção de e-mail/telefone) | Até 13, `title` com 20 caracteres, `payload` com 1.000 |
| Botões | Button template: texto de 640 caracteres e até 3 botões `web_url`/`postback` | Button template, URL, postback, call |
| Carrossel | Generic template: até 10 cards, título e subtítulo com 80, até 3 botões | Generic template |
| Post da própria conta | `MEDIA_SHARE` | — |
| Reação, digitando, visto | `sender_action` (`react`, `typing_on`, `mark_seen`) | Idem |

Templates do Instagram, ice breakers e alguns recursos "not available on desktop".

**Limites de taxa:**

| Limite | Instagram | Messenger |
|---|---|---|
| Send API, texto/link/reação | 300/s por conta ([rate limits](https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview/rate-limiting); a [overview do Instagram](https://developers.facebook.com/documentation/instagram-platform/overview#rate-limiting) ainda diz 100/s) | 300/s por Página |
| Send API, áudio/vídeo | 10/s por conta | 10/s por Página |
| Private Replies | 750/h (post/reel); 100/s (Live) | 750/h por Página |
| Conversations API | 2/s por conta | 2/s por Página |
| Mesma conversa | "may be rate limited if too many messages are sent to a single thread" | Idem |
| Cota diária | — | "200 * Number of Engaged Users" em 24 h |
| Alto volume | Acima de 72.000 mensagens a caixa para (período não dito [verificar]) | Acima de 40 msg/s a caixa para |
| Messenger Profile API (menu, ice breakers) | — | 10 chamadas a cada 10 min por Página |

Os limites são por conta ou Página: as organizações não disputam a mesma cota. A Send API subiu de
100 para 300/s em 08/10/2024 ([changelog](https://developers.facebook.com/documentation/business-messaging/messenger-platform/changelog)).

**Erros de envio** ([error codes](https://developers.facebook.com/documentation/business-messaging/messenger-platform/error-codes),
[send messages](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages)):

| Código | Significado | Repetir? |
|---|---|---|
| `10` / `2534022` | Instagram: fora da janela | Não |
| `10` / `2018278` | Messenger: fora da janela | Não |
| `551` / `1545041` e `200` / `1545041` | "This person isn't available right now" (bloqueou, desativou a conta) | Não |
| `10` / `2018108` | "They can't receive your messages right now" | Não |
| `100` / `2534014` | IGSID não existe ("Instagram User ID are not supported") | Não |
| `100` / `2534025` | Comentário não aceita Private Reply | Não |
| `10900` | Comentário já respondido em privado | Não |
| `100` / `2534029` | Empresa bloqueada de mandar pela API do Instagram | Não; pausar a conta |
| `10` / `1893063` | Página restrita por política | Não; pausar a conta |
| `200` / `2534041` | Dono da conta desligou o acesso às mensagens | Não; pedir para religar |
| `10` / `2534077` | Página e conta do Instagram não estão ligadas | Não; reconectar |
| `100` / `2534037`, `2018300` | Outro app controla a conversa | Não; ver Conversation Routing |
| `190` | Token inválido ou expirado | Não; reconectar |
| `200` / `2018028` | `pages_messaging` sem App Review: só fala com quem tem papel no app | Não |
| `613` / `2534040`, `4` | Limite de taxa | Sim, com backoff |
| `613` / `2018338` | Abuso de tags | Não |
| `2` | Erro temporário (às vezes, bloqueio) | Poucas vezes |

## Identidade de quem manda DM

- **IGSID** (Instagram) e **PSID** (Página): "This ID is specific to the person and the Instagram
  account they are interacting with". É o mesmo para a mesma conta em apps diferentes ("map
  interactions for the same person across multiple apps"). Nasce quando a pessoa comenta ou manda
  mensagem ([overview](https://developers.facebook.com/documentation/instagram-platform/overview)).
  Não achei forma oficial de ligar o PSID de uma pessoa ao IGSID dela [verificar].
- **Perfil no Instagram:** `GET /<IGSID>?fields=name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user,is_verified_user`.
  `name` e `profile_pic` podem vir nulos; a URL da foto "will expire in a few days". Só depois que a
  pessoa mandou mensagem ou tocou num ice breaker/menu. Quem bloqueou a conta não aparece
  ([IG Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile),
  [Messenger Platform](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/user-profile)).
- **Perfil no Messenger:** `GET /<PSID>?fields=first_name,last_name,profile_pic` exige a feature
  Business Asset User Profile Access (App Review). `locale`, `timezone` e `gender` pedem permissões
  à parte. Conta de Messenger criada por telefone dá `2018218`
  ([user profile](https://developers.facebook.com/documentation/business-messaging/messenger-platform/identity/user-profile)).
- **ID da conta no Instagram Login:** `GET /me?fields=user_id,username`. `id` é o ID por app;
  `user_id` é o `<IG_ID>`, "the value of the `id` field received in webhook notifications"
  ([get started](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started)).
  Guardar o `user_id`.
- **Apagou a mensagem:** chega `is_deleted`. A Meta exige apagar do nosso lado ("Delete messages when
  you receive a webhooks notification to do so").

## Recursos de conversa

- **Ice breakers:** até 4 perguntas por idioma, por `messenger_profile` (`platform=instagram` no
  caminho do Facebook). O toque vira `messaging_postbacks`. Não aparecem no desktop
  ([IG Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/ice-breakers),
  [Messenger](https://developers.facebook.com/documentation/business-messaging/messenger-platform/reference/messenger-profile-api/ice-breakers)).
  "Conversation starters" não aparece na doc; o nome é Ice Breakers.
- **Menu persistente:** botões `web_url` e `postback`. No Instagram não há
  `composer_input_disabled` e o menu não muda na hora nas conversas abertas. No Messenger, até 20
  itens com título de 30 caracteres
  ([IG](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/persistent-menu),
  [Messenger](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages/persistent-menu)).
- **Links `ig.me` e `m.me` com `ref`:** abrem a conversa e mandam o `ref` no webhook. Servem para
  saber de qual lançamento ou página a pessoa veio.
- **Conversation Routing:** substituiu o Handover Protocol no Instagram em 23/10/2025
  ([routing IG](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/conversation-routing)):
  - um app padrão responde quando ninguém tem o controle; a caixa do Meta Business Suite pode ser
    um dos apps;
  - passar, liberar, tomar, estender (até 7 dias) e pedir o controle da conversa;
  - conversa vinda de anúncio fica com o app escolhido por 1 a 30 dias
    (`receiving_app_control_expiration`);
  - sem configuração ("zero config"): todos os apps recebem webhook e podem responder. A doc avisa:
    "you are responsible for coordinating responses between your app and the Inbox";
  - erro `2018300` quando outro app tem o controle.
- **Quando o humano responde pelo app do Instagram ou pelo Business Suite:**
  - Instagram: chega em `messages` com `is_echo: true`. A doc não mostra `app_id` no eco do
    Instagram [verificar];
  - Messenger: `message_echoes` traz `app_id`, que é o app da caixa da Página ("`26390203743090`",
    como está na doc; [verificar] o número) quando a mensagem saiu de lá
    ([echoes](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/message-echoes));
  - responder por app de terceiro move a conversa para a pasta "Geral" e só marca como lida
    quando sai a resposta.
- **Escalonamento humano é obrigatório no Instagram:** "Apps that use the Instagram Messaging APIs
  must have an escalation path to a human agent". Pode ser uma caixa própria no mesmo app ou passar
  o controle para outro app ou para a caixa do Instagram
  ([human agent escalation](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/human-agent-escalation)).
- **Bot precisa se apresentar** quando a lei pedir (Califórnia, Alemanha); a Meta recomenda sempre.
- **Responsividade (Messenger):** bot automático responde "any and all input" em até 30 s, ou a
  Página pode ser limitada ([política](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy)).

## Do lado da GuessLess: um app para muitos clientes

**Acesso padrão × avançado** ([access levels](https://developers.facebook.com/documentation/development/graph-api/overview/access-levels)):

| | Standard Access | Advanced Access |
|---|---|---|
| Quem pode conceder permissão | Só quem tem papel no app (ou no portfólio dono do app) | Qualquer usuário |
| Como se ganha | Automático | App Review por permissão e feature |
| Verificação do negócio | Não | Obrigatória |
| Webhook de comentário do Instagram | Não chega | Chega |

**O que a GuessLess precisa:**

1. **Verificação do negócio** no portfólio dono do app
   ([business verification](https://developers.facebook.com/documentation/development/release/business-verification)).
   Prazo: [verificar].
2. **Tech Provider / Access Verification.** Empresa que atende outras e pede `instagram_basic`,
   `instagram_business_basic`, `pages_show_list`, `pages_read_engagement`, `business_management` e
   outras precisa ser verificada como Tech Provider. Sem isso, chamadas de quem não tem papel no app
   dão `100`. Decisão em "approximately 5 days"
   ([access verification](https://developers.facebook.com/documentation/development/release/access-verification)).
   No WhatsApp essa exigência caiu em 03/10/2025; se caiu também aqui: [verificar].
3. **App Review**, por permissão e feature
   ([App Review](https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review),
   [tutorial](https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide)):
   - ícone 1024x1024, URL de política de privacidade, categoria, URL ou callback de exclusão de
     dados;
   - instruções para o revisor entrar no Kakou e testar (credencial de teste, sem conta pessoal);
   - um vídeo por permissão, de preferência com a interface em inglês ou com legenda, mostrando o
     login, a concessão das permissões e o uso;
   - para o Instagram: como configurar a automação, iniciar a conversa, tratar mensagem apagada e,
     se houver, a caixa onde o humano lê, responde e apaga
     ([apps for other businesses](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/app-review/apps-for-other-businesses));
   - pelo menos 1 chamada bem-sucedida por permissão nos 30 dias antes do envio;
   - decisão "within a week". Mudança posterior nas configurações pode pedir nova revisão;
   - depois: Data Use Checkup anual e Ongoing Review.
4. **Publicar o app** (modo Live), sem o que não há webhook.

**Permissões a pedir com Advanced Access:**

| Caminho | Permissões | Features |
|---|---|---|
| A. Um app com Facebook Login for Business (Instagram + Messenger) | `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`, `pages_manage_engagement`, `business_management`, `public_profile` | Human Agent, Business Asset User Profile Access |
| B. App só de Instagram com Instagram Login | `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_manage_comments` | Human Agent |
| Disparo pago no Messenger (opcional) | + `ads_management`, `paid_marketing_messages` | Marketing API Access Tier |

No caminho B, o Messenger vai num segundo app (caminho A sem as `instagram_*`). O App Review do
Instagram Login só aceita plataforma web.

**App só para a própria GuessLess:** a [tabela do App Review do Instagram](https://developers.facebook.com/documentation/instagram-platform/app-review)
diz que não precisa de revisão. Mas webhook de comentário exige Advanced Access, e Private Reply com
Standard Access só alcança quem tem papel no app. Para o "estilo ManyChat" funcionar até na conta
da GuessLess, conte com App Review e verificação desde o começo [verificar com teste].

**Como o cliente conecta:**

- **Facebook Login for Business**
  ([FBL4B](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business)):
  - app do tipo Business; uma **configuração** no painel define token, ativos e permissões e gera o
    `config_id`;
  - `FB.login(cb, { config_id, response_type: 'code', override_default_response_type: true })` e
    troca do `code` no servidor (`GET /oauth/access_token?client_id&client_secret&code`);
  - token de **system user de integração** (SUAT): "Defaults to never expire", ligado ao portfólio
    do cliente, só para Tech Provider, exige que o cliente tenha portfólio e só funciona na web. É o
    indicado para "Sending automated responses as a Facebook Page";
  - token de **usuário**: curto; o longo dura ~60 dias. O token de Página tirado de um token de
    usuário longo "do not have an expiration date", mas pode ser invalidado
    ([long-lived](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived));
  - `GET /me/accounts?fields=id,name,access_token,instagram_business_account` devolve as Páginas,
    os tokens e a conta do Instagram ligada.
- **Instagram Login**
  ([Business Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login)):
  - link `https://www.instagram.com/oauth/authorize?client_id=<INSTAGRAM_APP_ID>&redirect_uri=...&response_type=code&scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments&state=...`
    (`force_reauth=true` recomendado no celular);
  - o `code` vale 1 h e uma vez (tirar o `#_` do fim);
  - `POST https://api.instagram.com/oauth/access_token` (form) → token curto de 1 h;
  - `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token` → token de **60
    dias**;
  - renovar com `GET /refresh_access_token?grant_type=ig_refresh_token` quando o token tiver mais
    de 24 h e ainda for válido. "Tokens that have not been refreshed in 60 days will expire";
  - usa o **Instagram app ID e app secret**, não os do app da Meta.

## Grupos e canais

- **Groups API do Facebook: removida.** Descontinuada na v19.0 (blog de 23/01/2024: "deprecated in
  v19 and in 90 days will be removed from all versions"), com as permissões `publish_to_groups` e
  `groups_access_member_info` e a feature Groups API. Vale para todas as versões desde **22/04/2024**
  ([blog v19](https://developers.facebook.com/blog/post/2024/01/23/introducing-facebook-graph-and-marketing-api-v19/),
  [changelog v19.0](https://developers.facebook.com/docs/graph-api/changelog/version19.0/)).
- O que sobrou: Private Reply para quem comenta um post **da Página** dentro de um Grupo, pelo
  webhook `group_feed` e com token de Página
  ([group_feed](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/group-feed)).
  Não publica nem lê o grupo.
- **Grupo de DM no Instagram:** sem API. "Group messaging is not supported. An Instagram
  Professional account can only converse with one customer per conversation"
  ([IG Login messaging](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api)).
- **Canal de transmissão do Instagram:** não aparece em nenhum dos índices nem nas páginas lidas.
  Não há API.

## O que isso decide para o Kakou

- **App único = Facebook Login for Business.** Um app não tem os dois logins. Para Instagram e
  Messenger no mesmo app, o Instagram precisa estar ligado a uma Página. Instagram Login (sem
  Página, onboarding mais simples) exige um segundo app só para o Messenger. Decidir antes de pedir
  o App Review.
- **O SDR responde DM, mas só dentro de 24 h.** A IA não pode usar `HUMAN_AGENT`. Depois de 24 h
  sem mensagem da pessoa, só um humano, por até 7 dias, numa caixa do Kakou e com a feature
  aprovada.
- **"Estilo ManyChat" é possível e oficial.** Webhook `comments` → filtro de palavra-chave → Private
  Reply (`recipient.comment_id`) → resposta pública opcional. Uma DM por comentário, até 7 dias,
  750/h por conta. A conversa só continua se a pessoa responder. Guardar o `comment_id` respondido.
- **Disparo no Instagram não existe fora da janela.** Dá para mandar `UPDATE` só para quem falou nas
  últimas 24 h. Um lançamento precisa gerar a conversa (comentário com palavra-chave, ice breaker,
  link `ig.me`, anúncio CTD) e falar durante a janela.
- **Disparo no Messenger fora da janela só pela Marketing Message API.** Paga por mensagem, com
  conta de anúncios, opt-in, 1 envio a cada 12 h por inscrito, tetos de frequência e descadastro sem
  webhook. Exige Tech Provider e App Review de `ads_management` e `paid_marketing_messages`. É uma
  segunda fase.
- **Webhook rápido e com fila.** Responder 200 em menos de 20 s. No Messenger, 1 h de falha
  desinscreve o app de todas as Páginas. Validar `X-Hub-Signature-256` com o segredo certo, rotear
  por `entry[].id`, deduplicar por `mid` ou `comment_id` e gravar o payload cru.
- **Travas da GuessLess antes do primeiro cliente:** verificação do negócio, Access Verification de
  Tech Provider (~5 dias), App Review com vídeos por permissão (~1 semana por rodada), app em Live,
  política de privacidade e exclusão de dados. O webhook de comentário pede Advanced Access mesmo na
  conta da própria GuessLess.
- **Tokens com dono e prazo.** Instagram Login: 60 dias, com renovação automática obrigatória.
  Facebook Login for Business: SUAT sem validade, por cliente. Erros `190`, `2534041` e `2534029`
  pausam a conta e avisam no painel.
- **Convivência com a caixa do Instagram.** Sem Conversation Routing, app e humano respondem a mesma
  mensagem. O Kakou precisa ver o eco (`is_echo`) do que o humano mandou e pausar o SDR naquela
  conversa. A Meta exige caminho para humano no Instagram.
- **Texto curto.** 1.000 bytes por mensagem no Instagram (acentos contam 2): quebrar as respostas do
  SDR.

## Pontos abertos

- Lista final de permissões da Private Reply do Instagram no caminho do Facebook (as duas páginas
  divergem; uma pede a feature Human Agent).
- Se a Private Reply do Instagram aceita quick replies e templates, ou só texto.
- Se o comentário abre a janela de 24 h (a página de envio diz que sim; as de Private Reply dizem que
  não). Testar.
- Se existe hoje algum envio de marketing fora da janela no Instagram (as páginas "Marketing
  Messages" e "Ways to Get Opt-Ins" do índice dão 404).
- Se a One-time Notification do Messenger ainda funciona.
- Preço da Marketing Message API para destinatário no Brasil (só pela Estimation API).
- Limite de texto do Messenger (referência da Send API não abriu).
- Qual segredo assina o webhook no Instagram Login (app secret da Meta ou do Instagram).
- Regra de retentativa e desligamento do webhook para DMs no Instagram Login (36 h ou 1 h).
- Se o eco do Instagram traz `app_id` para separar humano e bot. O `app_id` da caixa da Página na
  doc tem 14 dígitos (`26390203743090`).
- Valores de `media_product_type` no webhook de comentário.
- Se Private Reply funciona em Live do Facebook.
- Período do limite de 72.000 mensagens do Instagram.
- Ligação entre PSID e IGSID da mesma pessoa.
- Prazo da verificação do negócio; se a Access Verification ainda vale para Instagram e Messenger.
- Se um app só para a própria GuessLess precisa mesmo de App Review para comentário e DM.
