# Unipile (API V1): o que o SDR usa

Pesquisa na documentação oficial (developer.unipile.com), 29/09/2026. Resolve
os [verificar] do épico sobre a Unipile. O cliente está em
`src/server/unipile/cliente.ts`.

## Base e autenticação

- `https://{DSN}/api/v1`, com DSN no formato `apiX.unipile.com:PORTA` (vem do
  dashboard). Header `X-API-KEY: {token}`.
- Erro padrão: `{ "status": 422, "type": "errors/cannot_resend_yet", "title", "detail" }`.
- **Não há chave de idempotência.** A proteção contra envio duplicado é nossa:
  status `enviando` na ação e deduplicação por `message_id`.

## Endpoints usados

| Uso | Método e caminho | Observações |
|---|---|---|
| Link de conexão (hosted auth) | `POST /hosted/accounts/link` | JSON: `type` (`create`/`reconnect`), `providers: ["LINKEDIN"]`, `api_url`, `expiresOn` (ISO com ms), `name`, `notify_url`, `success_redirect_url`, `failure_redirect_url`, `reconnect_account`. Resposta `{ object: "HostedAuthUrl", url }`. O link expira no restart diário: gerar um novo a cada clique. Não abrir em iframe (quebra o captcha). |
| Callback do hosted auth | `notify_url` recebe `{ status: "CREATION_SUCCESS" \| "RECONNECTED", account_id, name }` | Sem assinatura: o SDR põe um segredo na URL e confirma a conta com `GET /accounts/{id}`. |
| Conta | `GET /accounts/{id}` | Status em `sources[].status`: `OK`, `STOPPED`, `ERROR`, `CREDENTIALS`, `PERMISSIONS`, `CONNECTING`. |
| Dono da conta | `GET /users/me?account_id=` | `provider_id`, `premium`, `sales_navigator` (objeto, `{error}` ou null). |
| Convite | `POST /users/invite` | JSON `{ provider_id, account_id, message }`; `message` com no máximo 300 caracteres. Resposta `{ object: "UserInvitationSent", invitation_id, usage? }`. |
| Convites pendentes | `GET /users/invite/sent?account_id=` | `items[].id` é o id do convite. |
| Retirar convite | `DELETE /users/invite/sent/{invitation_id}?account_id=` | Resposta `{ object: "InvitationCanceled" }`. Resolve o [verificar] da §4.3. |
| Perfil | `GET /users/{provider_id \| public_identifier}?account_id=&linkedin_sections=*` | `network_distance`: `FIRST_DEGREE`, `SECOND_DEGREE`, `THIRD_DEGREE`, `OUT_OF_NETWORK`. `work_experience[]` só vem com `linkedin_sections`. |
| Posts | `GET /users/{provider_id}/posts?account_id=&limit=` | `items[].text`, `date`. |
| Iniciar conversa | `POST /chats` (multipart) | `account_id`, `attendees_ids` (repetido), `text`. Resposta 201 `{ object: "ChatStarted", chat_id, message_id }`. Só funciona com conexão de 1º grau. |
| Mensagem em conversa | `POST /chats/{chat_id}/messages` (multipart) | `text`, `account_id`. Resposta 201 `{ object: "MessageSent", message_id }`. |
| Mensagens da conversa | `GET /chats/{chat_id}/messages?limit=` | Mais recentes primeiro; `is_sender` é 0/1. |
| Conversas com a pessoa | `GET /chat_attendees/{provider_id}/chats?account_id=` | Para achar o chat 1:1 existente. |
| Conversas da conta | `GET /chats?account_id=&account_type=LINKEDIN&limit=&cursor=` | `limit` 1–250. Itens: `id`, `attendee_provider_id`, `name`, `timestamp`, `type`, `unread_count`; `cursor` para a próxima página. Fonte: [referência](https://developer.unipile.com/reference/chatscontroller_listallchats). |
| Participantes da conversa | `GET /chats/{chat_id}/attendees` | Itens: `provider_id`, `name`, `profile_url`, `picture_url`, `is_self` (0/1). [verificar] formato tirado de espelho da documentação. |
| Busca | `POST /linkedin/search?account_id=&cursor=` | Busca clássica: JSON `{ api: "classic", category: "people", keywords, advanced_keywords: { title, company }, location: [ids], industry: [ids], network_distance: [1,2,3], profile_language: ["pt"] }`, ou `{ url }` (substitui o corpo inteiro). O `cursor` da resposta vai na **query** da próxima página, com o mesmo corpo. Página padrão de 10. Item: `id` (provider_id), `name`, `headline`, `location`, `public_identifier`, `public_profile_url`, `network_distance` (`DISTANCE_1`, `DISTANCE_2`, `DISTANCE_3`, `OUT_OF_NETWORK`), `pending_invitation`, `current_positions[]` (`company`, `role`). Teto recomendado: 1.000 perfis por dia por conta e 1.000 por busca (2.500 no Sales Navigator). Fontes: [referência](https://developer.unipile.com/reference/linkedincontroller_search), [limites](https://developer.unipile.com/docs/provider-limits-and-restrictions). |
| Ids para a busca | `GET /linkedin/search/parameters?account_id=&type=&keywords=&limit=` | `type` `LOCATION`, `INDUSTRY`, `COMPANY`, `SCHOOL` etc.; `limit` 1–100. Itens: `id`, `title`. [referência](https://developer.unipile.com/reference/linkedincontroller_getsearchparameterslist) |
| Webhooks | `POST /webhooks` | JSON `{ request_url, source, name, headers: [{key, value}], events, format: "json" }`. |
| País do proxy | `PATCH /accounts/{id}` | `{ country: "CA" }`. Alternativa para a T-1 se o IP não sair do país certo. |

## Webhooks

- **Verificação de origem (V1):** não há assinatura. A Unipile manda os headers
  que a gente cadastrou na criação do webhook. O SDR cadastra
  `Unipile-Auth: <UNIPILE_WEBHOOK_SECRET>` e compara em tempo constante.
  Webhook criado por API não manda `Content-Type`: também é cadastrado.
- Retentativa: responder 200 em até 30 s. Se não, são 5 novas tentativas.
- `message_received` (source `messaging`) chega também para mensagens
  **enviadas** pela conta, inclusive pela API. Quem enviou: compare
  `sender.attendee_provider_id` com `account_info.user_id`.
- Quando um convite **com nota** é aceito, o LinkedIn cria a conversa com a nota e
  dispara `message_received` com a nota como mensagem enviada. É um sinal de
  aceite em tempo real, não uma mensagem nova do operador.
- `new_relation` (source `users`, convite aceito) **não é em tempo real**. A
  Unipile consulta as conexões em intervalos aleatórios, com até 8 h de atraso.
- `account_status`: `{ "AccountStatus": { account_id, account_type, message } }`.
  - `CREDENTIALS`: desconectada, exige reconexão.
  - `ERROR` ou `STOPPED`: a sincronização parou.
  - `CONNECTING`: problema temporário.
  - `OK`, `RECONNECTED`, `SYNC_SUCCESS` e `CREATION_SUCCESS`: situação normal.
  - **Com qualquer status diferente de OK, os webhooks de mensagem param**; ao
    reconectar, chegam as mensagens do período.
  - O padrão não envia `OK`, `CONNECTING` e `STOPPED`: o SDR assina todos.
- Checkpoint e captcha não têm status próprio. Aparecem como erro nas chamadas:
  - `401`: `errors/checkpoint_error`, `errors/disconnected_account`;
  - `403`: `errors/account_restricted`, `errors/action_required`.

## Erros que importam para o despachante

| Classe | Tipos |
|---|---|
| Limite do LinkedIn (conta para a parada, §4.4) | `422 errors/cannot_resend_yet`, `cannot_resend_within_24hrs`, `limit_exceeded`, `connection_limit_reached`; `429 errors/too_many_requests` |
| Conta (pausa na hora) | `401 errors/disconnected_account`, `checkpoint_error`, `multiple_sessions`; `403 errors/account_restricted`, `action_required`, `unknown_authentication_context`, `subscription_required`, `feature_not_subscribed` |
| Transitório (backoff) | falha de rede, `5xx` (inclui `500 errors/provider_error`), `408` |
| Permanente (ação falha, lead para revisão) | os demais `4xx`: `already_connected`, `already_invited_recently`, `invalid_recipient`, `user_unreachable`, `cannot_invite_attendee`, `blocked_recipient`, `no_connection_with_recipient`, `too_many_characters`… |

Só `cannot_resend_yet` tem significado documentado; os outros tipos existem no
enum da API, e a classificação acima é nossa.

## Limites e volumes

- Nota do convite: 300 caracteres em conta paga, 200 na gratuita. A conta
  gratuita também tem poucos convites com nota por mês: 3 a 5, conforme a fonte.
- Recomendações da Unipile, bem acima dos tetos do épico: 30–50 convites por dia
  útil em sequência; ≤ 100 mensagens por dia.
- Preço: €49/mês até 10 contas (confirmado).

## V2 (beta)

A V2 muda a base para `https://api.unipile.com/v2/{account_id}/…`, assina os
webhooks com HMAC (`unipile-signature`) e renomeia eventos (`message.new`,
`relation.new`). Quando sair do beta, contas novas nascem na V2. O cliente fica
atrás da interface `ClienteUnipile` para a troca ser só de adaptador.
