# RD Station CRM: o que o SDR usa

Pesquisa na documentação oficial (developers.rdstation.com), 29/09/2026. O
cliente está em `src/server/rd/cliente.ts`.

## Versão

- **v1** (`https://crm.rdstation.com/api/v1`, token na query `?token=`). É a
  única versão com token fixo, e é a que o épico pede ("token da API", trava
  T-6). Continua documentada e sem data de descontinuação.
- A v2 (`api.rd.services/crm/v2`) exige OAuth2 com refresh token. Ganha busca
  por campo personalizado, que ajuda a deduplicar. O cliente fica atrás da
  interface `ClienteRd` para a troca ser só de adaptador.
- Use o token de um usuário com visibilidade **Geral**: com "Restrito", o token
  cria negociação para outro responsável mas depois não consegue ler nem
  atualizar.

## Endpoints

| Uso | Chamada | Observações |
|---|---|---|
| Funis e etapas | `GET /deal_pipelines?limit=200` | Cada funil traz `deal_stages[]` com `id`, `name`, `order`. |
| Campos personalizados | `GET /custom_fields?for=deal` | `type`: `option` (valor = uma das `opts`, string), `text`, `date` (`DD/MM/AAAA`), `multiple_choice` (array). |
| Usuários | `GET /users?active=true` | Para responsável e originador. |
| Fontes | `GET /deal_sources` | Fonte "LinkedIn". |
| Empresa | `GET /organizations?q=` · `POST /organizations` | `{ organization: { name, user_id } }`. O nome é único na conta. A negociação só aceita `organization: { _id }`: crie a empresa antes. |
| Criar negociação | `POST /deals` (responde **200**) | `{ deal: { name, deal_stage_id, user_id, deal_custom_fields: [{ custom_field_id, value }] }, organization: { _id }, contacts: [{ name, title }], deal_source: { _id } }` |
| Buscar negociação | `GET /deals/{id}` · `GET /deals?name=&exact_name=true&deal_pipeline_id=` | A v1 não filtra por campo personalizado. |
| Mover de etapa | `PUT /deals/{id}` | **`deal_stage_id` vai na raiz do body.** Dentro de `deal`, a API devolve 200 e **não move**. Campos em `deal: { deal_custom_fields, user_id }`. |
| Próximo passo | `POST /tasks` | `{ task: { deal_id, subject, type: "task", date: "AAAA-MM-DD", hour: "HH:MM", user_ids: [] } }`. O plano Free só aceita `type: "task"`. |
| Anotação | `POST /activities` | `{ activity: { deal_id, user_id, text } }`. Não pode ser editada. |

## Limites e erros

- 120 requisições por minuto. Estouro devolve 429.
- Os formatos de erro variam:
  - 422 de validação: `{ "errors": { "campo": ["msg"] } }`;
  - 401: `{ "error": "Permission denied." }`;
  - 404: `{ "errors": { "error_type": "RESOURCE_NOT_FOUND" } }`.
- **Não há idempotência nem upsert.** A proteção é nossa:
  - `rd_deal_id` no lead;
  - evento único por lead e etapa em `rd_eventos`;
  - busca por nome exato antes de criar.

## [verificar] antes de ligar em produção

- O formato da lista de `GET /organizations?q=`. O cliente aceita lista pura e
  `{ organizations: [...] }`.
- Que erro volta quando um campo é obrigatório para entrar numa etapa
  (`required_rules`).
