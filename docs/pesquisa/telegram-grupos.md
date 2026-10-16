# Telegram em grupos e canais: o que o bot da organização consegue

Pesquisa nas páginas oficiais do Telegram (core.telegram.org e telegram.org),
16/10/2026. Complementa [telegram-bot-api.md](telegram-bot-api.md), que cobre o
1:1 do SDR-73: conectar o bot, webhook, `/start`, `sendMessage`, limites
globais, erros e regras de spam. Nada disso se repete aqui. Este documento
cobre o que muda quando o mesmo bot (token, webhook e segredo já conectados)
passa a gerenciar **grupos, supergrupos e canais da própria organização**.
Primeiro uso: a GuessLess em lançamento de infoproduto.

Além da Bot API, uso a documentação do MTProto no mesmo site (tipos de grupo,
links, métodos que só conta de usuário pode chamar), marcada como "MTProto".
Nada vem de código. O que não deu para confirmar está com [verificar].

## Versão

- Continua a **Bot API 10.3**, de 24/08/2026
  ([changelog](https://core.telegram.org/bots/api-changelog)).
- De 2025 para cá entraram várias peças de grupo: mensagens efêmeras, pedido
  de entrada tratado por Mini App, etiquetas de membro, comunidades. Lista
  com a versão em [Novidades de 2025 e 2026](#novidades-de-2025-e-2026).

## Pôr o bot no grupo ou no canal

### Links

| Link | O que abre |
|---|---|
| `https://t.me/<bot>?startgroup=<código>` | escolher um grupo em que a pessoa pode adicionar membros. O bot entra como membro comum |
| `https://t.me/<bot>?startgroup=<código>&admin=<direitos>` | escolher um grupo em que a pessoa pode nomear admin. O bot entra **já como admin** com os direitos pedidos; se já era admin, os direitos se somam |
| `https://t.me/<bot>?startchannel&admin=<direitos>` | escolher um canal. `admin` é obrigatório e **não há código** |

Fonte: [group/channel bot links](https://core.telegram.org/api/links#group-channel-bot-links).

- `<código>`: até 64 caracteres base64url, como o do `/start`. Depois de
  entrar, o bot recebe no grupo a mensagem `/start@<bot> <código>`
  ([deep linking](https://core.telegram.org/bots/features#deep-linking)).
  Serve para ligar o grupo ao lançamento certo.
- `<direitos>`: identificadores separados por `+`. Os que importam:
  `change_info`, `delete_messages`, `restrict_members`, `invite_users`,
  `pin_messages`, `manage_topics`, `manage_tags`, `manage_chat`; em canal,
  `post_messages` e `edit_messages`. Exemplo de grupo:
  `?startgroup=k7Qm2xPa&admin=change_info+delete_messages+restrict_members+invite_users+pin_messages+manage_topics`.
- A lista de identificadores não tem o direito novo `can_send_welcome_messages`
  (10.3) [verificar].
- [`setMyDefaultAdministratorRights`](https://core.telegram.org/bots/api#setmydefaultadministratorrights)
  grava os direitos que o app sugere quando alguém põe o bot como admin. A
  pessoa pode mudar antes de confirmar. Um conjunto para grupos, outro
  (`for_channels`) para canais.
- Outra porta: no privado com o bot, um botão de teclado
  [`request_chat`](https://core.telegram.org/bots/api#keyboardbuttonrequestchat)
  com `bot_administrator_rights` deixa o admin escolher um grupo dele. O bot
  recebe o id em [`chat_shared`](https://core.telegram.org/bots/api#chatshared)
  e "will be granted requested rights in the chat if appropriate". Se o
  seletor dos apps oferece "criar grupo novo": [verificar].
- O bot precisa estar liberado para grupos no @BotFather (`/setjoingroups`).
  `getMe` devolve `can_join_groups`
  ([edit settings](https://core.telegram.org/bots/features#edit-settings),
  [User](https://core.telegram.org/bots/api#user)).

### Como o bot fica sabendo

- Update `my_chat_member`: "The bot's chat member status was updated in a
  chat" ([Update](https://core.telegram.org/bots/api#update)). Em grupo e
  canal, chega quando o bot entra, sai, é promovido, rebaixado ou banido.
- Em grupo chega também a mensagem de serviço com o bot em `new_chat_members`
  ([Message](https://core.telegram.org/bots/api#message)).
- `from` é quem pôs o bot. `new_chat_member` traz o status e, se for admin,
  cada direito
  ([ChatMemberUpdated](https://core.telegram.org/bots/api#chatmemberupdated),
  [ChatMemberAdministrator](https://core.telegram.org/bots/api#chatmemberadministrator)).

Bot posto como admin num supergrupo (valores ilustrativos):

```json
{
  "update_id": 912345700,
  "my_chat_member": {
    "chat": { "id": -1001234567890, "type": "supergroup", "title": "Lançamento Out/26 · Grupo 1" },
    "from": { "id": 111111111, "is_bot": false, "first_name": "Arthur" },
    "date": 1760610000,
    "old_chat_member": { "status": "left", "user": { "id": 7000000001, "is_bot": true, "first_name": "Kakou", "username": "kakou_gl_bot" } },
    "new_chat_member": {
      "status": "administrator",
      "user": { "id": 7000000001, "is_bot": true, "first_name": "Kakou", "username": "kakou_gl_bot" },
      "can_be_edited": false, "is_anonymous": false, "can_manage_chat": true,
      "can_change_info": true, "can_delete_messages": true, "can_restrict_members": true,
      "can_invite_users": true, "can_pin_messages": true, "can_manage_topics": true,
      "can_promote_members": false, "can_manage_video_chats": false, "can_send_welcome_messages": false
    }
  }
}
```

### Direito de admin para cada ação

| Ação | Precisa | Fonte |
|---|---|---|
| Ver todas as mensagens do grupo | ser admin (qualquer direito) ou modo privacidade desligado | [privacy mode](https://core.telegram.org/bots/features#privacy-mode) |
| Receber `chat_member` (entradas e saídas de todos) | ser admin **e** pedir em `allowed_updates` | [Update](https://core.telegram.org/bots/api#update) |
| Receber `chat_join_request` | `can_invite_users` | idem |
| Criar, editar e revogar link de convite | "appropriate administrator rights"; o direito que convida é `can_invite_users` | [createChatInviteLink](https://core.telegram.org/bots/api#createchatinvitelink), [ChatAdministratorRights](https://core.telegram.org/bots/api#chatadministratorrights) |
| Aprovar ou recusar pedido de entrada | `can_invite_users` | [approveChatJoinRequest](https://core.telegram.org/bots/api#approvechatjoinrequest) |
| Trocar título, descrição e foto | "appropriate"; o direito é `can_change_info` ("change the chat title, photo and other settings") | [setChatTitle](https://core.telegram.org/bots/api#setchattitle), [ChatAdministratorRights](https://core.telegram.org/bots/api#chatadministratorrights) |
| Fixar e desafixar | `can_pin_messages` em grupo; `can_edit_messages` em canal | [pinChatMessage](https://core.telegram.org/bots/api#pinchatmessage) |
| Fechar o grupo, restringir, banir, desbanir | `can_restrict_members` | [setChatPermissions](https://core.telegram.org/bots/api#setchatpermissions), [ChatAdministratorRights](https://core.telegram.org/bots/api#chatadministratorrights) |
| Apagar mensagem dos outros | qualquer admin em grupo comum; `can_delete_messages` em supergrupo e canal | [deleteMessage](https://core.telegram.org/bots/api#deletemessage) |
| Criar, editar, fechar tópico | `can_manage_topics`. Apagar tópico: `can_delete_messages` | [createForumTopic](https://core.telegram.org/bots/api#createforumtopic), [deleteForumTopic](https://core.telegram.org/bots/api#deleteforumtopic) |
| Postar no canal | `can_post_messages` | [ChatAdministratorRights](https://core.telegram.org/bots/api#chatadministratorrights) |
| Etiqueta ao lado do nome do membro | `can_manage_tags` | [setChatMemberTag](https://core.telegram.org/bots/api#setchatmembertag) |
| Mensagem efêmera a qualquer membro, a qualquer hora | ser admin | [ephemeral](https://core.telegram.org/bots/api#ephemeral-messages-and-commands) |
| Boas-vindas do chat | `can_send_welcome_messages`: "can manage chat welcome messages or directly send them in the case of bots". O que isso libera na prática: [verificar] | [ChatAdministratorRights](https://core.telegram.org/bots/api#chatadministratorrights) |

### Descobrir em que grupos o bot está

- **Não existe "listar meus grupos".** Os métodos de leitura da Bot API são
  sempre de um chat que você já conhece: `getChat`, `getChatMember`,
  `getChatAdministrators`, `getChatMemberCount`
  ([métodos](https://core.telegram.org/bots/api#available-methods), lidos em
  16/10). Também não há método para listar membros nem para ler histórico.
- Como guardar: o `my_chat_member` de entrada vira uma linha nossa (id do chat,
  tipo, título, status do bot, direitos, quem pôs, data). Os seguintes
  atualizam a linha; `left` ou `kicked` marcam a saída. `migrate_to_chat_id`
  troca o id (ver [Tipos de chat](#tipos-de-chat)).
- O id é negativo: grupo comum é `-N`; supergrupo e canal são
  `-(1000000000000 + id)`, o `-100…`
  ([Bot API dialog IDs](https://core.telegram.org/api/bots/ids)).
- Recuperar um grupo perdido (update descartado depois de 24 h): conferir os
  ids guardados com `getChat` e `getChatMember(chat_id, id do bot)`. Grupo que
  nunca chegou só aparece quando chegar outro update dele (qualquer mensagem,
  se o bot for admin), quando alguém reenviar o link `startgroup` ou pelo
  `chat_shared`.

## Modo privacidade

| Situação | O que o bot recebe no grupo |
|---|---|
| Privacidade ligada (padrão), bot membro comum | comandos para ele (`/cmd@bot`); comandos gerais (`/start`) se ele foi o último bot a falar no grupo; mensagens enviadas via ele (inline); respostas a mensagens dele |
| Privacidade desligada | todas as mensagens, menos as de outros bots |
| Bot admin (privacidade ligada ou não) | todas as mensagens, menos as de outros bots |
| Sempre, em qualquer modo | todas as mensagens de serviço (entrou, saiu, fixou, mudou título…); tudo do privado; tudo dos canais em que é membro |

Fontes: [privacy mode](https://core.telegram.org/bots/features#privacy-mode),
[FAQ](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get).

- Desligar: @BotFather, `/setprivacy`
  ([edit settings](https://core.telegram.org/bots/features#edit-settings)).
  `getMe` mostra o estado em `can_read_all_group_messages`
  ([User](https://core.telegram.org/bots/api#user)).
- **Mudar com o bot já no grupo não vale para esse grupo:** "the bot will need
  to be re-added to the group for this change to take effect". Ou seja, sair
  e entrar.
- **Ser admin dá acesso a tudo:** "bot admins always receive all messages".
  Promover um bot que já está no grupo basta, sem sair e entrar: [verificar].
- Os membros veem no app o modo de cada bot na lista de membros.
- Uma mensagem só chega a um bot com privacidade ligada por vez; resposta tem
  prioridade (FAQ).
- Mensagem de outro bot: o FAQ diz que o bot nunca vê. A 10.0 abriu exceções
  com o modo bot-to-bot ligado no @BotFather
  ([bot-to-bot](https://core.telegram.org/bots/features#communication-in-group-chats)).
- Menção `@bot` em texto livre, com privacidade ligada e sem ser admin: a doc
  não lista esse caso [verificar]. Para o Kakou não importa se o bot for admin.

## Entradas e saídas

### Três fontes

| Fonte | O que é | Precisa |
|---|---|---|
| Mensagem de serviço `new_chat_members` / `left_chat_member` | uma mensagem no grupo. `new_chat_members` é lista (quem adiciona pode pôr várias pessoas) | nada: mensagem de serviço chega em qualquer modo. Só grupo e supergrupo |
| Update `chat_member` | mudança de status de qualquer membro, com antes e depois | bot admin **e** `"chat_member"` em `allowed_updates`. Não vem na lista vazia padrão |
| Update `chat_join_request` | alguém pediu para entrar | `can_invite_users` e `"chat_join_request"` em `allowed_updates` (o Kakou passa a lista explícita) |

Fontes: [Update](https://core.telegram.org/bots/api#update),
[Message](https://core.telegram.org/bots/api#message),
[getUpdates `allowed_updates`](https://core.telegram.org/bots/api#getupdates).

`chat_member` é a fonte boa: traz o link usado, o "antes" e o "depois", e cobre
banimento e restrição. A mensagem de serviço é complemento. Os dois chegam para
a mesma entrada: deduplicar por (chat, pessoa, `date`). Se grupo muito grande
deixa de gerar mensagem de serviço: [verificar]. Se `chat_member` chega para
inscrito de canal: [verificar].

Entrada por link (valores ilustrativos):

```json
{
  "update_id": 912345701,
  "chat_member": {
    "chat": { "id": -1001234567890, "type": "supergroup", "title": "Lançamento Out/26 · Grupo 1" },
    "from": { "id": 222222222, "is_bot": false, "first_name": "Ana", "username": "anasouza" },
    "date": 1760610100,
    "old_chat_member": { "status": "left", "user": { "id": 222222222, "is_bot": false, "first_name": "Ana", "username": "anasouza" } },
    "new_chat_member": { "status": "member", "user": { "id": 222222222, "is_bot": false, "first_name": "Ana", "username": "anasouza" } },
    "invite_link": {
      "invite_link": "https://t.me/+AbCdEf123456",
      "creator": { "id": 7000000001, "is_bot": true, "first_name": "Kakou", "username": "kakou_gl_bot" },
      "creates_join_request": false, "is_primary": false, "is_revoked": false,
      "name": "stories-instagram", "member_limit": 5000
    }
  }
}
```

Como ler (`status` de [ChatMember](https://core.telegram.org/bots/api#chatmember);
a leitura de "quem fez" é nossa):

| Antes → depois | Quer dizer |
|---|---|
| `left` → `member` | entrou. `invite_link` presente: por link. `via_join_request`: pedido aprovado sem link. `via_chat_folder_invite_link`: por pasta. Nenhum e `from` ≠ a pessoa: alguém adicionou |
| `member` ou `restricted` → `left` | saiu. `from` = a pessoa: saiu sozinha. `from` = admin: foi removida sem ban |
| qualquer → `kicked` | banida; `until_date` 0 é para sempre |
| `member` → `restricted` | restrita; `is_member` diz se continua no grupo |
| `member` → `administrator` | virou admin |

Fonte: [ChatMemberUpdated](https://core.telegram.org/bots/api#chatmemberupdated).

### Pedido de entrada

- Link com `creates_join_request: true` (ou grupo com aprovação ligada no app)
  faz a pessoa pedir em vez de entrar
  ([join requests](https://core.telegram.org/api/invites#join-requests),
  MTProto).
- [`ChatJoinRequest`](https://core.telegram.org/bots/api#chatjoinrequest):
  `chat`, `from`, `user_chat_id`, `date`, `bio` (opcional), `invite_link` (o
  link usado), `query_id` (só para bot "guard", 10.1).
- Decidir: `approveChatJoinRequest` ou `declineChatJoinRequest`, com `chat_id`
  e `user_id`; respondem `true`.
- **Janela de 5 minutos, confirmada:** com `user_chat_id`, "the bot can use
  this identifier for 5 minutes to send messages until the join request is
  processed, assuming no other administrator contacted the user". A janela
  fecha na decisão: a mensagem privada vai **antes** de aprovar.
- Guard bot (10.1): se o bot for o "guard" do grupo, o pedido chega com
  `query_id` e o bot tem **10 segundos** para chamar `answerChatJoinRequestQuery`
  (`approve`, `decline` ou `queue`) ou `sendChatJoinRequestWebApp`, que abre
  uma Mini App para a pessoa antes da decisão
  ([answerChatJoinRequestQuery](https://core.telegram.org/bots/api#answerchatjoinrequestquery),
  [Mini Apps em pedido de entrada](https://core.telegram.org/bots/webapps#launching-mini-apps-on-chat-join-requests)).
  Na Mini App dá para pedir telefone (`requestContact`) e permissão de mensagem
  privada (`requestWriteAccess`)
  ([WebApp](https://core.telegram.org/bots/webapps#initializing-mini-apps)).
  Como um bot vira guard bot de um grupo: a doc não diz [verificar]. `getMe`
  traz `supports_join_request_queries` e `getChat` traz `guard_bot` (só para
  admin).

### O que se sabe de quem entra

| Campo | Vem? |
|---|---|
| `id` | sempre. É o mesmo id do chat privado com o bot |
| `first_name` | sempre |
| `last_name`, `username` | se a pessoa tiver |
| `language_code` | opcional no [User](https://core.telegram.org/bots/api#user). Se vem em `chat_member`: [verificar] |
| `is_premium` | opcional |
| `bio` | só no pedido de entrada |
| foto | à parte, por `getUserProfilePhotos` |
| **telefone** | **não.** `User` não tem o campo. Telefone só chega se a pessoa mandar: botão `request_contact`, "available in private chats only" ([KeyboardButton](https://core.telegram.org/bots/api#keyboardbutton)), ou Mini App com `requestContact` |

A política de privacidade do Telegram avisa a pessoa: "Se o bot é um membro do
mesmo grupo que você, ele pode saber que você é um membro"
([privacidade, 6.3](https://telegram.org/privacy)).

### Mensagem privada para quem entrou

- Regra geral, sem exceção para grupo: o bot só fala no privado com quem falou
  com ele antes
  ([introdução](https://core.telegram.org/bots#how-are-bots-different-from-users)).
  Estar no mesmo grupo não abre a conversa. Tentar dá o 403 do outro documento.
- Quem já deu `/start` no bot recebe normalmente: o `id` do `chat_member` é o
  mesmo do contato.
- Pedido de entrada: os 5 minutos acima.
- Dentro do grupo, sem ser privado: mensagem efêmera, que só a pessoa vê (ver
  [Mandar no grupo](#mandar-no-grupo)).
- Botão no grupo com `t.me/<bot>?start=<código>` leva a pessoa ao privado; ao
  tocar em Começar ela vira contato do bot. `answerCallbackQuery` com `url`
  faz o mesmo a partir de um botão de callback, e o bot fica sabendo quem
  tocou ([answerCallbackQuery](https://core.telegram.org/bots/api#answercallbackquery)).

## Links de convite

| Método | Faz | Detalhes |
|---|---|---|
| [`createChatInviteLink`](https://core.telegram.org/bots/api#createchatinvitelink) | cria um link extra | `name` (0 a 32 caracteres), `expire_date` (Unix), `member_limit` (1 a 99.999), `creates_join_request`. Com `creates_join_request`, não aceita `member_limit`. Devolve [`ChatInviteLink`](https://core.telegram.org/bots/api#chatinvitelink) |
| [`editChatInviteLink`](https://core.telegram.org/bots/api#editchatinvitelink) | muda um link extra **criado pelo bot** | os mesmos campos |
| [`revokeChatInviteLink`](https://core.telegram.org/bots/api#revokechatinvitelink) | revoga um link criado pelo bot | revogar o principal gera outro principal sozinho |
| [`exportChatInviteLink`](https://core.telegram.org/bots/api#exportchatinvitelink) | gera um novo link principal | "any previously generated primary link is revoked". Cada admin tem os seus links; se isso derruba o principal do dono do grupo: [verificar]. Usar `createChatInviteLink` |
| [`createChatSubscriptionInviteLink`](https://core.telegram.org/bots/api#createchatsubscriptioninvitelink) | link pago, **só canal** | 30 dias fixos, 1 a 10.000 Stars por período, `can_invite_users` |

`ChatInviteLink`: `invite_link`, `creator`, `creates_join_request`,
`is_primary`, `is_revoked`, `name`, `expire_date`, `member_limit`,
`pending_join_request_count` e, nos pagos, `subscription_period` e
`subscription_price`.

- **Dá para saber por qual link a pessoa entrou:** `chat_member.invite_link`
  ("used by the user to join the chat; for joining by invite link events
  only") e `chat_join_request.invite_link`. Com isso, link → tag.
- Só os links criados **pelo bot** vêm inteiros: de outro admin, "the second
  part of the link will be replaced with '…'". "Bots can't use invite links
  generated by other administrators"
  ([exportChatInviteLink](https://core.telegram.org/bots/api#exportchatinvitelink)).
  Quem entrar pelo link que o dono do grupo divulgou chega sem origem útil.
- `member_limit` conta "members of the chat simultaneously after joining the
  chat via this invite link": é teto do link, não do grupo.
- O link não muda de grupo. "Encheu, vai para o próximo" é redirecionamento
  nosso: um endereço do Kakou que aponta para o link do grupo da vez.
- Quem entrou por cada link, depois do fato, a Bot API não lista
  (`messages.getChatInviteImporters` é MTProto,
  [invites](https://core.telegram.org/api/invites#invite-links)). Tem de ser
  guardado na hora, pelo update.
- Pedido feito por link e depois aprovado: se o `chat_member` da aprovação
  também traz `invite_link` [verificar]. Guardar o link já no
  `chat_join_request`.

## Administrar

| Método | Faz | Limite |
|---|---|---|
| [`setChatTitle`](https://core.telegram.org/bots/api#setchattitle) | título | 1 a 128 caracteres |
| [`setChatDescription`](https://core.telegram.org/bots/api#setchatdescription) | descrição | 0 a 255 caracteres |
| [`setChatPhoto`](https://core.telegram.org/bots/api#setchatphoto) / `deleteChatPhoto` | foto | upload em `multipart/form-data` |
| [`pinChatMessage`](https://core.telegram.org/bots/api#pinchatmessage) | fixa | `disable_notification: false` avisa **todos os membros** do novo fixado |
| `unpinChatMessage` / `unpinAllChatMessages` | desafixa | sem `message_id`, desafixa o mais recente |
| [`setChatPermissions`](https://core.telegram.org/bots/api#setchatpermissions) | permissões padrão de quem não é admin | grupo e supergrupo |
| [`restrictChatMember`](https://core.telegram.org/bots/api#restrictchatmember) | restringe uma pessoa | **só supergrupo**. `until_date`: menos de 30 s ou mais de 366 dias é para sempre |
| [`banChatMember`](https://core.telegram.org/bots/api#banchatmember) | bane | em supergrupo e canal, não volta por link até desbanir. Mesma regra de `until_date` |
| [`unbanChatMember`](https://core.telegram.org/bots/api#unbanchatmember) | desbane | sem `only_if_banned`, também **tira** quem é membro: é o "remover sem banir" |
| [`deleteMessage`](https://core.telegram.org/bots/api#deletemessage) | apaga uma | só mensagem de **menos de 48 h**; não apaga a de criação de supergrupo, canal ou tópico |
| [`deleteMessages`](https://core.telegram.org/bots/api#deletemessages) | apaga várias | 1 a 100 ids; os que não existem são pulados |
| [`createForumTopic`](https://core.telegram.org/bots/api#createforumtopic) | cria tópico | só em supergrupo que já é fórum; nome 1 a 128; devolve `message_thread_id` |
| `editForumTopic`, `closeForumTopic`, `reopenForumTopic`, `deleteForumTopic` | gerencia tópico | apagar leva todas as mensagens do tópico |
| [`setChatMemberTag`](https://core.telegram.org/bots/api#setchatmembertag) | etiqueta ao lado do nome | 0 a 16 caracteres, sem emoji; **todos veem** |
| [`leaveChat`](https://core.telegram.org/bots/api#leavechat) | o bot sai | |

**Fechar o grupo só para admins:** `setChatPermissions` com todos os `can_send_*`
em `false` e `use_independent_chat_permissions: true`. Admin não é afetado.
Desde a 10.0, `can_react_to_messages` também; se omitido, segue
`can_send_messages`. Reabrir: o mesmo com `true`. Não há horário no método:
abrir e fechar na hora certa é agendamento nosso
([ChatPermissions](https://core.telegram.org/bots/api#chatpermissions)).

**Tópicos:** todo fórum tem o tópico "General", id 1. Mensagem sem
`message_thread_id` cai nele. Os outros têm id igual ao da mensagem de serviço
que os criou ([forum](https://core.telegram.org/api/forum#forum-topics),
MTProto). Na Bot API, `message_thread_id` vai em `sendMessage` e volta em
`Message` com `is_topic_message`.

### O que a Bot API não faz

| Não faz | Fonte |
|---|---|
| **Criar grupo, supergrupo ou canal** | `messages.createChat` e `channels.createChannel`: "Only users can use this method" ([createChat](https://core.telegram.org/method/messages.createChat), [createChannel](https://core.telegram.org/method/channels.createChannel), MTProto). A doc de `Message` também diz que o bot "can't be a member of a supergroup when it is created" |
| Adicionar uma pessoa ao grupo | não há método; só link |
| Listar os grupos do bot, os membros ou o histórico | não há método |
| Ligar fórum, modo lento, @ público, aprovação geral, histórico visível para quem entra | não há método. São configurações do app |
| Converter em supergrupo ou gigagrupo | não há método |
| Ligar grupo de discussão ao canal | `channels.setDiscussionGroup` é MTProto ([discussion](https://core.telegram.org/api/discussion#linking-a-discussion-group)) |
| Agendar mensagem | ver abaixo |

"Não há método" quer dizer: não está na lista de métodos da
[Bot API](https://core.telegram.org/bots/api#available-methods) lida em 16/10.

## Mandar no grupo

### Limites

| Escopo | Limite | Fonte |
|---|---|---|
| Um grupo | até 20 mensagens por minuto | [FAQ](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this) |
| O bot inteiro | cerca de 30 por segundo | idem |

- O resto (429, `retry_after`, paid broadcast) está no
  [outro documento](telegram-bot-api.md#limites-de-envio).
- O FAQ fala dos 30/s para "bulk notifications". Se os envios a grupo entram
  nessa conta: [verificar]. Na dúvida, contar.
- Se edição de mensagem conta nos 20/min: [verificar].
- Na prática: uma mensagem para 40 grupos são 40 chamadas, cabe em 2 s. O
  aperto é **dentro** de um grupo: boas-vindas uma a uma, num pico de entradas,
  estoura os 20/min.
- Bot admin ignora o modo lento e não paga Stars para mandar mensagem em grupo
  que cobra (`can_manage_chat`,
  [ChatAdministratorRights](https://core.telegram.org/bots/api#chatadministratorrights)).

### Conteúdo

- Mídia: os mesmos `sendPhoto`, `sendVideo`, `sendDocument`… do privado.
  Legenda até 1.024 caracteres. Por URL: 5 MB foto, 20 MB o resto. Por upload:
  10 MB foto, 50 MB o resto. Por `file_id`, sem limite
  ([sending files](https://core.telegram.org/bots/api#sending-files)).
  Álbum: [`sendMediaGroup`](https://core.telegram.org/bots/api#sendmediagroup),
  2 a 10 itens.
- Vídeo em grupo grande pode voltar com `message_id` **0**: "the server might
  automatically schedule a message instead of sending it immediately". Até
  sair de verdade, não dá para fixar nem editar
  ([Message](https://core.telegram.org/bots/api#message)).
- Botões: o mesmo `inline_keyboard`. Em grupo, qualquer membro toca, e o
  `callback_query` diz quem.
- Responder a uma mensagem:
  [`reply_parameters`](https://core.telegram.org/bots/api#replyparameters) com
  `message_id`; `quote` para citar um trecho exato; `allow_sending_without_reply`
  para mandar mesmo se a original foi apagada. Em fórum, mandar também o
  `message_thread_id` do tópico.
- Mencionar: `@usuario` no texto vira entidade `mention`. Quem não tem @: link
  `tg://user?id=<id>` dentro de link inline (`<a href="tg://user?id=123">Ana</a>`),
  que vira `text_mention`. Funciona para membro do grupo; fora dele, só se a
  pessoa já falou com o bot
  ([formatting options](https://core.telegram.org/bots/api#formatting-options),
  [MessageEntity](https://core.telegram.org/bots/api#messageentity)). Não
  achei menção a "todos" [verificar]; o aviso a todos documentado é fixar com
  notificação.
- **Mensagem efêmera** (10.2): `ephemeral_message_parameters.receiver_user_id`
  em `sendMessage` e afins. Só aquela pessoa vê, dentro do grupo. Bot admin
  manda "to any non-bot member of the chat at any time". Bot não admin, só em
  até 15 s depois de um toque em botão ou de um comando efêmero. Entrega não
  garantida, "especially if the user is offline", e pode sumir sozinha
  ([ephemeral](https://core.telegram.org/bots/api#ephemeral-messages-and-commands),
  [features](https://core.telegram.org/bots/features#ephemeral-messages)). O
  Telegram sugere para boas-vindas.
- **Mensagem agendada: não existe para bot.** `sendMessage` não tem data. No
  MTProto, o erro `SCHEDULE_BOT_NOT_ALLOWED`: "Bots cannot schedule messages"
  ([messages.sendMessage](https://core.telegram.org/method/messages.sendMessage)).
  O agendamento é do Kakou.
- **Editar o que foi enviado:**
  [`editMessageText`](https://core.telegram.org/bots/api#editmessagetext)
  (1 a 4.096), `editMessageCaption`, `editMessageMedia`,
  `editMessageReplyMarkup`. Só mensagem sem teclado ou com teclado inline
  ([updating messages](https://core.telegram.org/bots/api#updating-messages)).
  A doc só põe prazo de 48 h para mensagem de Business; para a do próprio bot
  em grupo não diz [verificar]. Apagar, sim: 48 h.

### O SDR respondendo quando chamado

Com o bot admin, toda mensagem chega. "Chamado" é regra nossa:

- entidade `mention` cujo texto é `@<bot>`, ou `text_mention` com o id do bot;
- `reply_to_message.from.id` igual ao id do bot;
- comando `/algo@<bot>` (ou comando efêmero, que os outros não veem).

Resposta: `sendMessage` com `reply_parameters.message_id` e o mesmo
`message_thread_id`. `sendChatAction` (`typing`) mostra que está escrevendo
por até 5 s ([sendChatAction](https://core.telegram.org/bots/api#sendchataction)).
O rascunho em streaming (`sendMessageDraft`) é só para chat privado
([sendMessageDraft](https://core.telegram.org/bots/api#sendmessagedraft)).
Em fórum, `reply_to_message` pode vir apontando para a mensagem que abriu o
tópico; conferir antes de tratar como "respondeu ao bot" [verificar].

O "guest mode" (10.0) deixa o bot responder em grupo de que **não** é membro,
quando mencionado, uma resposta por menção e sem ver histórico
([guest bots](https://core.telegram.org/bots/features#guest-bots)). Nos grupos
da organização, o bot já é membro: não precisa.

## Tipos de chat

| Tipo | `type` na Bot API | Tamanho | Quem escreve |
|---|---|---|---|
| Grupo comum | `group` | até 200 membros | membros, conforme permissões |
| Supergrupo | `supergroup` | até 200.000 membros | membros, conforme permissões |
| Gigagrupo | `supergroup` [verificar] | sem teto (mais de 200 mil) | só admins; não aceita convite; conversão só de ida |
| Canal | `channel` | inscritos ilimitados | só admins |

Fontes: [channels, supergroups, gigagroups and basic groups](https://core.telegram.org/api/channel)
(MTProto), [FAQ do Telegram](https://telegram.org/faq#q-what-39s-the-difference-between-groups-and-channels),
[Chat](https://core.telegram.org/bots/api#chat).

- **Grupo comum → supergrupo.** O app migra sozinho quando um admin faz algo
  que só supergrupo faz ([migration](https://core.telegram.org/api/channel#migration)).
  O bot recebe, no grupo velho, uma mensagem com `migrate_to_chat_id` e, no
  novo, uma com `migrate_from_chat_id`
  ([Message](https://core.telegram.org/bots/api#message)). Envio para o id
  velho dá o 400 com `migrate_to_chat_id` do outro documento. Trocar o id
  guardado.
- Se o grupo criado hoje no app nasce comum ou supergrupo, e se pôr o bot como
  admin pelo link já migra: [verificar]. A página do MTProto diz que só "in
  previous versions" grupos comuns eram criados. Tratar os dois.
- Restrição de uma pessoa (`restrictChatMember`), tópicos e @ público são só de
  supergrupo.
- **Canal × grupo, para lançamento:** canal é só aviso, sem teto, e o bot não
  vê quem lê (só a contagem, `getChatMemberCount`). Grupo deixa o público
  falar e mostra quem entrou e saiu. Grupo fechado faz o papel de canal com a
  lista de quem entrou.
- **Grupo de discussão ligado a canal:** `getChat` traz `linked_chat_id` nos
  dois sentidos ([ChatFullInfo](https://core.telegram.org/bots/api#chatfullinfo)).
  Cada post do canal é encaminhado ao grupo e fixado lá
  ([discussion](https://core.telegram.org/api/discussion#channel-comments),
  MTProto). Na Bot API, chega com `is_automatic_forward` e `sender_chat` = o
  canal; os comentários são respostas a ele. O bot precisa estar no grupo para
  ver os comentários.
- Comunidades (10.2): vários grupos, canais e bots ligados por um assunto.
  Para o bot é só leitura (`community` em `ChatFullInfo` e mensagens de
  serviço); não há método para criar ou montar
  ([communities](https://core.telegram.org/bots/features#communities),
  [Community](https://core.telegram.org/bots/api#community)).

## Novidades de 2025 e 2026

Só o que mexe em grupo e canal. Fonte de todas:
[changelog](https://core.telegram.org/bots/api-changelog).

| Versão | Data | O que mudou |
|---|---|---|
| 9.0 | 11/04/2025 | mensagens pagas em grupo: `paid_star_count` e `paid_message_price_changed` |
| 9.2 | 15/08/2025 | mensagens diretas de canal (`is_direct_messages`, `direct_messages_topic_id`) e posts sugeridos; direito `can_manage_direct_messages` |
| 9.3 | 31/12/2025 | bot pode desligar `can_restrict_members` em canal; tópicos e `sendMessageDraft` no privado |
| 9.4 | 09/02/2026 | emoji personalizado em grupo se o dono do bot tem Premium; cor nos botões (`style`); mensagens de serviço `chat_owner_left` e `chat_owner_changed` |
| 9.5 | 01/03/2026 | etiquetas de membro: `setChatMemberTag`, `tag`, `sender_tag`, direitos `can_manage_tags` e `can_edit_tag`; entidade `date_time` (data no fuso de quem lê) |
| 10.0 | 08/05/2026 | guest mode; permissão `can_react_to_messages`; `getChatAdministrators` com `return_bots`; apagar reações; bot vê certas mensagens de outros bots em grupo |
| 10.1 | 11/06/2026 | pedido de entrada por guard bot: `guard_bot`, `ChatJoinRequest.query_id`, `answerChatJoinRequestQuery`, `sendChatJoinRequestWebApp`; mensagens ricas (`sendRichMessage`) |
| 10.2 | 14/07/2026 | mensagens e comandos efêmeros em grupo; comunidades |
| 10.3 | 24/08/2026 | `ephemeral_message_parameters` **substitui** `receiver_user_id` e `callback_query_id` (quebra quem usou a 10.2); direito `can_send_welcome_messages`; `community_chat_joined`; botão desabilitado |

De 8.x, só a 8.3 (12/02/2025) toca em grupo, de leve: reação em mensagem de
serviço.

## Regras do Telegram que pesam em grupo

Dos [termos do desenvolvedor](https://telegram.org/tos/bot-developers), além
do que o outro documento já cita:

- 4.3, "Data Scraping": não coletar, guardar ou processar "beyond what is
  essential for the operation of your services". Proibido sempre: juntar
  dados para "large datasets, machine learning models and AI products, such
  as scraping public group or channel contents"
  ([4.3](https://telegram.org/tos/bot-developers#4-3-data-scraping)).
- 4.2(b): apagar dado de usuário quando não for mais preciso para operar
  ([4.2](https://telegram.org/tos/bot-developers#4-2-data-storage-and-retention)).
- Ler o grupo da própria organização para o SDR responder e para registrar
  entradas é operação. Guardar tudo para sempre, ou usar as conversas para
  treinar modelo, não é.

## [verificar] com um bot de teste

- Promover a admin um bot que já está no grupo e conferir se passa a receber
  todas as mensagens sem sair e entrar.
- `language_code` no `chat_member` de quem entra.
- Se `chat_member` da aprovação de um pedido traz `invite_link`.
- Se `chat_member` chega para inscrito de canal.
- Se o grupo criado no app nasce `group` ou `supergroup`, e se o link
  `startgroup&admin=` migra.
- O que `can_send_welcome_messages` libera para bot, e como um bot vira guard
  bot.
- Se envio a grupo conta nos 30/s e se edição conta nos 20/min.
- Prazo para o bot editar a própria mensagem no grupo.
- Ritmo aceito de `approveChatJoinRequest` num pico de pedidos (a doc não dá
  número).

## O que isso decide para o Kakou

- **Criar o grupo fica manual; o resto o bot faz.** A pessoa cria o grupo ou
  canal no app, liga tópicos, @ público, modo lento ou aprovação geral se
  quiser, e põe o bot pelo link
  `t.me/<bot>?startgroup=<código>&admin=change_info+delete_messages+restrict_members+invite_users+pin_messages+manage_topics`
  (canal: `startchannel&admin=post_messages+edit_messages+delete_messages+invite_users`).
  O código liga o grupo ao lançamento. Daí em diante, automatizável: título,
  descrição, foto, links por origem, regras fixadas, abrir e fechar,
  aprovação de entrada, banir, apagar, tópicos, mensagens programadas.
- **Bot sempre admin; modo privacidade fica ligado.** Admin já vê tudo, e é
  exigido para `chat_member`, links e moderação. Desligar a privacidade
  abriria todo grupo em que alguém puser o bot, inclusive os de fora. O painel
  lê os direitos do `my_chat_member` e avisa o que falta.
- **Cadastro de grupos do nosso lado.** Uma linha por chat (id `bigint`,
  tipo, título, status do bot, direitos, lançamento), vinda do `my_chat_member`
  e corrigida por `migrate_to_chat_id`. Conferência diária com `getChat` e
  `getChatMember`. Não existe listar.
- **Links criados pelo bot, um por grupo e origem, mapeados para tag.** O
  `invite_link` do `chat_member` (ou do `chat_join_request`) diz a origem.
  Link divulgado pelo dono do grupo não dá origem. "Encheu, passa para o
  próximo" é um redirecionamento do Kakou, com `member_limit` e a contagem de
  membros que a gente mantém.
- **Membro de grupo vira contato sem telefone e sem disparo privado.** Entra
  com id, nome, @, tag do link e origem "grupo". Disparo 1:1 só depois do
  `/start`, como hoje. Para converter: link com pedido de entrada e mensagem
  privada nos 5 minutos, **antes** de aprovar, com botão
  `t.me/<bot>?start=<código>`; ou botão com o mesmo link no grupo.
- **Agendamento é do Kakou.** A Bot API não agenda. A fila e o tick de 1
  minuto já existentes mandam para N grupos no horário (20/min por grupo,
  ~30/s no total) e também agendam fechar e abrir o grupo.
- **Boas-vindas sem uma mensagem por entrada.** Regras fixadas
  (`pinChatMessage`) e, por pessoa, mensagem efêmera, que só ela vê (bot
  admin, entrega não garantida). Mensagem pública por entrada estoura os
  20/min num pico.
- **Webhook do SDR-73.** Hoje ele ignora tudo que não é privado e o
  `my_chat_member` de grupo (`src/server/disparos/webhook-telegram.ts`), e o
  `setWebhook` pede só `message` e `my_chat_member`
  (`src/server/telegram/cliente.ts`). Passa a rotear por `chat.type`, sem
  mudar o fluxo privado. `allowed_updates` vira `message`, `edited_message`,
  `my_chat_member`, `chat_member`, `chat_join_request`, `callback_query` e,
  com canal, `channel_post`. Bots já conectados precisam de um novo
  `setWebhook`: sem o parâmetro, vale a lista anterior.
- **Volume.** Grupo de lançamento gera muito update, e os de um mesmo chat
  saem em fila (outro documento). Continuar gravando e respondendo 200 na
  hora, processar depois. Guardar mensagem de grupo com prazo de retenção
  (termos 4.2 e 4.3), não para sempre.
- **SDR no grupo só quando chamado:** menção ao bot, resposta a ele ou
  comando. Responde citando a mensagem, no mesmo tópico, dentro dos 20/min do
  grupo. Pergunta pessoal pode ir como efêmera.

## Pontos abertos

- **Grupo aberto ou com pedido de entrada?** O pedido dá a janela de 5 minutos
  para levar a pessoa ao privado (e filtrar), mas é um toque a mais para
  entrar. Decisão de produto.
- **Guard bot com Mini App** pode pedir telefone e permissão de mensagem
  privada antes de aprovar. Depende de saber como o bot vira guard bot e de
  construir uma Mini App. Vale o esforço no primeiro lançamento?
- **O que guardar do grupo:** todas as mensagens, com prazo, ou só as que
  chamam o SDR e as entradas e saídas? Mexe em custo, em LGPD e nos termos
  4.3.
- **Membro de grupo conta no limite de contatos do plano?**
- **Etiqueta do Telegram (`setChatMemberTag`) × tag do Kakou.** A do Telegram
  aparece para todo o grupo. Usar só se a GuessLess quiser mostrar algo
  (ex.: "aluno"); a tag interna fica no Kakou.
- **Canal com grupo de discussão ou só grupos?** Canal não mostra quem entrou
  nem quem leu.
- Fora do escopo, mas útil: a 9.6 (03/04/2026) trouxe **bots gerenciados**, em
  que um bot "gerente" cria bots para os donos por link
  (`t.me/newbot/<gerente>/<usuario>`) e pega o token por `getManagedBotToken`
  ([managed bots](https://core.telegram.org/bots/features#managed-bots)). Pode
  tirar o passo de copiar token do @BotFather no conectar. [verificar]
