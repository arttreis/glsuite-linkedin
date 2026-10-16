# WhatsApp Cloud API (Meta): o que o disparador usa

Pesquisa nas fontes primárias da Meta (developers.facebook.com, business.whatsapp.com), 16/10/2026. Objetivo: base do disparador de templates do Kakou (conectar o WhatsApp Business do cliente, listar templates aprovados, disparar para um segmento com opt-in, registrar status e respostas).

A documentação mudou para `developers.facebook.com/documentation/business-messaging/whatsapp/...`.
As páginas antigas em `/docs/whatsapp/...` mostram "This page has moved". Toda página nova tem
versão em markdown (acrescente `.md` à URL). O índice fica em
[llms.txt](https://developers.facebook.com/documentation/business-messaging/whatsapp/llms.txt).

## Versão da Graph API

A Cloud API roda na Graph API. A versão vai no caminho: `https://graph.facebook.com/v26.0/...`.

| Versão | Lançada | Disponível até |
|---|---|---|
| v26.0 | 29/07/2026 | a definir |
| v25.0 | 18/02/2026 | 29/07/2028 |
| v24.0 | 08/10/2025 | 18/02/2028 |
| v23.0 | 29/05/2025 | 08/10/2027 |

Fonte: [Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/versions).

- Política: "Cada versão tem garantia de operação de pelo menos dois anos". Ela deixa de
  funcionar "dois anos após a data de lançamento da próxima". Chamada a versão expirada é
  encaminhada para a versão mais antiga ainda disponível. A Meta recomenda sempre informar a
  versão. Fonte: [Controle de versão](https://developers.facebook.com/docs/graph-api/guides/versioning).
- A Meta não indica uma versão "recomendada" para a Cloud API. A maioria dos exemplos da doc usa v25.0. O
  [changelog da v26.0](https://developers.facebook.com/docs/graph-api/changelog/version26.0) não
  traz mudança da Cloud API (só anúncios no Status).
- A v24.0 mudou o que importa aqui ([changelog, 08/10/2025](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)):
  - o webhook de status deixou de trazer `conversation` (exceto em janela de free entry point);
  - entrou o campo `whatsapp_business_manager_messaging_limit`;
  - cursor inválido na lista de templates devolve `131059` (refazer sem cursor).
- Como se escolhe a versão do payload do webhook (versão do app ou da chamada): [verificar].

## Envio de template

`POST https://graph.facebook.com/v25.0/{phone-number-id}/messages`, com
`Authorization: Bearer {token}` e `Content-Type: application/json`.

Exemplo montado com as peças da doc (cabeçalho com imagem, corpo posicional, quick reply e URL
dinâmica):

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+5511987654321",
  "type": "template",
  "template": {
    "name": "oferta_outubro",
    "language": { "code": "pt_BR" },
    "components": [
      { "type": "header",
        "parameters": [{ "type": "image", "image": { "link": "https://exemplo.com.br/oferta.jpg" } }] },
      { "type": "body",
        "parameters": [{ "type": "text", "text": "Ana" }, { "type": "text", "text": "20%" }] },
      { "type": "button", "sub_type": "quick_reply", "index": 0,
        "parameters": [{ "type": "payload", "payload": "sair" }] },
      { "type": "button", "sub_type": "url", "index": 1,
        "parameters": [{ "type": "text", "text": "abc123" }] }
    ]
  }
}
```

- **Parâmetro nomeado:** cada item leva `parameter_name`, por exemplo
  `{ "type": "text", "parameter_name": "primeiro_nome", "text": "Ana" }`. Posicional vai só pela
  ordem. O formato é do template (`parameter_format`: `named` ou `positional`, padrão
  posicional) e é definido na criação. Nomes: minúsculas e `_`, únicos. Posicionais: `{{1}}`,
  `{{2}}`… a partir de 1. Fonte: [Template fundamentals](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview).
- **Cabeçalho de mídia:** `image.id` (upload prévio) ou `image.link` (URL pública). A Meta
  recomenda `id`. Fonte: [Template media](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-media).
- **Botões:** `index` é a posição do botão, base 0 (a doc usa número e string). O `payload` do
  quick reply é opcional: "Value to be included in messages webhooks (`messages.button.payload`)
  when the button is tapped". Na URL dinâmica, `text` é o sufixo (1 variável, no fim da URL),
  com percent-encoding em caractere especial. Copy code: `{ "type": "coupon_code", "coupon_code": "..." }`.
  Fontes: [carrossel](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/media-card-carousel-templates),
  [cupom](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/coupon-templates),
  [componentes](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components).
- Outros tipos no corpo: `currency` (`fallback_value`, `code`, `amount_1000`) e `date_time`
  (`fallback_value`).
- `biz_opaque_callback_data`: texto nosso, até 512 caracteres, que volta nos webhooks de status
  ([changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/changelog)).
  Posição no corpo (raiz do objeto): [verificar].

Resposta ([exemplo da doc](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/custom-marketing-templates)):

```json
{
  "messaging_product": "whatsapp",
  "contacts": [{ "input": "16505551234", "wa_id": "16505551234" }],
  "messages": [{ "id": "<WHATSAPP_MESSAGE_ID>", "message_status": "accepted" }]
}
```

- O 200 "only indicates that the API successfully accepted your request". Entrega chega por
  webhook. `input` "May not match `wa_id`". Fonte: [Service messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages).
- `messages[].id` é o wamid (`wamid.HBgL...`), o mesmo dos webhooks de status.
- `message_status`: `accepted`, `held_for_quality_assessment` ou `paused` ([referência](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api)).
  Indica o pacing do template (ver Limites).
- A ordem de entrega não segue a ordem das chamadas.
- TTL padrão: 30 dias (autenticação: 10 min). Sem `delivered` até o fim do TTL, a mensagem foi
  descartada. Em marketing, o TTL só é configurável pela MM API ([TTL](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/time-to-live)).
- **Não há chave de idempotência.** A referência só aceita os headers `User-Agent`,
  `Authorization` e `Content-Type`. A proteção contra envio duplicado é nossa.

## Templates

| Uso | Chamada | Observações |
|---|---|---|
| Listar | `GET /{waba-id}/message_templates?fields=&limit=&after=` | Referência lista `fields`, `limit`, `after`, `before`. A doc de gestão mostra também `status=approved`. Outros filtros: [verificar]. |
| Um template | `GET /{template-id}?fields=` | Mesmos campos. |
| Qualidade | `GET /{template-id}?fields=quality_score` | `score`: `GREEN`, `YELLOW`, `RED`, `UNKNOWN`. |
| Despausar | `POST /{template-id}/unpause` | Pausa comum acaba sozinha; pausado pelo pacing precisa de despausa manual (API ou WhatsApp Manager). |

- Campos: `id`, `name`, `language`, `status`, `category`, `sub_category`, `components`,
  `parameter_format` (`NAMED`/`POSITIONAL`), `quality_score`, `rejected_reason`,
  `previous_category`, `correct_category`, `message_send_ttl_seconds`.
- Paginação: `paging.cursors.before/after` e `paging.next`.
- Cota: 200 chamadas por hora, por app e WABA. Sobe para 5.000 quando a WABA tem número
  registrado ([rate limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform#rate-limits)).
- Status: `APPROVED`, `PENDING`, `REJECTED`, `PAUSED`, `DISABLED`, `IN_APPEAL`,
  `PENDING_DELETION`, `DELETED`, `ARCHIVED`, `LIMIT_EXCEEDED`. Só `APPROVED` envia. O webhook
  `message_template_status_update` também traz `FLAGGED`, `REINSTATED`, `LOCKED`, `UNARCHIVED`.
  Fontes: [referência](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/message-template-api),
  [webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/message_template_status_update).
- Pausa por qualidade baixa (`RED`): 1ª vez 3 h, 2ª 6 h, 3ª desativa ([pausa](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pausing)).
  Template parado há 12 meses é arquivado e apagado 28 dias depois ([arquivamento](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-archival)).
- Categorias: `MARKETING`, `UTILITY`, `AUTHENTICATION` (o enum ainda tem `FREE_SERVICE`). Desde
  09/04/2025 a Meta pode reclassificar para marketing por padrão e avisa por
  `template_category_update`. Paga-se a categoria vigente "at time of use"
  ([categorização](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization), [preço](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)).
- Idioma: `pt_BR` (Portugal: `pt_PT`). O mesmo nome em outro idioma é outro template e conta no
  limite ([idiomas](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/supported-languages)).
- Limites: 250 templates por WABA com portfólio não verificado e 6.000 com portfólio verificado e
  nome de exibição aprovado. Até 100 criações por hora. Nome: até 512 caracteres.

Formato de `components` na leitura ([gestão](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management), trecho):

```json
{ "name": "coupon_expiration_reminder_number_vars", "parameter_format": "POSITIONAL",
  "language": "en", "status": "APPROVED", "category": "MARKETING", "id": "1304694804498707",
  "components": [
    { "type": "HEADER", "format": "TEXT", "text": "Act fast, {{1}}!", "example": { "header_text": ["Pablo"] } },
    { "type": "BODY", "text": "...your exclusive coupon code, {{1}}, *expires in only {{2}} days!*...",
      "example": { "body_text": [["SUMMER20", "10"]] } },
    { "type": "FOOTER", "text": "Lucky Shrub Succulents" },
    { "type": "BUTTONS", "buttons": [
      { "type": "URL", "text": "See deals", "url": "https://www.luckyshrub.com/deals" },
      { "type": "QUICK_REPLY", "text": "Unsubscribe" } ] } ] }
```

Quantas variáveis o template pede:

- Contar os placeholders distintos `{{1}}`… ou `{{nome}}` em `HEADER.text` (no máximo 1) e
  `BODY.text`. Nomeado traz `example.body_text_named_params: [{ param_name, example }]`.
  Posicional traz `example.body_text: [[...]]`.
- `HEADER` com `format` `IMAGE`, `VIDEO` ou `DOCUMENT` pede o parâmetro de mídia no envio.
- Botão `URL` com `{{1}}` pede o sufixo. `COPY_CODE` pede o código.
- Contagem errada devolve `132000`.

Limites dos componentes: cabeçalho de texto com 60 caracteres; corpo com 1.024; rodapé com 60.
Até 10 botões no total, sendo até 10 quick replies (rótulo com 25), 2 URL (2.000 caracteres),
1 telefone e 1 copy code (20 caracteres).

## Webhooks

**Verificação (GET).** A Meta chama `?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...`.
Se o token bater, responda 200 com o valor de `hub.challenge`. Senão, qualquer status diferente de
200. Fonte: [Create a webhook endpoint](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint).

**Assinatura (POST).** Header `X-Hub-Signature-256: sha256=<hex>`: HMAC-SHA256 do corpo com o
**app secret** como chave. Compare com o que vem depois de `sha256=`. A doc diz "JSON payload";
calcular sobre o corpo cru é a leitura segura. TLS válido (certificado autoassinado não serve).
mTLS é opcional, por app.

**Entrega e retentativa** ([overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput)):

- Sem 200, a Meta tenta de novo na hora e depois com frequência decrescente por até 7 dias.
  Depois disso, descarta. As retentativas vão "to all apps that have subscribed" da WABA e geram
  duplicatas: "Your server should handle deduplication".
- Lote de até 1.000 atualizações por POST, sem garantia de lote. Payload de até 3 MB.
- Não há prazo fixo de resposta. O padrão pedido: latência mediana de até 250 ms e menos de 1%
  acima de 1 s. Capacidade de 3x o tráfego de saída mais 1x o de entrada.
- "There are no APIs for fetching historical webhook data": gravar o payload ao receber.
- Campos a assinar: `messages` (inclui status), `user_preferences`,
  `message_template_status_update`, `message_template_quality_update`, `template_category_update`,
  `phone_number_quality_update`, `business_capability_update`, `account_update`, `account_alerts`.

**Status** ([referência](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status)):

```json
{ "object": "whatsapp_business_account",
  "entry": [{ "id": "<WABA_ID>", "changes": [{ "field": "messages", "value": {
    "messaging_product": "whatsapp",
    "metadata": { "display_phone_number": "15550783881", "phone_number_id": "106540352242922" },
    "statuses": [{
      "id": "wamid.HBgL...", "status": "sent", "timestamp": "1750030073", "recipient_id": "16505551234",
      "pricing": { "billable": true, "pricing_model": "PMP", "type": "regular", "category": "marketing" },
      "errors": [{ "code": 131049, "title": "...", "message": "...",
                   "error_data": { "details": "..." }, "href": "..." }]
    }] } }] }] }
```

(`errors` só vem em `failed`.)

- `status`: `sent`, `delivered`, `read`, `failed`, `played` (áudio de voz). `read` pode chegar sem
  `delivered` antes: "the 'delivered' webhook is not sent because it's implied".
- `pricing` vem no `sent` e em um dos dois, `delivered` ou `read`. `type`: `regular`,
  `free_customer_service`, `free_entry_point`. `category`: `marketing`, `utility`,
  `authentication`, `authentication-international`, `marketing_lite`, `referral_conversion`,
  `service`. `billable` será descontinuado: usar `type` + `category`.
- `conversation`: omitido na v24.0+, exceto em janela de free entry point.
- Desde abril/2026 os status trazem `recipient_user_id` (BSUID) e um bloco `contacts`, exceto em
  `failed` ([BSUID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids)).

**Mensagens recebidas** (`field: "messages"`, `value.messages[]`):

| Tipo | Corpo | Fonte |
|---|---|---|
| Texto | `{ "from", "id", "timestamp", "type": "text", "text": { "body" } }` | [text](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/text) |
| Quick reply de template | `{ "context": { "from", "id" }, "type": "button", "button": { "payload", "text" } }` | [button](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/button) |
| Botão/lista interativos | `"type": "interactive"` com `button_reply { id, title }` ou `list_reply { id, title, description }` | [interactive](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/interactive) |

- No quick reply, `context.id` é o wamid da mensagem que tinha o botão. É isso que liga a
  resposta ao disparo.
- `value.contacts[]` traz `profile.name`, `wa_id` e, desde abril/2026, `user_id` (BSUID).
- Override de callback por WABA (`POST /{waba-id}/subscribed_apps` com `override_callback_uri` e
  `verify_token`) ou por número (`webhook_configuration`). Vale para `messages`, não para os
  webhooks de template e de conta ([override](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/override)).

## Preço

Fonte: [Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing).

- Cobrança **por mensagem** desde 01/07/2025. Só cobra template **entregue**. A tarifa depende da
  categoria e do DDI do destinatário.
- Janela de atendimento: 24 h a partir da última mensagem (ou ligação) da pessoa, renovada a cada
  nova. Fora dela, só template. Mensagem fora de template é grátis e só sai com a janela aberta.
- Utility entregue com a janela aberta é grátis. Marketing é cobrado mesmo com a janela aberta
  (só sai grátis na janela de free entry point).
- Free entry point: quem chega por anúncio Click to WhatsApp ou botão de Página abre 72 h em que
  tudo é grátis, inclusive template.
- Faixas de volume só em utility e authentication: somam todas as WABAs do portfólio, por
  mercado e categoria, e zeram todo mês.
- Calendário: mudanças só em 1º/01, 1º/04, 1º/07 e 1º/10, com aviso mínimo de 1 mês para a tabela.

**Brasil (+55)**, pela calculadora oficial de
[business.whatsapp.com](https://business.whatsapp.com/products/platform-pricing) (redireciona
para whatsappbusiness.com), lida em 16/10/2026. A doc dá as tabelas como vigentes desde
01/07/2026, e as mudanças de 01/10/2026 não incluem o Brasil.

| Categoria | USD por mensagem | BRL por mensagem |
|---|---|---|
| Marketing | 0,0625 | 0,3217 |
| Utility | 0,0068 | 0,0350 |
| Authentication | 0,0068 | 0,0350 |
| Authentication-international | não se aplica (o Brasil não está na lista de mercados com essa tarifa) | |

Faixas de volume (mensagens cobradas no mês, por portfólio):

| Utility | Authentication | USD | BRL |
|---|---|---|---|
| até 250 mil | até 500 mil | 0,0068 | 0,0350 |
| 250 mil a 2 mi | 500 mil a 3 mi | 0,0065 | 0,0333 |
| 2 a 17 mi | 3 a 5,25 mi | 0,0061 | 0,0315 |
| 17 a 35 mi | 5,25 a 10 mi | 0,0058 | 0,0298 |
| 35 a 70 mi | 10 a 20 mi | 0,0054 | 0,0280 |
| acima de 70 mi | acima de 20 mi | 0,0051 | 0,0263 |

- Exemplo: 1.000 templates de marketing entregues no Brasil custam US$ 62,50.
- Não baixei o CSV da tabela (a página não expõe o link): [verificar no CSV].
- Cobrança em reais: desde 01/07/2026, clientes com Sold-To Brasil no Billing Hub podem criar
  WABA em BRL, faturada pela Facebook Brasil. As WABAs desses clientes precisam migrar até
  30/06/2027; a partir de 01/07/2027 a Meta não entrega mensagem de WABA fora de BRL. O artigo da
  Central de Ajuda fala em clientes "que usam o faturamento mensal". Cliente que paga com cartão:
  [verificar].
- "AI Providers" (fornecedores de LLM e assistentes genéricos) pagam pela mensagem fora de
  template no Brasil desde 11/03/2026. A página diz que isso "does NOT change" a cobrança das
  demais empresas ([AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers)).

## Limites

**Limite de mensagens (tier)**, segundo [Messaging limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
e [mudanças de 07/10/2025](https://developers.facebook.com/documentation/business-messaging/whatsapp/upcoming-messaging-limits-changes):

- Conta **destinatários únicos** atingidos fora da janela de atendimento, em 24 h móveis.
- É **por portfólio de negócios** desde 07/10/2025, compartilhado por todos os números. Um número
  pode consumir o limite inteiro.
- Degraus: 250 → 2.000 → 10.000 → 100.000 → ilimitado. O degrau de 1.000 acabou: o primeiro salto
  passou de 1.000 para 2.000.
- Para chegar a 2.000, um destes caminhos:
  - verificar o negócio;
  - verificação feita pelo parceiro;
  - 2.000 mensagens entregues fora da janela, para números únicos, em 30 dias, com templates de
    qualidade alta.
- Escala automática: mensagens de alta qualidade em todos os números e templates, e uso de pelo
  menos metade do limite nos últimos 7 dias. Então sobe um degrau em até 6 h.
- Ler: `GET /{phone-number-id}?fields=whatsapp_business_manager_messaging_limit` → `"TIER_250"`
  (`messaging_limit_tier` foi descontinuado). Avisos: `business_capability_update`
  (`max_daily_conversations_per_business`) e `account_alerts` (negado).
- Que erro volta ao passar do limite: a doc não diz [verificar].

**Qualidade.** O número tem `quality_rating` `GREEN`, `YELLOW`, `RED` ou `NA`, "based on how
messages have been received by recipients in recent days"
([referência](https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/whatsapp-business-account-phone-number-api)).
Desde 07/10/2025, queda de qualidade não rebaixa o limite e o estado Flagged deixou de existir.
O template tem `quality_score` próprio ([qualidade](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality)).

**Throughput e cotas** ([throughput](https://developers.facebook.com/documentation/business-messaging/whatsapp/throughput), [rate limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform#rate-limits)):

| Limite | Valor | Ao estourar |
|---|---|---|
| Por número | 80 msg/s por padrão, somando entrada e saída | `130429` |
| Número em alto volume | 1.000 msg/s automático: portfólio ilimitado, 100 mil únicos em 24 h e qualidade `YELLOW` ou melhor. A troca leva até 1 min. | `131057` durante a troca |
| Número com coexistência (app WhatsApp Business + API) | 20 msg/s fixos | |
| Mesmo destinatário (par) | 1 msg a cada 6 s (~10/min, 600/h). Rajada de até 45 em 6 s, que "empresta" da cota futura. Retentar após 4^X s. | `131056` |
| API de gestão (templates, `subscribed_apps`, números) | 200 chamadas/h por app e WABA; 5.000/h com número registrado | `80007` (WABA), `4` (app) |

**Limite por usuário em marketing (healthy ecosystem)**, segundo [per-user limits](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits):

- O WhatsApp limita quantos templates de marketing uma pessoa recebe "from any business". O
  número não é divulgado e muda com a taxa de leitura e o volume da caixa de entrada.
- O Brasil não está entre as exceções (EEE, Reino Unido, Japão e Coreia do Sul). Número dos EUA
  não recebe marketing.
- Falha com `131049`. Esperar pelo menos 24 h para reenviar. Retentar antes pode travar aquele
  usuário por até 24 h.
- Marketing enviado com a janela aberta (a pessoa respondeu) não conta.

**Pacing.** Template de marketing ou utility novo, despausado ou sem `GREEN` pode ser segurado
(`held_for_quality_assessment`). Utility só entra no pacing nos 7 dias depois de uma pausa de
utility. Com feedback ruim, o template pausa e as retidas falham com
`132015`. A meta da Meta é liberar em até 1 h no p99 ([template pacing](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pacing)).
Desde 12/2025, portfólio com menos de 500 mil templates em 365 dias, ou sob suspeita, envia
campanha grande em lotes. Descarte: `failed` com `135000` ([portfolio pacing](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/portfolio-pacing)).

**Números por portfólio:** 2 registrados no começo. Sobe para 20 com o negócio verificado ou com o
limite de 2.000 ([phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)).

## Erros do envio

Fonte: [Error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes).
O erro volta na resposta HTTP, no webhook `failed` ou nos dois: tratar os dois caminhos. A Meta
pede lógica por `code` e `details`; os títulos "will eventually be deprecated".

| Código | Significado | O que fazer | Retentar? |
|---|---|---|---|
| `131026` | Não entregável: número sem WhatsApp, termos não aceitos ou app antigo | Marcar o contato; confirmar por outro canal | Não |
| `131047` | Mais de 24 h desde a última resposta (mensagem livre fora da janela) | Mandar template | Não, como texto |
| `131049` | Não entregue "to maintain healthy ecosystem engagement" | Esperar ≥ 24 h | Só após 24 h |
| `131050` | A pessoa parou o marketing da empresa | Opt-out de marketing | Não |
| `132000` | Nº de parâmetros diferente do template | Corrigir a montagem | Não |
| `132001` | Template não existe no idioma ou não está aprovado | Ressincronizar templates | Não |
| `132012` / `131009` / `100` | Formato ou valor de parâmetro inválido | Corrigir | Não |
| `131008` | Falta parâmetro obrigatório | Corrigir | Não |
| `132018` | Erro de validação do template (v23.0+) | Ler `details` | Não |
| `132015` | Template pausado por baixa qualidade | Esperar a despausa (3 h/6 h) ou editar | Depois da despausa |
| `132016` | Template desativado de vez | Criar outro | Não |
| `190` / `0` | Token expirado ou invalidado | Reconectar a conta | Não; pausar a conta |
| `10` / `200` / `131005` / `3` | Permissão ausente ou sem acesso à WABA | Revisar o token e o acesso | Não; pausar a conta |
| `130429` | Throughput do número | Backoff | Sim |
| `131056` | Muitas mensagens ao mesmo destinatário | Esperar (4^X s) | Sim, para esse número depois |
| `80007` / `4` | Cota de chamadas da WABA / do app | Backoff | Sim |
| `131048` | Envio restrito por bloqueios e denúncias | Parar os disparos; ver a qualidade | Não |
| `131064` | Limite por violação na classificação de templates | Revisar as categorias | Não, até o fim da punição |
| `131063` | Marketing desligado na Cloud API (`disable_marketing_messages_on_cloud_api`) | MM API ou religar | Não |
| `131042` | Problema de pagamento | O cliente resolve o faturamento | Não; pausar a conta |
| `368` / `131031` / `130497` | Conta restrita por política, ou país restrito | Pausar a conta | Não |
| `131045` / `133010` | Número não registrado | Registrar | Não; pausar a conta |
| `130403` / `131021` | A empresa bloqueou a pessoa / remetente igual ao destinatário | Nenhuma | Não |
| `131057` | Conta em manutenção (troca de throughput) | Esperar ~1 min | Sim |
| `131000` / `1` / `2` / `131016` / `133004` | Erro desconhecido ou instabilidade | Backoff; olhar o [status da Meta](https://metastatus.com/whatsapp-business-api) | Sim, poucas vezes |
| `135000` | Erro desconhecido de parâmetros; também é o descarte do portfolio pacing | Conferir a sintaxe | Não automático |

## Opt-in e opt-out

- "You must obtain user opt-in before sending message templates. Opt-in must clarify your
  business name and intent" ([about the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)).
- A [política](https://business.whatsapp.com/policy) (atualizada em 23/09/2026) só permite contato
  se a pessoa "have given you their mobile phone number or username" e deu "opt-in permission".
  O método é responsabilidade da empresa e precisa seguir a lei aplicável.
- "Você deve respeitar todas as solicitações (dentro e fora do WhatsApp) feitas por uma pessoa que
  deseja bloquear, descontinuar ou [...] deixar de receber suas comunicações", inclusive tirando
  a pessoa da lista.
- Exemplos de meio: SMS, site, URA, presencial ou papel. Boas práticas: dizer quais categorias de
  mensagem virão e dar instruções claras de saída. A página não fala em guardar prova do opt-in
  ([getting opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)).
- **Controle do próprio WhatsApp** ("Offers and announcements"), segundo [marketing templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates):
  - Quando a pessoa para ou retoma, chega o webhook `user_preferences` com
    `user_preferences[].{ wa_id, category: "marketing_messages", value: "stop" | "resume", detail, timestamp }`.
  - Marketing para quem parou: a API aceita, não entrega e dispara `failed` com `131050`.
  - "Not interested" não gera webhook, mas pesa no limite por usuário.
- **Botão de sair no template:** quick reply é "a button that allows your customer to easily
  opt-out of any marketing messages". O toque chega como mensagem `type: "button"`, com
  `button.text` e `button.payload`. O WhatsApp não descadastra sozinho: o Kakou trata. O botão
  pronto de opt-out do WhatsApp Manager ("Stop promotions") e o rótulo em português: [verificar]
  (o artigo da Central de Ajuda não carregou).

## Conectar a conta do cliente

| | Manual (app do próprio cliente) | Embedded Signup (GuessLess como Tech Provider) |
|---|---|---|
| App na Meta | Criado pelo cliente | Da GuessLess, com o caso de uso WhatsApp e portfólio conectado |
| Token | System user do cliente: "nunca expira" ou 60 dias (a Meta sugere 60) | Business token por cliente, da troca do `code` |
| Permissões | `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging` | As duas `whatsapp_*` com **Advanced access** |
| App Review | Não: ativo próprio usa acesso padrão | Sim |
| Verificação do negócio | Do cliente, só para subir de limite | Da GuessLess, antes do App Review |
| Webhook | No app do cliente, apontando para o Kakou e assinado com o app secret **do cliente** | No app da GuessLess, um app secret só |
| Pagamento | Cartão do cliente na WABA | Cliente adiciona a forma de pagamento na WABA |

Fontes: [access tokens](https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens),
[permissions](https://developers.facebook.com/documentation/business-messaging/whatsapp/permissions),
[tokens de system user](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens),
[get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started).

**(a) Manual.**

1. O cliente vai em Business settings > System users > Add, atribui o app (Manage app, controle
   total) e a WABA, e gera o token com as três permissões.
2. Configura o webhook no app: callback URL do Kakou e verify token.
3. Inscreve o app na WABA com `POST /{waba-id}/subscribed_apps` → `{ "success": true }`.
4. O Kakou guarda WABA ID, Phone Number ID, token e app secret.

Do lado da GuessLess não há nada na Meta. Se, em vez disso, o cliente compartilhar a WABA com o app
da GuessLess, aí é ativo de outra empresa: precisa de Advanced access, e sem ele a API devolve
erro `200`. Se o app do cliente precisa estar em modo Live para receber webhook de produção:
[verificar].

**(b) Embedded Signup**, segundo o [overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview),
a [implementação](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation)
e o [onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider).

Para virar [Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers):

- verificar o negócio da GuessLess;
- passar no App Review com dois vídeos: uma mensagem enviada pelo app e recebida no WhatsApp, e o
  app criando um template;
- obter Advanced access às duas permissões.

Desde 03/10/2025 a access verification não é mais exigida para ser Tech Provider.

Configuração:

- Facebook Login for Business com a variação "WhatsApp Embedded Signup", que gera o `config_id`;
- domínios HTTPS cadastrados;
- JS SDK carregado;
- usar a v4 (a v2 foi descontinuada em 15/10/2026).

Fluxo:

1. Front: `FB.login(cb, { config_id, response_type: 'code', override_default_response_type: true, extras: { setup: {} } })`.
   Um `message` de `*.facebook.com` traz `type: 'WA_EMBEDDED_SIGNUP'`, `event: 'FINISH'` e
   `data.{ waba_id, phone_number_id, business_id }`.
2. Servidor: `GET /oauth/access_token?client_id=&client_secret=&code=`. "The exchangeable token
   code has a time-to-live of 30 seconds." A resposta traz o business token (o formato exato:
   [verificar]).
3. `POST /{waba-id}/subscribed_apps` com o business token.
4. `POST /{phone-number-id}/register` com `{ "messaging_product": "whatsapp", "pin": "123456" }`.
   O PIN vira a verificação em duas etapas.
5. O cliente adiciona a forma de pagamento. Só então está pronto.

Limites e variações:

- Por padrão, 10 clientes novos a cada 7 dias. Sobe para 200 com Business Verification, App Review
  e Access Verification.
- O business token serve para ações automáticas "without [...] requiring future
  re-authentication".
- Variações que também exigem ser Tech Provider:
  - [Hosted ES](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/hosted-es):
    link pronto da Meta, só Cloud API, sem customização. A WABA chega no webhook `account_update`
    com `PARTNER_ADDED`.
  - [Coexistência](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users):
    mantém o número do app WhatsApp Business, a 20 msg/s, com 24 h para sincronizar o histórico.

## Números de telefone

- `to` aceita `+`, hífen, parênteses e espaço. A Meta recomenda "+ e DDI". Sem `+`, a API
  prefixa o DDI do número da empresa, o que pode entregar a outra pessoa
  ([Service messages](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)).
- "For Brazil and Mexico, the extra added prefix of the phone number may be modified by the Cloud
  API. This is a standard behavior of the system and is not considered a bug." A doc não fala em
  9º dígito, nem diz se o `wa_id` vem sem o 9: [verificar com números reais].
- `wa_id` volta só com dígitos (ex.: `16505551234`) e pode diferir do `input`. Nos webhooks,
  `from`/`wa_id` são o número e o ID do usuário, que "may not always match".
- **BSUID** (ID do usuário por portfólio, por causa dos nomes de usuário de 2026), segundo a
  [página de BSUID](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids):
  - Aparece desde o início de abril/2026 em `user_id`, `from_user_id` e `recipient_user_id`.
    Formato: `US.13491208655302741918`.
  - Quem adota nome de usuário pode vir **sem telefone**. O número só aparece se houve conversa
    ou ligação com aquele número da empresa nos últimos 30 dias, ou se a pessoa está no contact
    book.
  - Envio por BSUID: campo `recipient`, sem `to` (se vierem os dois, vale o `to`). Previsto para
    julho/2026, mas a seção ainda diz "coming soon" [verificar]. Erro `131062`: BSUID não aceito
    naquela mensagem.

## Marketing Messages API (ex-MM Lite)

Fontes: [overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/overview),
[envio](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/send-marketing-messages),
[changelog](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/changelog),
[support](https://developers.facebook.com/documentation/business-messaging/whatsapp/support).

- Existe e vale para disparo de marketing. Foi renomeada e saiu do beta em 19/11/2025 ("formerly
  known as Marketing Messages Lite API").
- `POST /{phone-number-id}/marketing_messages`, com o mesmo payload da Cloud API. Só aceita
  template de marketing.
- Sem onboarding completo (aceite dos termos), cai na Cloud API. Para não cair, use
  `product_policy: "STRICT"`.
- "Same billing model as Cloud API". O status vem com `pricing.category: "marketing_lite"`. Se a
  tarifa é a mesma do marketing: [verificar].
- Ganhos: otimização de entrega, métricas, GIF e TTL de marketing. "Meta recommends all marketing
  messages are sent via MM API", com limites por usuário "more dynamic".
- Muda para quem usa a Cloud API: nada é obrigatório em 16/10/2026. Mas desde 06/04/2026 o cliente
  pode ligar `disable_marketing_messages_on_cloud_api`, e então marketing pela Cloud API falha
  com `131063`.

## Unipile e WhatsApp

A Unipile conecta uma conta comum de WhatsApp por QR code ou código de pareamento
([doc](https://developer.unipile.com/docs/whatsapp)). Usa "the same client WhatsApp Web uses",
sem WABA nem templates ("there is nothing for Meta to bill by message",
[unipile.com](https://www.unipile.com/whatsapp-api-providers/)). A própria Unipile avisa que
"Fresh accounts can be blocked after only 2–3 new chats" e pede poucas conversas novas
([limits](https://developer.unipile.com/docs/provider-limits-and-restrictions)). Os
[termos do WhatsApp](https://www.whatsapp.com/legal/terms-of-service) proíbem "bulk messaging,
auto-messaging, auto-dialing" e uso "non-personal" sem autorização. A Meta diz que "Using
unauthorized third-party tools is prohibited" na plataforma
([about the platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform)). Por isso a Unipile serve para
conversa 1:1 numa conta pessoal, mas não para disparo oficial a um segmento: não há template
aprovado, opt-out pelo `user_preferences`, status com preço nem limite de portfólio, e o risco
de bloqueio é do número do cliente.

## O que isso muda no Kakou

- **O `wamid` é a chave do envio.** Guardar `messages[0].id` na ação. Webhooks repetem por até
  7 dias e chegam fora de ordem (`read` pode vir sem `delivered`). Deduplicar por
  `(wamid, status)` e só avançar o estado (`sent` < `delivered` < `read`; `failed` é final).
- **Sem idempotência.** Marcar a ação como `enviando` antes do POST. Após timeout ou 5xx, não
  reenviar às cegas: esperar o webhook. Usar `biz_opaque_callback_data` com o id da ação.
- **Webhook rápido e assinado.** Validar `X-Hub-Signature-256` sobre o corpo cru. No Embedded
  Signup há um app secret só; no manual, um por cliente. Responder 200 na hora e processar em
  fila. Gravar o payload cru, porque não há API de histórico.
- **Ritmo e teto por portfólio.** Fila por número bem abaixo de 80 msg/s (o teto inclui as
  recebidas). Contar destinatários únicos fora da janela em 24 h móveis antes de montar o lote
  (conta nova: 250). Backoff em `130429`, `131056`, `80007` e `4`.
- **Retentativa por código.** Não retentar `131026`, `131047`, `131050`, `132000`, `132001`,
  `132012`, `132016`, `130403`. `131049` só após 24 h. `132015` espera a despausa. `190`,
  `131042`, `131048`, `131063`, `131064`, `368` e `131031` pausam a conta e avisam o usuário.
- **Descadastro por três portas.**
  - `user_preferences` com `stop`, ou falha `131050`: opt-out de marketing.
  - Toque no quick reply de sair (`type: "button"`, ler o `payload`): opt-out do Kakou.
  - Texto pedindo para sair: opt-out do Kakou.

  A política obriga a respeitar o pedido feito fora do WhatsApp também.
- **Identidade do contato.** Enviar `to` em E.164 com `+55`. Guardar o `wa_id` devolvido e o
  `user_id` (BSUID) dos webhooks. Casar respostas por `context.id`, `wa_id` ou BSUID, nunca pelo
  número digitado (9º dígito: [verificar]).
- **Templates sincronizados.** Lista paginada mais os webhooks `message_template_status_update`
  e `template_category_update`. Só oferecer `APPROVED` em `pt_BR`. Calcular as variáveis pelos
  placeholders de HEADER, BODY e URL. Ler a categoria no envio, porque é ela que define o preço.
- **Custo previsível.** Estimar o lote com a tabela do Brasil (marketing US$ 0,0625; utility
  US$ 0,0068 fora da janela) e conferir pelo `pricing.type`/`category` do webhook. Só se paga o
  que for entregue.
- **Conexão.** Para produção: Embedded Signup v4 como Tech Provider (verificação do negócio e
  App Review). Até lá, piloto pelo caminho manual, com o app do próprio cliente. Fixar a versão da
  Graph API numa variável (`v25.0` ou `v26.0`).
