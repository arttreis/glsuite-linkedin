# WhatsApp em grupos e comunidades: o que a Unipile consegue

Pesquisa nas fontes primárias (developer.unipile.com, unipile.com, faq.whatsapp.com,
whatsapp.com e developers.facebook.com), 16/10/2026. Complementa
[unipile.md](unipile.md), que cobre a Unipile V1 no LinkedIn (base, autenticação,
webhook com `Unipile-Auth`, retentativa), e [whatsapp-cloud-api.md](whatsapp-cloud-api.md),
que cobre os disparos oficiais do SDR-72. Nada disso se repete aqui. Este documento
cobre o número de WhatsApp da **própria organização** ligado pela Unipile (como
aparelho vinculado, igual ao WhatsApp Web) para gerenciar grupos de lançamento.

A Unipile tem duas versões. O Kakou usa a **V1** (`src/server/unipile/cliente.ts`).
A V2 está em beta e tem uma documentação de WhatsApp mais completa: ela é citada
quando diz o que a V1 não diz, e as diferenças estão marcadas. As referências da V1
foram lidas pela versão markdown de cada página (acrescente `.md` à URL) e pelo
índice [llms.txt](https://developer.unipile.com/llms.txt). O da V2 fica em
[v2.0/llms.txt](https://developer.unipile.com/v2.0/llms.txt).

## Conectar o número

**Como conecta.** Por QR code ou por código de pareamento. O usuário usa o
"Link a Device" do WhatsApp, e a Unipile vira um aparelho vinculado. Se esse
aparelho for removido da lista, a conta cai para "Requires Authentication"
([V2, link WhatsApp](https://developer.unipile.com/v2.0/docs/link-whatsapp-accounts)).

| Caminho (V1) | Chamada | Observações |
|---|---|---|
| Hosted auth | `POST /hosted/accounts/link` com `providers: ["WHATSAPP"]` | O mesmo do LinkedIn. `disabled_options` aceita `qrcode_auth` e `pairing_code_auth` ("supported for WhatsApp only") para esconder um dos dois. Também aceita `sync_limit` ([referência](https://developer.unipile.com/reference/hostedcontroller_requestlink)). |
| Custom auth, QR | `POST /accounts` com `{ "provider": "WHATSAPP" }` | Devolve o QR em texto. O Kakou desenha a imagem ([guia](https://developer.unipile.com/docs/whatsapp)). |
| Custom auth, código | `POST /accounts` com `pairing_phone_number: "5511987654321"` | Só dígitos, com DDI. Volta um checkpoint com o código que a pessoa digita no celular. |
| Confirmação | `notify_url` (`CREATION_SUCCESS`) ou webhook `account_status` | A conta "can take few seconds" para aceitar chamadas. Esperar `OK`. `SYNC_SUCCESS` avisa o fim da sincronização ([ciclo de vida](https://developer.unipile.com/docs/account-lifecycle)). |
| Reconexão | mesmo `POST /hosted/accounts/link` com `type: "reconnect"` e `reconnect_account` | Disparar quando chegar `CREDENTIALS` ([hosted auth](https://developer.unipile.com/docs/hosted-auth)). |

**Quanto dura a sessão.** A Unipile não documenta validade fixa para o
WhatsApp. Para LinkedIn e Instagram ela fala em "session expiration after one
year"; para o WhatsApp, não ([ciclo de vida](https://developer.unipile.com/docs/account-lifecycle)).
Do lado do WhatsApp ([About linked devices](https://faq.whatsapp.com/378279804439436/?cms_platform=android)):

- até **4** aparelhos vinculados por conta;
- "Linked devices work without your phone online, but will log out if your phone
  is unused for over 14 days";
- "We'll also automatically disconnect linked devices after 30 days of inactivity".

**O que derruba** (status `CREDENTIALS`, que exige reconexão), segundo o
[ciclo de vida](https://developer.unipile.com/docs/account-lifecycle):

- a pessoa encerra a sessão pelas configurações do app (remove o aparelho);
- "Excessive requests to sensitive endpoints (such as fetching profiles or
  sending message without good answer rate or high report by user)", com
  restrição temporária ou definitiva;
- "Phone have no network for long period".

A V2 pede o celular principal **ligado e com internet**, senão faltam mensagens
nas consultas e nos eventos ([V2, link WhatsApp](https://developer.unipile.com/v2.0/docs/link-whatsapp-accounts)).
O changelog cita `reachoutTimeLock` no webhook de credenciais: informação do
bloqueio temporário de novas conversas imposto pelo WhatsApp
([changelog V1](https://developer.unipile.com/changelog/last-months-update-v1)). O formato: [verificar].

**Depois de conectar, esperar.** "We recommend waiting up to 24 hours after
connecting, reconnecting, or disconnecting/reconnecting a WhatsApp account before
creating new chats or starting outreach activity"
([limites](https://developer.unipile.com/docs/provider-limits-and-restrictions)).

### WhatsApp Business app

Conecta. A página de recursos não suportados da V2 diz que as funções de
negócio do app ("Products, Quick replies...") não são suportadas, "except
**Labels**" ([V2, não suportados](https://developer.unipile.com/v2.0/docs/unsupported-features)).
A V1 expõe as etiquetas como `setLabel` ([patch chat](https://developer.unipile.com/reference/chatscontroller_patchchat)).
O guia de WhatsApp da Unipile diz que ela "links the Business App account
directly, by QR code or pairing code"
([unipile.com](https://www.unipile.com/whatsapp-api-a-complete-guide-to-integration/)).

Limite que pesa: "You can't currently create a community on the WhatsApp Business
app" ([How to create a community](https://faq.whatsapp.com/438859978317289/?cms_platform=web)).

### Mesmo número da Cloud API?

Depende de como o número entrou na Cloud API.

| Situação do número | Dá para ligar na Unipile? | Fonte |
|---|---|---|
| Registrado direto na Cloud API (o caminho do SDR-72: app do próprio cliente) | **Não.** Número registrado "cannot be used with WhatsApp Messenger". Sem app no celular, não há aparelho principal para vincular. | [Phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers) |
| Coexistência (Business app + Cloud API no mesmo número) | **Em tese, sim.** A Meta aceita até 4 aparelhos vinculados, "All companion clients are supported, except for WhatsApp for Windows and WhatsApp for WearOS". Na entrada na Cloud API todos são desvinculados e podem ser vinculados de novo. A Meta não fala de cliente não oficial como a Unipile: [verificar]. | [Coexistência](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) |

O que a coexistência muda para grupos:

- os grupos continuam no app ("No change"), mas o lado da Cloud API não os vê:
  "Group chats will not be synchronized";
- a Groups API oficial não vale para número do Business app;
- o número fica em 20 msg/s fixos;
- para ligar a coexistência, a GuessLess precisa ser Tech Provider ou Solution
  Partner. Hoje não é: o SDR-72 conecta pelo app do cliente.

Fontes: [coexistência](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users),
[Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups).

## Operações de grupo

É a tabela que decide o lançamento. "Sim" quer dizer que existe endpoint
documentado. Fontes da V1: [patch chat](https://developer.unipile.com/reference/chatscontroller_patchchat),
[iniciar chat](https://developer.unipile.com/reference/chatscontroller_startnewchat),
[enviar no chat](https://developer.unipile.com/reference/chatscontroller_sendmessageinchat),
[guia de envio](https://developer.unipile.com/docs/send-messages). Fontes da V2:
[gerenciar grupos](https://developer.unipile.com/v2.0/docs/manage-groups),
[não suportados](https://developer.unipile.com/v2.0/docs/unsupported-features),
[envio](https://developer.unipile.com/v2.0/docs/send-messages).

| Operação | V1 (o Kakou) | V2 (beta) | Observações |
|---|---|---|---|
| Listar grupos | Sim: `GET /chats?account_type=WHATSAPP` | Sim: `GET /v2/{account}/chats?type=group` | A V1 não filtra grupo: separar por `type` do chat (0, 1 ou 2, sem descrição na doc) [verificar]. Comunidades, canais e listas de transmissão não aparecem. |
| Dados de um grupo | Sim: `GET /chats/{chat_id}` | Sim | A V2 traz `is_group`, `participants_count`, `participants`, `is_readonly` e `restrictions` (`send_message`). A V1 traz `name`, `type`, `read_only` (0/1/2, sem descrição) [verificar]. |
| Mandar texto | Sim: `POST /chats/{chat_id}/messages` | Sim | Formatação do WhatsApp suportada (V2). Resposta `MessageSent` com `message_id`. |
| Imagem e vídeo | Sim: `attachments` | Sim | Um anexo por mensagem: a V2 manda vários como mensagens separadas. Sempre como mídia com prévia; "como documento" não existe. |
| Documento (PDF) | Sim: `attachments` | Sim | Limite padrão de 15 MB no guia de envio; o changelog fala em upload de até 100 MB ([changelog](https://developer.unipile.com/changelog/last-months-update-3)) [verificar]. |
| Áudio (nota de voz) | Sim: `voice_message` (.mp3 ou .m4a) | Sim: `send_mode: "native"` | |
| Link com prévia | **Não documentado** | **Não documentado** | Não há parâmetro de prévia. Se o WhatsApp gera sozinho: [verificar]. |
| Mencionar | Sim: `mentions[]` com `profile_id` (`^\d+@(s.whatsapp.net\|lid)$`) e `{{0}}` no texto | Não está na referência | "WhatsApp groups only". |
| Responder citando | Sim: `quote_id` | Sim: `quote_id` | |
| Mostrar "digitando" | Sim: `typing_duration` (ms) | Sim: método próprio | |
| **Criar grupo** | Sim: `POST /chats` com vários `attendees_ids` e `subject` | Sim: `users_ids` em lista e `name`; `text: ""` cria sem mensagem | Exige ao menos um membro além do dono. A V1 manda uma primeira mensagem; criar sem ela: [verificar]. Sem nome, o nome sai dos membros. |
| Adicionar participante | Sim: `PATCH /chats/{id}` `{ action: "addParticipant", value: "5511…@s.whatsapp.net" }` | Sim: `POST …/participants` | Exige a permissão "Add other members". A V2 avisa: pode responder sucesso **sem adicionar**. |
| Remover participante | Sim: `removeParticipant` | Sim: `DELETE …/participants/{user_id}` | Exige ser admin. Mesmo aviso de sucesso falso. |
| Promover ou rebaixar admin | **Não** | **Não** | "Making members group admin or dismissing as admin is not supported". |
| Mudar nome | **Não** (não há ação) | Sim: `PATCH` com `name` | |
| Mudar descrição | **Não** | **Não** | "Updating the picture, description, or permissions of a group chat is not supported". |
| Mudar foto | **Não** (só baixar: `GET /chat_attendees/{chat_id}/picture`) | **Não** | Mesma frase. |
| "Só admins enviam" e outras permissões | **Não** | **Não** | Mesma frase. A V2 só **lê** o estado (`restrictions`, `is_readonly`). |
| Aprovar pedidos de entrada | **Não** | **Não** | "As admin, approving new members is not supported". |
| **Gerar link de convite** | Sim: `PATCH` `{ action: "getInviteLink" }` → `invite_link` | **Não** | "Generate or retrieve the full group invite link". A página de não suportados da V2 (09/04/2026) diz que não há convite por link; a ação entrou depois na V1 ([changelog](https://developer.unipile.com/changelog/last-months-update-v1)). |
| Revogar ou trocar o link | **Não** | **Não** | Nenhuma ação de reset. |
| Listar participantes | Sim: `GET /chats/{chat_id}/attendees` | Sim: `GET …/participants` | V1: `provider_id`, `name`, `is_self`, `picture_url`; **sem admin**. V2: `is_admin`, `is_self`, `user.id`, `public_identifier` (telefone, "when the phone number is available"), `display_name`, `specifics.contact_name`. |
| Ex-participantes | **Não** | **Não** | "Unipile does not provide a way to list Past members". |
| Sair do grupo | [verificar]: `removeParticipant` com o próprio id | Sim: remover o próprio `user_id` | Depois de sair, o chat fica `read_only` e continua na lista. |
| Apagar o grupo | **Não** | **Não** | "You can exit a chat but not delete it" (a V2 tem apagar conversa, que não é apagar o grupo). |
| Fixar mensagem | Não documentado | Sim (`Pin a Message`) | |
| Enquete, evento, localização, contato | **Não** envia | **Não** envia | Chegam como mensagem vazia. |
| Apagar mensagem de outro, como admin | **Não** | **Não** | |

Dois detalhes do WhatsApp que pesam nessa tabela
([admin settings](https://faq.whatsapp.com/526742385997912/?cms_platform=android),
[create group](https://faq.whatsapp.com/3242937609289432/?cms_platform=android)):

- "If a group was started with fewer than 33 members, all group members can: Add
  others to the group; Send invite links." Grupo criado pela API nasce aberto, e
  a Unipile não fecha. Fechar é no app.
- "Once an invite link has been reset, the previous link can't be restored." O
  reset só existe no app.

**Ids.** O id do usuário é `5511987654321@s.whatsapp.net` ou um LID
(`0000000000@lid`), que não traz o telefone. "Use the `id` values returned by
Unipile unchanged" ([V2](https://developer.unipile.com/v2.0/docs/retrieve-chats-messages),
[V1 users](https://developer.unipile.com/docs/users-overview)). O id de grupo no
formato `…@g.us` não aparece na doc [verificar].

## Comunidades

**A Unipile não enxerga.** "Channels, Communities & Broadcasts: These chat types
are not listed by Unipile. Managing them is not supported"
([V2, não suportados](https://developer.unipile.com/v2.0/docs/unsupported-features);
a [tabela de disponibilidade](https://developer.unipile.com/v2.0/docs/list-provider-features)
repete). Logo:

- criar comunidade e anexar grupo: não;
- postar no grupo de avisos: não documentado. Se o grupo de avisos aparece na V1
  como um grupo comum e aceita envio: [verificar com uma conta real].

Limites do WhatsApp:

| Item | Valor | Fonte |
|---|---|---|
| Grupos por comunidade | até 100 | [How to create a community](https://faq.whatsapp.com/438859978317289/?cms_platform=web) |
| Membros da comunidade | até 2.000, somando subgrupos e o grupo de avisos | mesma página |
| Grupo de avisos | todo membro entra; "Only admins can send announcements and start polls" | [Community announcements](https://faq.whatsapp.com/742237357891080) |
| Business app | não cria comunidade | [How to create a community](https://faq.whatsapp.com/438859978317289/?cms_platform=web) |

Uma frase do WhatsApp que vale para o lançamento: "Using community announcements
instead of sending repeated messages to groups or members may help reduce the risk
of being flagged as spam" ([Community announcements](https://faq.whatsapp.com/742237357891080)).
Mas o teto de 2.000 pessoas não comporta um lançamento de dezenas de grupos.

## Webhooks e eventos

Mesmo webhook `messaging` que o Kakou já usa no LinkedIn, com a mesma
autenticação por header e a mesma retentativa ([webhooks](https://developer.unipile.com/docs/webhooks-2)).

**Eventos da V1** ([criar webhook](https://developer.unipile.com/reference/webhookscontroller_createwebhook)):
`message_received`, `message_read`, `message_reaction`, `message_edited`,
`message_deleted`, `message_delivered`. Os de leitura, entrega, edição e exclusão
entraram para o WhatsApp ([changelog](https://developer.unipile.com/changelog/last-months-update-2)).

**Campos do payload.** O exemplo da doc é de LinkedIn
([new messages](https://developer.unipile.com/docs/new-messages-webhook)). As
chaves que existem estão no enum `data[].key` da referência:

| Campo | Para que serve |
|---|---|
| `account_id`, `account_type` (`WHATSAPP`), `account_info.user_id` | De qual número veio |
| `event`, `chat_id`, `provider_chat_id`, `message_id`, `provider_message_id`, `timestamp` | Identificar e deduplicar (por `message_id`) |
| `is_group`, `subject` | **Grupo ou 1:1**, e o nome do grupo |
| `sender.{attendee_id, attendee_name, attendee_provider_id}` | Quem mandou (telefone `@s.whatsapp.net` ou LID) |
| `is_sender` | Mensagem do próprio número. Também chega a que o Kakou mandou pela API. |
| `message`, `attachments[]` (`type`, `mimetype`, `url: "att://…"`), `mentions`, `quoted`, `reply_to`, `is_forwarded`, `is_view_once` | Conteúdo. Mídia: `GET /messages/{message_id}/attachments/{attachment_id}` ([referência](https://developer.unipile.com/reference/messagescontroller_getattachment)). |
| `is_event`, `event_type` | Eventos do grupo (abaixo) |
| `read_by`, `reaction`, `reaction_sender` | Leitura e reação |
| `chat_content_type`, `message_type`, `folder`, `chat_pinned`, `deleted_for` | Extras |

**Entrou, saiu, virou admin.** Não há evento de grupo separado na V1. Chegam como
mensagem de sistema, com `is_event: 1` e `event_type`
([message object](https://developer.unipile.com/docs/message-payload)):

| `event_type` | Significado |
|---|---|
| `3` | Grupo criado |
| `4` | Nome do grupo mudou |
| `5` | Participante adicionado |
| `6` | Participante removido |
| `7` | Participante saiu |
| `0` | Outro evento do provedor, sem mapeamento |

- Entrada **pelo link** de convite: se vem como `5` ou como `0`: [verificar].
- Mudança de admin: não tem código. Não há como saber pela Unipile.
- O changelog cita "Group participant updates support" e "Messaging payloads
  expose `event_type`" ([changelog V1](https://developer.unipile.com/changelog/last-months-update-v1),
  [V1 recente](https://developer.unipile.com/changelog/last-months-update-v1-1)).
- Na V2, a mudança de participantes ou de nome chega como `chat.update`, com o
  chat inteiro. A V2 tem `message.receipt.read` no WhatsApp, mas não
  `message.receipt.delivery` ([eventos](https://developer.unipile.com/v2.0/reference/event-types-1),
  [disponibilidade](https://developer.unipile.com/v2.0/docs/list-provider-features)).

**Regras que já valem no LinkedIn e valem aqui** ([new messages](https://developer.unipile.com/docs/new-messages-webhook),
[ciclo de vida](https://developer.unipile.com/docs/account-lifecycle)):

- não chega webhook do histórico na conexão; na reconexão, chegam as mensagens do
  período em que caiu;
- com a conta fora de `OK`, os webhooks de mensagem param.

## Limites do WhatsApp

| Item | Valor | Fonte |
|---|---|---|
| Membros por grupo | até 1.024 | [How to add and remove group members](https://faq.whatsapp.com/841426356990637/?cms_platform=web) |
| Nome do grupo | até 100 caracteres | [How to create a group](https://faq.whatsapp.com/3242937609289432/?cms_platform=android) |
| Grupo com mais de 256 membros | "Edit group settings will default to Only admins" | [Admin settings](https://faq.whatsapp.com/526742385997912/?cms_platform=android) |
| Adicionar membros e criar grupos | Sem número publicado: "If you've added too many members to groups, you might see an error message. You might need to wait 24 hours to add more members to groups and create additional groups." | [How to add and remove group members](https://faq.whatsapp.com/841426356990637/?cms_platform=web) |
| Encaminhar | até 5 conversas por vez; mensagem já encaminhada vai para 1 grupo só | [Forwarding limits](https://faq.whatsapp.com/1053543185312573/?cms_platform=android) |
| Mensagens por dia (conta comum ou Business app) | O WhatsApp não publica número [verificar] | |

**O que a Unipile recomenda** ([limites V1](https://developer.unipile.com/docs/provider-limits-and-restrictions),
[limites V2](https://developer.unipile.com/v2.0/docs/provider-limits-and-restrictions)):

- conta com histórico real, nada de número novo só para o software: "Fresh accounts
  can be blocked after only 2–3 new chats". Aquecer "over several days with a few
  active, real conversations";
- esperar até 24 h depois de conectar ou reconectar antes de abrir conversas;
- intervalo mínimo de 10 a 20 s entre mensagens;
- poucas conversas novas sem resposta: "it may temporarily restrict your account";
- com isso, "potentially send several hundred messages per day per WhatsApp account".

A Unipile não publica teto de WhatsApp. Na página de grupos, ela diz que
frequência e número de grupos são "a customer-side decision, made within WhatsApp's
own limits for that account" ([unipile.com](https://www.unipile.com/whatsapp-group-api/)).

**Política (o risco em uma linha).** Os [Termos do WhatsApp](https://www.whatsapp.com/legal/terms-of-service)
proíbem "bulk messaging, auto-messaging, auto-dialing" e "any non-personal use of
our Services unless otherwise authorized by us", e a Central de Ajuda diz que
"linking your WhatsApp account to unofficial versions of WhatsApp violates our
Terms of Service", com risco de banimento temporário ou definitivo e de perder "the
ability to link devices" ([About unofficial apps](https://faq.whatsapp.com/1217634902127718),
[About linked devices](https://faq.whatsapp.com/378279804439436/?cms_platform=android)).
Se os Termos do Business app dizem o mesmo: a página não carregou [verificar].

## Groups API oficial (Cloud API), só para comparação

Fontes: [Groups API](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups),
[referência](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/reference),
[preço](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups/pricing),
[OBA](https://developers.facebook.com/documentation/business-messaging/whatsapp/official-business-accounts).

- **Quem usa:** "open to all businesses with an Official Business Account (OBA)",
  o número com selo (a Meta hoje diz "blue checkmark"). Pedir OBA exige 30 dias na
  plataforma, negócio verificado, verificação em duas etapas e nome de exibição
  aprovado. "We do not grant OBA status to [...] WhatsApp Business app phone numbers."
- **Não vale** para número do Business app (coexistência) nem para Multi-solution
  Conversations.
- **Tamanho:** **8 participantes** por grupo. Até 10.000 grupos por número. Uma
  empresa da Cloud API por grupo.
- **O que faz:** cria e apaga grupo (assunto até 128 caracteres, descrição até
  2.048); entrada só por link ("you cannot manually add participants"); pega e
  reseta o link; aprova ou recusa pedidos; remove participante; muda assunto,
  descrição e foto; manda texto, mídia e template; fixa mensagem. Webhooks
  `group_lifecycle_update`, `group_participants_update`, `group_settings_update` e
  `group_status_update`.
- **Não faz:** ligação, mensagem temporária, visualização única, mensagens
  interativas e de comércio, editar e apagar mensagem.
- **Preço:** por mensagem **entregue a cada membro**. Mensagem de qualquer membro
  abre a janela de 24 h para o grupo inteiro.

Com 8 pessoas por grupo, não serve para lançamento.

## Preço da Unipile

- Por conta conectada, qualquer canal: "You are billed per connected account,
  whatever the channel" e "The same tiers apply to every channel"
  ([preços](https://www.unipile.com/pricing-api/)). Um número de WhatsApp conta
  como uma conta, igual a um perfil do LinkedIn.
- €49/mês até 10 contas. Da 11ª à 50ª, €5 por conta.
- Sem cobrança por mensagem ou por chamada. A conta é pelo pico de contas no
  período ([billing V2](https://developer.unipile.com/v2.0/docs/billing)).
- A Meta não cobra nada pelas mensagens que saem pela Unipile (não há WABA nem
  template), como já está em [whatsapp-cloud-api.md](whatsapp-cloud-api.md#unipile-e-whatsapp).

## O que isso decide para o Kakou

- **Dá para automatizar na V1:** listar os grupos do número; disparar texto,
  imagem, vídeo, áudio e PDF agendados para todos os grupos (o agendamento e a fila
  são do Kakou, a Unipile não agenda); mencionar; criar grupo; gerar o link de
  convite; adicionar e remover gente; ler tudo o que se fala; e o SDR responder no
  grupo com `quote_id` e `mentions`, ignorando `is_sender` para não responder a si
  mesmo.
- **Fica manual, no app:** "só admins enviam" (o grupo fechado), descrição, foto,
  promover admins, trocar o link, aprovar pedidos, e renomear enquanto o Kakou
  estiver na V1. Como o grupo nasce aberto ("fewer than 33 members"), cada grupo
  criado pela API precisa de uma passada no celular antes de o link ir para o ar.
  Bom fluxo: a equipe cria e configura os grupos no app (com o número da
  organização como admin) e o Kakou os gerencia daí em diante.
- **"Enche por link" é trabalho do Kakou.** Não há evento de "grupo cheio". O Kakou
  conta participantes (lista de attendees e eventos `5`, `6` e `7`) e faz o
  redirecionador apontar para o próximo grupo com vaga antes dos 1.024. Os links
  já precisam estar gerados, porque criar grupos e adicionar gente em massa esbarra
  no "wait 24 hours" do WhatsApp, sem número publicado.
- **Membro vira contato, mas nem sempre com telefone.** O id pode ser LID, sem
  número. O contato nasce com o id do WhatsApp e a tag do grupo; o telefone, quando
  houver. O mesmo problema que o BSUID criou no SDR-72.
- **Disparo em dezenas de grupos é o padrão de spam.** Ritmo da Unipile como piso
  (10 a 20 s entre mensagens, aleatório), número aquecido e 24 h de espera depois de
  conectar. O WhatsApp sugere avisos de comunidade no lugar de mensagem repetida,
  mas a Unipile não enxerga comunidade e o teto é de 2.000 pessoas.
- **Número separado do da Cloud API.** O número do SDR-72 está registrado direto na
  Cloud API e não roda o app, então não dá para vincular. A coexistência exigiria
  a GuessLess como Tech Provider e poria o número oficial (WABA, templates,
  qualidade) no mesmo risco de banimento. Usar um número só para grupos, com o
  Business app num celular que fica ligado e com internet.
- **Risco aceito, mas contido.** Banimento derruba o número e o Kakou perde a
  administração de todos os grupos. Ter pelo menos um admin humano em cada grupo
  (promovido à mão, porque a API não promove) mantém os grupos de pé.
- **Infra de webhook já existe.** Mesmo webhook `messaging` da Unipile, separando
  por `account_type: "WHATSAPP"` e `is_group`, deduplicando por `message_id`.
  Webhook de `account_status` assinado para todos os status, porque fora de `OK`
  nada chega.
- **Custo:** mais uma conta na Unipile, dentro dos 10 do plano de €49. Sem custo
  por mensagem.
- **V2 vale um olho.** Ela traz `is_admin`, filtro `type=group` e renomear, mas
  perde `mentions` e `getInviteLink`. Por ora, ficar na V1 atrás da interface
  `ClienteUnipile`.

## Pontos abertos

- [verificar] Valores de `type` (0, 1, 2) e de `read_only` (0, 1, 2) do chat na V1.
  Provável 1:1, grupo e canal, mas a doc não diz.
- [verificar] Formato do id de grupo (`…@g.us`?) no `provider_id` do chat.
- [verificar] Entrada pelo link de convite: chega como `event_type` `5` ou `0`?
- [verificar] Na V1, os participantes de grupo vêm como `@s.whatsapp.net` (com
  telefone) ou como LID? Há como chegar ao telefone de um LID?
- [verificar] Sair do grupo na V1 com `removeParticipant` passando o próprio id.
- [verificar] Criar grupo na V1 sem mandar a primeira mensagem (`text` vazio).
- [verificar] Se o WhatsApp gera a prévia de link nas mensagens enviadas pela
  Unipile.
- [verificar] Se o grupo de avisos de uma comunidade aparece na lista de chats da
  V1 e aceita envio.
- [verificar] `getInviteLink` com o número como admin num grupo com "só admins
  convidam": funciona? E sem ser admin?
- [verificar] Formato do `reachoutTimeLock` no webhook de credenciais.
- [verificar] Limite real de upload de anexo (15 MB no guia, 100 MB no changelog).
- [verificar] Quantos grupos um número cria e quantas pessoas adiciona por dia
  antes do "wait 24 hours". O WhatsApp não publica.
- [verificar] Mensagens por dia sem restrição numa conta comum ou do Business app.
  O WhatsApp não publica; a Unipile fala em "several hundred".
- [verificar] Unipile como aparelho vinculado de um número em coexistência.
  A Meta aceita companions, mas não fala de cliente não oficial.
- [verificar] Termos do WhatsApp Business app sobre automação (a página não
  carregou).
