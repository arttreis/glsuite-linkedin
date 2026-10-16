# Telegram Bot API: o que o disparador usa

Pesquisa nas páginas oficiais do Telegram (core.telegram.org e telegram.org),
16/10/2026. Objetivo: conectar o bot da organização, montar a lista pelo
/start, disparar para um segmento e registrar o que saiu, o que falhou, as
respostas e as saídas (§4.20 do épico). Onde a documentação não diz, o fato vem
do código do servidor oficial da Bot API
([tdlib/telegram-bot-api](https://github.com/tdlib/telegram-bot-api), commit
`e3e9dd8`, linkado pela própria doc) ou do TDLib
([tdlib/td](https://github.com/tdlib/td), commit `a94b83d`), e está marcado
como "código".

## Versão e formato

- Versão atual: **Bot API 10.3**, de 24/08/2026
  ([changelog](https://core.telegram.org/bots/api-changelog)). As últimas
  (10.0 a 10.3, de maio a agosto de 2026) trouxeram mensagens ricas, mensagens
  efêmeras e comunidades. Nada de 2026 muda webhook, `sendMessage` ou
  `my_chat_member` para o disparador.
- Chamada: `https://api.telegram.org/bot<token>/<método>`, só HTTPS, GET ou
  POST. Parâmetros na query, em `application/x-www-form-urlencoded`, em
  `application/json` (menos upload) ou em `multipart/form-data`. Tudo em UTF-8;
  o nome do método não diferencia maiúsculas
  ([making requests](https://core.telegram.org/bots/api#making-requests)).
- Resposta: sempre tem `ok`. Deu certo: `{ "ok": true, "result": … }`. Deu
  errado: `{ "ok": false, "error_code": 400, "description": "Bad Request: chat not found" }`,
  às vezes com `parameters`
  ([ResponseParameters](https://core.telegram.org/bots/api#responseparameters)):
  - `retry_after`: segundos até poder repetir, depois de estourar o controle
    de flood;
  - `migrate_to_chat_id`: o grupo virou supergrupo, e este é o id novo.
- A doc avisa que o conteúdo de `error_code` "is subject to change". O status
  HTTP vem igual ao `error_code` (testado em 16/10 com token inventado).
  Classificar o erro pelo código e pelo texto.
- Ambiente de teste: `https://api.telegram.org/bot<token>/test/<método>`, com
  conta e bot criados nele
  ([features](https://core.telegram.org/bots/features#dedicated-test-environment)).

## Conectar o bot

| Uso | Método | Observações |
|---|---|---|
| Validar o token | `getMe` | Sem parâmetros. Devolve o `User` do bot: `id`, `is_bot`, `first_name`, `username` e campos que só vêm aqui (`can_join_groups`, `can_read_all_group_messages`, `supports_inline_queries`…). Token inventado: `401 Unauthorized`. Token mal formado: `404 Not Found` (testado). |
| Ligar o webhook | `setWebhook` | `url` (HTTPS; vazia desliga). `secret_token`: 1 a 256 caracteres, só `A-Z`, `a-z`, `0-9`, `_` e `-`; volta no header `X-Telegram-Bot-Api-Secret-Token` de todo aviso. `allowed_updates`: lista vazia recebe tudo menos `chat_member`, `message_reaction` e `message_reaction_count`; sem o parâmetro, fica a lista anterior. `drop_pending_updates`. `max_connections`: 1 a 100, padrão 40. Também `certificate` e `ip_address`. Responde `true`. |
| Desligar | `deleteWebhook` | `drop_pending_updates` opcional. |
| Saúde | `getWebhookInfo` | `url`, `pending_update_count`, `last_error_date`, `last_error_message`, `last_synchronization_error_date`, `max_connections`, `allowed_updates`, `ip_address`, `has_custom_certificate`. `url` vazio: o bot usa `getUpdates` ou não tem webhook. |

Fontes: [getMe](https://core.telegram.org/bots/api#getme),
[setWebhook](https://core.telegram.org/bots/api#setwebhook),
[deleteWebhook](https://core.telegram.org/bots/api#deletewebhook),
[WebhookInfo](https://core.telegram.org/bots/api#webhookinfo).

O que o endereço do webhook precisa ([setWebhook](https://core.telegram.org/bots/api#setwebhook),
[FAQ](https://core.telegram.org/bots/faq#im-having-problems-with-webhooks),
[guia de webhooks](https://core.telegram.org/bots/webhooks#the-short-version)):

- porta 443, 80, 88 ou 8443;
- TLS 1.2 ou mais, com certificado válido cujo CN ou SAN é o domínio. O FAQ
  diz que certificado wildcard "may not be supported" e que **redirect não é
  suportado**;
- IPv4: o guia diz que IPv6 não é suportado. Os avisos saem de
  149.154.160.0/20 e 91.108.4.0/22, faixa que pode mudar;
- o aviso é um POST com o `Update` em JSON no corpo (doc), com
  `Content-Type: application/json` (código).

O bot tem um webhook só. `getUpdates` e webhook são exclusivos: com webhook
ligado, `getUpdates` dá 409
([getting updates](https://core.telegram.org/bots/api#getting-updates)). Se
outro sistema chamar `setWebhook` no mesmo bot, a URL dele substitui a nossa.
Se ele lia por `getUpdates`, o nosso `setWebhook` derruba a leitura dele com
`Conflict: terminated by setWebhook request` (código).

Retentativa:

- Doc: resposta fora de 2XX faz o Telegram repetir e desistir "after a
  reasonable amount of attempts". Nenhum update fica guardado mais de 24 h.
- Código (`WebhookActor::on_update_error`):
  - a primeira repetição é imediata; depois 2, 4, 8… segundos, até um teto
    sorteado entre 60 e 120 s;
  - um `Retry-After` na nossa resposta é respeitado, até 3.600 s;
  - o update é descartado 24 h depois da data do evento;
  - os updates de um chat saem em fila, um de cada vez: um que falha segura
    os seguintes do mesmo chat. `message` e `my_chat_member` usam filas
    diferentes e podem chegar fora de ordem entre si;
  - 23 h seguidas de HTTP 410 apagam o webhook.
- Quanto tempo o Telegram espera a nossa resposta não está na doc [verificar].
- `update_id` serve para descartar repetidos e reordenar. Depois de uma semana
  sem updates, o próximo id é sorteado
  ([Update](https://core.telegram.org/bots/api#update)).

## Entrada: /start e deep link

- Link: `https://t.me/<bot>?start=<código>`. O código aceita `A-Z`, `a-z`,
  `0-9`, `_` e `-`, até 64 caracteres; para conteúdo binário, base64url
  ([deep linking](https://core.telegram.org/bots/features#deep-linking)).
- Quem abre o link vê o botão Começar, mesmo que já tenha iniciado o bot. Ao
  tocar, o bot recebe a mensagem `/start <código>`
  ([bot links](https://core.telegram.org/api/links#bot-links)). Quem abre e
  não toca não chega ao bot.
- O bot não abre conversa: "Bots can't start conversations with users. A user
  must either add them to a group or send them a message first."
  ([introdução](https://core.telegram.org/bots#how-are-bots-different-from-users)).

Mensagem privada, com os campos de
[Message](https://core.telegram.org/bots/api#message),
[User](https://core.telegram.org/bots/api#user) e
[Chat](https://core.telegram.org/bots/api#chat) (valores ilustrativos):

```json
{
  "update_id": 912345678,
  "message": {
    "message_id": 15,
    "from": { "id": 123456789, "is_bot": false, "first_name": "Ana", "last_name": "Souza", "username": "anasouza", "language_code": "pt-br" },
    "chat": { "id": 123456789, "type": "private", "first_name": "Ana", "last_name": "Souza", "username": "anasouza" },
    "date": 1760600000,
    "text": "/start k7Qm2xPa",
    "entities": [{ "offset": 0, "length": 6, "type": "bot_command" }]
  }
}
```

- `last_name`, `username` e `language_code` (tag IETF) são opcionais. Muita
  gente não tem `username`.
- Ids podem ter mais de 32 bits (no máximo 52): `bigint` no banco; o `number`
  do JS é seguro. Em chat privado, o id do chat é o id da pessoa
  ([Bot API dialog IDs](https://core.telegram.org/api/bots/ids)).
- `chat_id` só aceita `@username` de bot, supergrupo ou canal
  ([sendMessage](https://core.telegram.org/bots/api#sendmessage)). `@` de
  pessoa dá `chat not found` (código). Sem o id numérico não há envio.

Bloqueio e desbloqueio:

```json
{
  "update_id": 912345679,
  "my_chat_member": {
    "chat": { "id": 123456789, "type": "private", "first_name": "Ana" },
    "from": { "id": 123456789, "is_bot": false, "first_name": "Ana" },
    "date": 1760603600,
    "old_chat_member": { "status": "member", "user": { "id": 7000000001, "is_bot": true, "first_name": "Loja", "username": "loja_bot" } },
    "new_chat_member": { "status": "kicked", "user": { "id": 7000000001, "is_bot": true, "first_name": "Loja", "username": "loja_bot" }, "until_date": 0 }
  }
}
```

- Em chat privado, `my_chat_member` chega "only when the bot is blocked or
  unblocked by the user" ([Update](https://core.telegram.org/bots/api#update)).
  O primeiro /start não gera esse update; chega só a mensagem.
- Bloqueou: `old_chat_member.status` `"member"`, `new_chat_member.status`
  `"kicked"`. Desbloqueou: o contrário. `chat` e `from` são a pessoa,
  `new_chat_member.user` é o bot e `date` é a hora
  ([ChatMemberUpdated](https://core.telegram.org/bots/api#chatmemberupdated),
  [ChatMemberBanned](https://core.telegram.org/bots/api#chatmemberbanned)).
- O par `member`/`kicked` vem do código: no `updateBotStopped` o TDLib troca
  membro por banido
  ([DialogParticipantManager.cpp](https://github.com/tdlib/td/blob/a94b83d/td/telegram/DialogParticipantManager.cpp)),
  e a Bot API chama banido de `kicked`
  ([Client.cpp](https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8/telegram-bot-api/Client.cpp)).
  [verificar] com um bot de teste antes de ir para produção.

## Enviar: sendMessage

| Parâmetro | O que faz |
|---|---|
| `chat_id` | id numérico do chat (ou `@canal`) |
| `text` | 1 a 4.096 caracteres depois do parse das entidades |
| `parse_mode` | `HTML`, `MarkdownV2` ou `Markdown` (legado). Sem ele, o texto vai literal |
| `link_preview_options` | `is_disabled`, `url`, `prefer_small_media`, `prefer_large_media`, `show_above_text` |
| `reply_markup` | `{ "inline_keyboard": [[{ "text": "Ver oferta", "url": "https://…" }]] }` para botão com link; `callback_data` (1 a 64 bytes) para botão que avisa o bot |
| `disable_notification` | a mensagem chega sem som |
| `protect_content` | impede encaminhar e salvar |
| `allow_paid_broadcast` | passa de 30 msg/s pagando Stars (ver limites) |

Fontes: [sendMessage](https://core.telegram.org/bots/api#sendmessage),
[LinkPreviewOptions](https://core.telegram.org/bots/api#linkpreviewoptions),
[InlineKeyboardButton](https://core.telegram.org/bots/api#inlinekeyboardbutton).

- Resposta: a `Message` enviada. Guardar `result.message_id`, único dentro do
  chat.
- **Não há chave de idempotência.** Nenhum parâmetro identifica o envio do
  nosso lado, e a Bot API não tem método para ler o histórico do chat. Se a
  chamada cair depois de enviada, não dá para saber se a mensagem saiu.
- Formatação ([formatting options](https://core.telegram.org/bots/api#formatting-options)):
  em `HTML`, `<`, `>` e `&` fora de tag viram `&lt;`, `&gt;` e `&amp;`. Em
  `MarkdownV2`, pedem `\` antes: `_ * [ ] ( ) ~ > # + - = | { } . !` e o
  acento grave. Marcação errada dá `can't parse entities`.
- Botão de callback: o app mostra carregando até o bot chamar
  `answerCallbackQuery`
  ([CallbackQuery](https://core.telegram.org/bots/api#callbackquery)).
- Dá para chamar um método na própria resposta do webhook, mas sem saber se deu
  certo e sem receber o `message_id`
  ([doc](https://core.telegram.org/bots/api#making-requests-when-getting-updates)).
  A boas-vindas vai por `sendMessage` normal.

## Limites de envio

Do FAQ ([My bot is hitting limits](https://core.telegram.org/bots/faq#my-bot-is-hitting-limits-how-do-i-avoid-this)),
da seção [Paid Broadcasts](https://core.telegram.org/bots/api#paid-broadcasts)
e dos [termos do desenvolvedor, 6.2.5](https://telegram.org/tos/bot-developers#6-2-5-broadcasting-messages-with-stars):

| Escopo | Limite |
|---|---|
| Um chat | evitar mais de 1 msg/s; rajada curta passa, depois vem 429 |
| Um grupo | até 20 msg/min |
| Disparo, somando todos os chats do bot | cerca de 30 msg/s; acima disso, 429 |
| Com paid broadcast | até 1.000 msg/s |

- 429 vem com `"description": "Too Many Requests: retry after N"` (código) e
  `parameters.retry_after = N`, em segundos.
- Paid broadcast: liga no @BotFather e cada envio leva
  `allow_paid_broadcast: true`. Custa **0,1 Star por mensagem acima das 30/s**,
  cobrado só das que foram entregues, do saldo de Stars do bot.
- Requisito: o FAQ e os termos pedem **100.000 Stars de saldo e 100.000
  usuários ativos por mês**; a seção da API diz 10.000 Stars [verificar]. Bot
  de organização pequena não chega lá.
- O preço de compra de um Star não está nessas páginas. Os termos só dizem
  quanto um Star vale para o dono do bot: 0,013 USD em recompensa e 0,02 USD
  em anúncio (6.2.3 e 6.2.4) [verificar].
- Sem paid broadcast, o FAQ sugere espalhar disparo grande em 8 a 12 horas.
- O limite é por bot. Código: o servidor também devolve 429 (`retry_after` 60)
  quando o bot tem requisições ativas demais (acima de cerca de 1.000 ao mesmo
  tempo).

## Erros

| HTTP | `description` | Quando | Repetir? |
|---|---|---|---|
| 403 | `Forbidden: bot was blocked by the user` | a pessoa bloqueou o bot | não; tira do Telegram |
| 403 | `Forbidden: user is deactivated` | a conta foi apagada | não |
| 403 | `Forbidden: bot can't initiate conversation with a user` | a pessoa nunca deu /start nesse bot | não |
| 400 | `Bad Request: chat not found` | id que o bot não conhece: de outro bot, errado ou `@` de pessoa | não |
| 400 | `Bad Request: can't parse entities: …` | marcação errada com `parse_mode` (ex.: `Can't find end of the entity starting at byte offset 10`) | não; corrigir o texto |
| 400 | `Bad Request: message is too long` | mais de 4.096 caracteres | não; validar antes |
| 400 | `Bad Request: message text is empty` | texto vazio | não |
| 400 | `Bad Request: group chat was upgraded to a supergroup chat` | o grupo virou supergrupo | sim, com `migrate_to_chat_id` |
| 401 | `Unauthorized` | token inválido ou revogado | não; pausar o canal |
| 404 | `Not Found` | token mal formado (testado). Com token válido e método que não existe, o código devolve `Not Found: method not found` | não |
| 403 | `Forbidden: bot was kicked from the channel chat` · `Forbidden: bot is not a member of the channel chat` | canal sem o bot | não |
| 409 | `Conflict: terminated by other getUpdates request; make sure that only one bot instance is running` | dois `getUpdates` no mesmo bot | não se aplica a webhook |
| 409 | `Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first` | `getUpdates` com webhook ligado | idem |
| 429 | `Too Many Requests: retry after N` | flood | sim, depois de `retry_after` |
| 5xx | `Internal Server Error…` | servidor | sim, com backoff (pode duplicar) |

A doc da Bot API não lista as descrições. Os textos vêm do código
(`fail_query_with_error` e `check_chat_access` no
[Client.cpp](https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8/telegram-bot-api/Client.cpp),
o 401 de token mal formado no
[ClientManager.cpp](https://github.com/tdlib/telegram-bot-api/blob/e3e9dd8/telegram-bot-api/ClientManager.cpp),
`process_send_message_fail_error` no
[MessagesManager.cpp](https://github.com/tdlib/td/blob/a94b83d/td/telegram/MessagesManager.cpp)
do TDLib) e do teste com token inventado (401 e 404). A coluna "Repetir?" é
classificação nossa.

## Regras do Telegram

- **Bot só fala com quem falou primeiro**: confirmado na
  [introdução](https://core.telegram.org/bots#how-are-bots-different-from-users).
  Tentar dá `403 Forbidden: bot can't initiate conversation with a user`. Há
  outras portas documentadas, que o Kakou não usa: o login com Telegram com
  permissão `write` ([Log In With Telegram](https://core.telegram.org/widgets/login)),
  o `request_write_access` do [LoginUrl](https://core.telegram.org/bots/api#loginurl),
  as Mini Apps ([WriteAccessAllowed](https://core.telegram.org/bots/api#writeaccessallowed))
  e o pedido de entrada em grupo ou canal, que dá 5 minutos para o bot
  escrever ([ChatJoinRequest](https://core.telegram.org/bots/api#chatjoinrequest)).
- **Spam**: os [termos de uso](https://telegram.org/tos) proíbem "usar nosso
  serviço para enviar spam". Os
  [termos do desenvolvedor](https://telegram.org/tos/bot-developers) não têm
  data no documento (lidos em 16/10/2026):
  - 5.2(b): "Your TPA must not harass or spam users with unsolicited
    messages";
  - 5.2(f): o bot não pode contornar limites nem moderação, nem "operate by
    proxy (i.e., using Bot API credentials supplied by other users) in an
    attempt to circumvent bans or content moderation". O Kakou opera com o
    token que a organização cola. O que a cláusula proíbe é usar isso para
    fugir de banimento ou de limite, como dividir um disparo entre vários bots;
  - 6.2.5: as 30 msg/s grátis valem para "users who have granted permission
    to contact them", e o limite pago não pode ser usado para spam;
  - fim da 5.2: mudança relevante no que o bot faz precisa de aviso e de opção
    de sair.
- **Dados** (termos do desenvolvedor):
  - todo bot precisa de política de privacidade acessível. A própria é
    cadastrada no @BotFather; sem ela vale a
    [política padrão](https://telegram.org/privacy-tpa), e cabe ao dono do bot
    garantir que ela serve. Se não serve, a própria é obrigatória (4). A padrão
    promete não passar dados a terceiros sem autorização da pessoa (5.3 e 6.2
    da política);
  - apagar os dados da pessoa quando ela pedir (4.2a). Usar o que ela mandou
    só com consentimento "individual, explicit, active and revocable" (4.3);
  - dado de usuário cifrado em repouso, guardado longe da chave (4.4a);
  - o que alguém fizer com o token conta como feito pelo dono do bot (4.5);
  - o Telegram pode apagar chats e mensagens do bot a qualquer hora (6.3).
- **Descadastro em disparo**: não achei regra que obrigue comando ou botão de
  saída [verificar]. O que há é o FAQ do usuário (abaixo) e a opção de sair de
  mudanças relevantes (5.2).
- **Status alerts**: em bots populares (cerca de 300 requisições por minuto), o
  @BotFather avisa o dono quando o bot responde pouco às mensagens privadas
  ([features](https://core.telegram.org/bots/features#status-alerts)).

## Sair: como a pessoa para de receber

- O FAQ do Telegram, para o usuário: "If you don't want a bot to send you
  messages, feel free to block it – same as you would block a human user. Some
  Telegram clients have a 'Stop Bot' button right in the bot's profile. That
  said, most bot developers offer commands that silence the bot, check its
  /help for clues."
  ([FAQ](https://telegram.org/faq#q-a-bot-is-sending-me-messages-how-do-i-make-it-stop)).
- Para o bot, o que chega é o `my_chat_member` com `kicked`. O update do
  MTProto por trás é o `updateBotStopped`, com `stopped`: "Whether the bot was
  stopped or started"
  ([updateBotStopped](https://core.telegram.org/constructor/updateBotStopped)).
  Que o botão "Stop Bot" chega igual ao bloqueio: [verificar].
- `/stop` não é comando do Telegram. Os comandos globais que o Telegram pede
  são `/start`, `/help` e `/settings`
  ([global commands](https://core.telegram.org/bots/features#global-commands)).
  `/sair` e `/stop` são do Kakou.
- Comando tem de 1 a 32 caracteres, só minúsculas, dígitos e `_`
  ([BotCommand](https://core.telegram.org/bots/api#botcommand)).
  `setMyCommands` põe os comandos no menu do bot.
- Depois do bloqueio, todo envio dá `403 Forbidden: bot was blocked by the user`.
  A confirmação de saída só sai quando a pessoa sai por comando ou palavra.
- Boas práticas (nossas): dizer como sair já na boas-vindas; aceitar comando,
  palavra e, se quiser, um botão "Não quero mais receber" com `callback_data`;
  confirmar a saída; não voltar no desbloqueio, só com /start; guardar quando e
  como a pessoa saiu.

## Canal como alternativa

- O bot entra como admin do canal, com `can_post_messages`
  ([ChatMemberAdministrator](https://core.telegram.org/bots/api#chatmemberadministrator)).
  O link `t.me/<bot>?startchannel&admin=post_messages` abre a escolha do canal
  ([links](https://core.telegram.org/api/links#group-channel-bot-links)).
- `chat_id` é `@canal` (canal público) ou o id negativo `-100…`, que vale
  `-(1000000000000 + id do canal)`
  ([Bot API dialog IDs](https://core.telegram.org/api/bots/ids)).
- Um post é uma chamada só e chega a todos os inscritos. Mas a Bot API não
  lista os inscritos (só conta, com
  [getChatMemberCount](https://core.telegram.org/bots/api#getchatmembercount)),
  não diz quem recebeu, a resposta não chega ao bot por pessoa (comentários e
  mensagens diretas do canal são recursos à parte) e sair é sair do canal.
- Limite: o FAQ dá 20 msg/min para grupo. Para canal não achei número
  [verificar].
- Serve para novidade pública da organização. Não serve para o disparo do
  Kakou, que é por segmento, com registro por pessoa e com resposta.

## Unipile

A Unipile tem Telegram, mas como **conta de usuário**, não como bot:
`POST /api/v1/accounts` com `{ "provider": "TELEGRAM" }` devolve um QR code que
a pessoa lê no app do Telegram, e a conta passa a enviar e receber mensagens,
listar chats e mandar webhooks de mensagem e de status
([guia](https://developer.unipile.com/docs/telegram),
[recursos](https://developer.unipile.com/docs/list-provider-features)). Não
achei na documentação conexão por token de bot [verificar]. Para disparo, não
serve: seria uma pessoa mandando a mesma mensagem para uma lista. O próprio
Telegram diz que conta denunciada por spam fica limitada a falar com quem tem
o número dela salvo e a responder quem escreveu primeiro
([Spam FAQ](https://telegram.org/faq_spam)), e que toda conta que entra por
cliente não oficial fica "under observation", com banimento definitivo para
flood e spam
([obtaining_api_id](https://core.telegram.org/api/obtaining_api_id#using-the-api-id)).
A página de limites da Unipile não tem seção de Telegram
([limites](https://developer.unipile.com/docs/provider-limits-and-restrictions)).
Serve, no máximo, para conversa 1:1 de uma pessoa real, como o SDR faz no
LinkedIn. Confirma o descarte que já está na spec (16/10).

## [verificar] antes de ligar em produção

- Bloquear e desbloquear um bot de teste, inclusive pelo "Stop Bot", e conferir
  `kicked` e `member` no `my_chat_member`.
- Se o webhook funciona em `*.vercel.app` (certificado wildcard). No domínio de
  produção, conferir `getWebhookInfo.last_error_message` logo depois do
  `setWebhook`.
- Quanto tempo o Telegram espera a resposta do webhook.
- Se os 4.096 contam caracteres ou unidades UTF-16 (emoji pode contar 2).
- Limite de posts por minuto em canal.
- 10.000 ou 100.000 Stars para o paid broadcast (não muda nada para o Kakou
  hoje).
- Se a Unipile aceita token de bot.

## O que isso muda no Kakou

- **Guardar `chat.id` (`bigint`), nome, `username` e `language_code` de quem
  deu /start.** Sem o id não há envio: `@usuario` de pessoa não serve como
  destino.
- **Código do link de entrada opaco**, com até 64 caracteres em
  `A-Za-z0-9_-` (ex.: 8 a 12 aleatórios), apontando para o link com tag no
  banco. Nome de tag com acento ou espaço não cabe no link.
- **Conectar = `getMe`, `getWebhookInfo`, `setWebhook`.** Se o bot já tem
  webhook de outro sistema, avisar antes: ligar o Kakou desliga o outro.
  `secret_token` próprio do canal e `allowed_updates` sempre explícito
  (`message`, `my_chat_member` e, se houver botão de sair, `callback_query`).
  Lembrar o admin de cadastrar no @BotFather a política de privacidade do bot.
- **Webhook sem redirect e com resposta rápida:** rota fora do login do
  `proxy.ts`, segredo comparado em tempo constante, grava o update e responde
  200. Deduplicar por `(canal, update_id)` e ordenar por `date`.
- **Conferir o webhook todo dia com `getWebhookInfo`:** `url` diferente da
  nossa quer dizer que outro sistema pegou o bot; `last_error_message` quer
  dizer webhook com erro. Os dois viram aviso em português no painel.
- **Fila por bot com no máximo 25 msg/s** (folga sobre os ~30/s) e 1 msg/s por
  chat. Num tick de 1 minuto, até 1.500 envios por bot. O teto é de cada bot:
  as organizações não disputam o mesmo limite. 429 pausa a fila do bot inteiro
  por `retry_after` segundos.
- **Classificar a falha pela tabela de erros:** bloqueado vira falha
  definitiva e saída do Telegram; conta apagada, "nunca deu /start" e
  `chat not found` viram falha definitiva; 401 pausa o canal e pede token
  novo; 5xx e rede repetem com backoff.
- **`my_chat_member` com `kicked` é saída**, com motivo "bloqueou o bot" e a
  hora de `date`. `member` (desbloqueio) não volta sozinho, só com /start, como
  o épico já diz.
- **Sem idempotência:** status `enviando` antes da chamada e `message_id`
  depois. Queda no meio fica como incerta e não se repete sozinha. Texto sem
  `parse_mode`, e os 4.096 caracteres validados depois de trocar
  `{{first_name}}` e `{{company}}`.
- **Guardar tudo do nosso lado e tratar a lista como do bot.** A Bot API não lê
  histórico e o Telegram pode apagar chats de bot. Trocar o token do mesmo bot
  mantém a lista; trocar de bot zera, porque ninguém deu /start no novo.
