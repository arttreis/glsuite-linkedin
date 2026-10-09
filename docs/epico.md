# Épico — SDR de LinkedIn próprio da GuessLess

29/09/2026 · uso interno · dono: Arthur

Documento autocontido para rodar em um repositório novo (sugestão de nome:
`guessless-sdr`). Copiar para `docs/epico.md` do repo novo e executar os tickets
na ordem da §9. Nada aqui depende do `guessless-docs` para ser lido.

## 1 · O que é, em uma linha

Um sistema que prospecta no LinkedIn pelos 4 perfis da GuessLess (Arthur,
Juliano, Luiz, JP): importa e tria a lista, envia convite e sequência de DMs
respeitando o teto de cada perfil, detecta resposta, rascunha a conversa com IA
para um humano aprovar e registra tudo no RD Station CRM.

Substitui o PRIME SDR. A diferença está em três coisas que nenhuma ferramenta
pronta entregava: regras por praça (Brasil, Canadá, Espanha), aprovação
humana antes de a IA falar em nome de alguém e registro nativo no RD com
o campo de ângulo.

## 2 · Por que construir e não comprar

| | Kakiyo (Conqueror, 4 contas) | Construir |
|---|---|---|
| Custo/mês | US$ 399 (US$ 319 no anual) | ~US$ 135–215 (Unipile €49 + Claude ~US$ 20–40 por perfil) |
| Regras por praça (descadastro CASL, DM manual na Espanha) | não verificado | nativo |
| Aprovação humana por mensagem | não verificado | nativo |
| RD Station com estágio e ângulo | via API genérica | nativo |

Custo de construção: 3–4 semanas de 1 dev full-stack até os 4 perfis
rodando, depois ~2–4 h/semana de manutenção.

## 3 · Fora do escopo desta versão

- E-mail (a régua D de e-mail roda em outra infraestrutura), WhatsApp, InMail.
- Busca automática de leads por sinal (quem comentou post, troca de emprego) —
  fase 2. Nesta versão a lista vem importada ou da busca da Unipile.
- Produto multi-cliente / módulo da GL Suite. O modelo de dados não impede, mas
  nada é construído para isso agora.
- Scraping de Sales Navigator fora do que a Unipile expõe.

## 4 · As regras de negócio (vêm das campanhas 01, 03, 04 e internacional)

Estas regras são requisito, não sugestão. Cada uma tem ticket que a
implementa e teste que a verifica.

### 4.1 · O fluxo da campanha — montado com blocos, com 4 toques de modelo

Cada campanha tem o seu fluxo, montado no editor ligando blocos (nodes). O
operador decide quantos toques, a ordem, as esperas e os desvios. Os blocos:

| Bloco | O que faz |
|---|---|
| Início | ponto de entrada: o lead aprovado na triagem entra aqui |
| Convite | pedido de conexão, com nota opcional (template ou personalizada pela IA) |
| Esperar | N dias úteis no fuso do perfil, a partir do bloco anterior |
| Condição | desvia o caminho: aceitou o convite em até N dias úteis? · já é conexão de 1º grau? |
| Mensagem | DM com template |
| Tarefa manual | o dono do perfil escreve à mão; o roteiro do bloco é apoio |
| Fim | encerra o fluxo: sem resposta, ou pausa de 60 dias com ângulo novo |

O sistema não deixa ativar um fluxo inválido. Um fluxo é válido quando:

- tem um único Início e todo caminho termina num Fim, sem ciclos;
- Mensagem só aparece em caminho que passou por "aceitou" ou "já é conexão"
  (DM só para 1º grau, §4.3);
- todo bloco de texto passa no validador (§4.2) com o exemplo longo.

As regras abaixo valem dentro de **qualquer** fluxo, e o editor não desliga
nenhuma delas: validador (§4.2), teto e janela do perfil (§4.3), parada
automática (§4.4), regras da praça (§4.5: na Espanha, Mensagem vira Tarefa
manual; no Canadá, toda DM leva a saída), saída de quem responde e um alvo, um
dono (§4.7).

O fluxo padrão de uma campanha nova é o de 4 toques, já montado:

| Toque | Quando | Objetivo | Regra |
|---|---|---|---|
| T1 · Convite | dia 0 | aceitar a conexão | nota curta, sem oferta, sem link |
| T2 · DM 1 | +2 dias úteis do aceite | dar antes de pedir | insight, não pergunta nada |
| T3 · DM 2 | +4 dias úteis depois do T2 | gerar resposta | uma pergunta fácil de responder |
| T4 · DM 3 | +5 dias úteis depois do T3 | sair bem | saída elegante |

- ⛔ Sem link, anexo ou link de agenda em T1–T4. O link de agenda só aparece
  dentro de uma conversa, depois de a pessoa responder.
- ⛔ Nunca dois toques no mesmo dia para a mesma pessoa. Nunca em fim de semana
  ou feriado da praça.
- ⛔ Quem responde sai da régua na hora. Todas as ações pendentes do lead são
  canceladas no mesmo processamento do webhook. É o erro mais caro do sistema.
- A copy aprovada usa só `{{first_name}}` e `{{company}}`. "Token não é
  personalização" — a personalização real é a triagem humana da lista.
- Offsets, textos e a forma do fluxo são configuração da campanha, não código.
  Os valores acima são o default. Onde este documento diz T1–T4, leia "o
  convite e as mensagens do fluxo".
- Fluxo de campanha ativa com leads em andamento não muda por baixo deles:
  editar cria uma versão nova, que vale para os leads que entrarem depois.

### 4.2 · Validador de copy — toda mensagem que sai passa por ele

Vale para template, para texto da IA e para texto editado por humano:

| Regra | Onde |
|---|---|
| Sem travessão (—) nem meia-risca (–) | todas |
| Sem as palavras proibidas: agência, marketing, growth, tráfego (lista configurável por perfil/idioma) | todas |
| Sem URL | convite e mensagens do fluxo |
| Teto de caracteres por bloco, configurável (fluxo padrão: 250 · 350 · 250 · 180) | convite e mensagens do fluxo |
| Limite do LinkedIn para nota de convite [verificar por tipo de conta] | convite |
| Nunca afirmar que a mensagem foi escrita à mão | mensagens da IA |
| Descadastro presente (ver 4.5) | perfis da praça Canadá |

Falha no validador bloqueia o envio e manda a ação para revisão humana com o
motivo. Nunca corrige em silêncio.

### 4.3 · Teto por perfil — o teto é do perfil, não da campanha

O LinkedIn conta ações por conta. Duas campanhas a 15 convites/dia são 30 no
perfil, que é o número que dispara restrição. O despachante soma tudo o que o
perfil faz.

| Perfil | Praça · fuso | Convites/dia (sem 1 · 2 · 3+) | Teto convites/semana | DMs/dia |
|---|---|---|---|---|
| Juliano | Brasil · America/Sao_Paulo | 8 · 12 · 15 | 100 | 15 · 20 · 25 |
| Arthur | Brasil · America/Sao_Paulo | 8 · 12 · 15 (decisão aberta D3) | 75 (D3) | 15 · 20 · 25 |
| Luiz | Canadá · America/Toronto | 6 · 8 · 10 | 50 | proporcional |
| JP | Espanha · Europe/Madrid | 4 · 5 · 6 | 30 | — (DM é manual, ver 4.5) |

- "Semana 1" conta a partir da ativação do perfil no sistema.
- Janela: dias úteis, 9h–18h no fuso do perfil, com intervalo aleatório entre
  ações (jitter configurável, default 3–12 min).
- DM só para conexão de 1º grau.
- Convite pendente há mais de 21 dias é retirado [verificar endpoint na Unipile].

### 4.4 · Parada automática

O perfil é pausado sozinho, e o dono do perfil é avisado, quando:

- a Unipile reporta conta desconectada, checkpoint ou verificação (captcha);
- erro de limite do LinkedIn (429, 422 `cannot_resend_yet` ou equivalente) se
  repete;
- taxa de aceite < 15% em 3 dias úteis, com amostra mínima configurável
  (default 20 convites);
- queda brusca de aceite (configurável).

Despausar é sempre manual. Pausar também pode ser feito por um botão, por
qualquer operador, sem precisar de reunião.

### 4.5 · Regras por praça

| | Brasil (Arthur, Juliano) | Canadá (Luiz) | Espanha (JP) |
|---|---|---|---|
| Lei | LGPD, legítimo interesse | CASL — DM de LinkedIn é mensagem comercial | LSSI-CE art. 21 |
| Cadência automatizada | permitida | permitida com descadastro funcional em toda mensagem | ⛔ não |
| O que o sistema faz | convite + T2–T4 automáticos | convite + T2–T4 automáticos, toda DM termina com a saída (ex.: "or tell me to stop and I will") | só convite. Do aceite em diante vira tarefa para o JP escrever à mão, com o roteiro de apoio exibido |
| Idioma | PT | EN | ES |
| Opt-out | imediato | imediato (a lei dá 10 dias úteis; o sistema honra na hora) | imediato |
| Sem resposta até o T4 | fica como conexão, não entra em nova régua | pausa de 60 dias, volta com ângulo diferente | pausa de 60 dias, volta com ângulo diferente |
| Onde registra | RD Station | só no sistema (é a "planilha-espelho" da praça). ⛔ não vai para o RD | só no sistema, e só depois do DPA assinado (trava T-4) |

⚠️ A tabela é insumo levantado nos docs da casa, não é parecer jurídico.

### 4.6 · Resposta e saída

| Situação | O que o sistema faz |
|---|---|
| Respondeu qualquer coisa | sai da régua, lead vai para `em_conversa`, RD vai para 03 · Conversa, alerta ao dono do perfil. SLA: 4 horas úteis no fuso do perfil |
| Disse não | encerra. Sem sequência de recuperação, sem outro canal |
| Pediu para não ser contatado | opt-out global (vale para os 4 perfis), sai da base e não volta em nenhuma importação futura |
| Perguntou de onde veio o contato | a IA responde a verdade: perfil público do LinkedIn, contato profissional |
| Quer conversar | proposta de reunião com o link de agenda do responsável (Juliano conduz discovery nas três praças; configurável) |

⛔ Sem escalada de canal: nada de WhatsApp ou e-mail sem convite explícito da pessoa.

**Inbox: todas as conversas do LinkedIn do perfil.** A inbox mostra todas as
conversas das contas conectadas, inclusive as que não vieram de campanha, e
destaca as de campanha. O histórico é trazido da Unipile ao conectar a conta e
pode ser atualizado pelo painel; daí em diante chega por webhook.

- Conversa fora de campanha é só leitura e resposta humana: não dispara IA,
  SLA, alerta, RD nem mexe em estado de lead.
- Se a pessoa de uma conversa fora de campanha for importada depois, a
  conversa passa a aparecer como de campanha.
- Perfil da Espanha só grava conversa fora de campanha com o DPA assinado
  (trava T-4). Sem DPA, a inbox do JP mostra só as de campanha.
- Quem pediu opt-out continua fora de qualquer importação, mas a conversa
  dele segue visível na inbox para quem opera o perfil.

### 4.7 · Um alvo, um dono

- Uma pessoa (por `provider_id` do LinkedIn) pertence a um perfil da casa.
  Importar a mesma pessoa em outro perfil é bloqueado e mostrado na triagem.
- Duas pessoas da mesma empresa tocadas por perfis diferentes: cooldown de
  empresa configurável (default 30 dias; decisão aberta D4). Dois perfis da
  casa chegando no mesmo diretor na mesma semana soa como spam.
- Todo contato guarda URL do perfil, fonte e data da coleta. Isso não é zelo:
  é requisito do legítimo interesse (Brasil) e a defesa de consentimento
  implícito (Canadá).

### 4.8 · Modos de resposta por perfil

| Modo | O que acontece quando chega mensagem | Default para |
|---|---|---|
| `manual` | a IA sugere um rascunho, o humano escreve e envia | JP (sempre) |
| `aprovacao` | a IA escreve, a mensagem fica na fila, o humano aprova, edita ou rejeita | Juliano, Luiz, Arthur no início |
| `automatico` | a IA envia sozinha; exceções (preço, reclamação, opt-out ambíguo, baixa confiança) caem na fila | ninguém no lançamento. Liga por perfil só depois do gate da §7 |

### 4.9 · CRM — RD Station, funil Comercial · Serviço

Só leads da praça Doméstico.

| Evento no sistema | Estágio no RD | Campos |
|---|---|---|
| Lead aprovado na triagem | 01 · Alvo | empresa (nome da negociação = `<Empresa>` e nada mais) · decisor (nome e cargo) · Nicho · Fonte = LinkedIn · Praça = Doméstico · Originador = dono do perfil |
| Convite enviado | 02 · Tocado | Ângulo de abertura (lista fechada) · próximo passo com data |
| Respondeu | 03 · Conversa | dono da conversa · próximo passo |
| Qualificado na conversa (humano marca) | 04 · Qualificado | — |
| Reunião marcada | 05 · Discovery | data da reunião |

O ângulo é o único dado que ensina alguma coisa. Toque sem ângulo registrado
é bug. Lista fechada de ângulos: Refém do marketplace · Margem invisível · O
número não bate · Cliente que é seu · ROAS de verdade · Engenharia, não achismo,
mais os ângulos das campanhas de indústria e parceria. É configuração, não código.

### 4.10 · Primeiros passos obrigatórios

Enquanto o operador não tem uma campanha pronta, o Início vira a página de
primeiros passos, e só ficam abertas as telas necessárias para cumpri-los
(Início, Perfis, Campanhas, Importar, Triagem). As outras aparecem trancadas
no menu e redirecionam para o Início. Depois, o mesmo espaço do Início mostra
o que está esperando alguém agora (conversas, aprovação, leads parados,
tarefas, triagem). Os passos, nesta ordem:

1. Conectar o LinkedIn de um perfil que o operador opera.
2. Ativar esse perfil (checklist da §8).
3. Criar uma campanha com fluxo válido (§4.1).
4. Importar uma lista para a campanha.
5. Aprovar pelo menos um lead na triagem.
6. Ativar a campanha.

"Campanha pronta" = campanha ativa, num perfil ativo que o operador opera, com
pelo menos um lead aprovado. O admin vale para qualquer perfil. Depois que o
operador tem uma campanha pronta, o bloqueio não volta, mesmo que a campanha
seja pausada.

## 5 · Arquitetura

```text
             ┌──────────── Painel (Next.js) ────────────┐
             │ triagem · campanhas · fila de aprovação   │
             │ inbox · tarefas do JP · métricas · pausar │
             └───────────────┬──────────────────────────┘
                             │
 Apify / CSV ──► importação ─┤
 Unipile search ─────────────┤        ┌──────────────┐
                             ▼        │ Claude API   │
                    ┌─────────────────┤ Haiku 4.5:   │
                    │   Supabase      │  classifica  │
                    │   (Postgres)    │ Sonnet 5:    │
                    │ pessoas · leads │  rascunha    │
                    │ acoes · msgs    │  e pesquisa  │
                    └───┬─────────▲───┴──────────────┘
          cron tick     │         │ webhooks (aceite, mensagem, status da conta)
          (5 min)       ▼         │
                ┌──────────────┐  │
                │ Despachante  ├──┴──► Unipile ──► LinkedIn (4 contas)
                └──────┬───────┘
                       └──────────► RD Station CRM (só Doméstico)
```

| Peça | Escolha | Por quê |
|---|---|---|
| App e painel | Next.js (App Router) + TypeScript na Vercel | stack que a casa já opera |
| Banco e auth | Supabase (Postgres + Auth + RLS) | idem; login dos 4 operadores |
| LinkedIn | Unipile (hosted auth, API REST, webhooks) | busca, perfil, convite, DM, histórico e webhooks prontos. Não gerencia sequência nem protege a conta: as duas coisas são nossas |
| Agendamento | tabela `acoes` + tick de cron a cada 5 min (Vercel Cron ou pg_cron [verificar frequência permitida no plano]) | o teto é global por perfil. Um despachante central que olha a fila inteira modela isso melhor que um workflow durável por lead |
| IA | Claude API, SDK oficial `@anthropic-ai/sdk`. `claude-haiku-4-5` classifica a resposta; `claude-sonnet-5` rascunha e pesquisa | 30 palavras não pedem modelo de topo. O modelo fica em variável de ambiente, e a troca é decidida pelo eval (§7) |
| Alertas | e-mail (Resend) (decisão aberta D5: e-mail, Slack ou WhatsApp) | SLA de 4 h precisa de aviso ativo |

### 5.1 · Por que um despachante central

A cada tick:

1. Para cada perfil ativo: está dentro da janela (dia útil, hora, fuso, feriado)?
2. Quanto ainda cabe hoje e nesta semana (convites e DMs), considerando a rampa?
3. Pega as ações `pendente` com `agendada_para <= agora` daquele perfil, em ordem,
   até o saldo; no máximo uma ação por perfil por tick, com jitter.
4. Revalida antes de enviar: lead ainda na régua? pessoa sem opt-out? nenhum toque
   hoje para essa pessoa? validador de copy ok?
5. Envia com chave de idempotência, grava o resultado e agenda o próximo passo.

Reenvio: erro transitório → nova tentativa com backoff (máx. 3). Erro de limite →
conta para a regra de parada (4.4). Erro permanente → ação falhou e lead para
revisão.

## 6 · Modelo de dados (proposta inicial)

```text
perfis (
  id, nome, unipile_account_id, praca,            -- 'domestico' | 'canada' | 'espanha'
  fuso, idioma, modo_resposta,                    -- 'manual' | 'aprovacao' | 'automatico'
  rampa jsonb,                                    -- [{semana:1, convites_dia:8, dms_dia:15}, ...]
  teto_convites_semana, janela jsonb,             -- {inicio:'09:00', fim:'18:00', jitter_min:[3,12]}
  ativado_em, status, motivo_pausa,               -- 'ativo' | 'pausado'
  link_agenda, voz_md, regras_md, rodape_obrigatorio
)
campanhas (
  id, perfil_id, nome, angulo, nicho,
  modo_copy,                                      -- 'template' | 'personalizada'
  sequencia jsonb,                                -- legado: [{toque:'T1', tipo:'convite', offset_dias_uteis:0, ancora:'inicio', template:'...'}, ...]
  fluxo_id,                                       -- versão atual do fluxo de blocos (§4.1)
  pos_t4,                                         -- 'conexao' | 'pausa_60_novo_angulo' (padrão do bloco Fim)
  max_leads, status
)
fluxos (id, campanha_id, versao, grafo jsonb)     -- {nodes:[{id, tipo, ...}], arestas:[{de, para, saida}]}
pessoas (
  id, provider_id unique, url_publica, nome, cargo, empresa, empresa_dominio,
  localizacao, fonte, coletado_em, dono_perfil_id, optout_em, praca
)
leads (
  id, pessoa_id, campanha_id, fluxo_id, estado, angulo, passo_atual,
  pesquisa jsonb, rd_deal_id, criado_em, atualizado_em
)
acoes (
  id, lead_id, perfil_id, tipo,                   -- 'convite' | 'dm' | 'retirar_convite' | 'tarefa_manual'
  toque, texto_gerado, texto_final, origem,       -- toque = id do bloco do fluxo; origem 'template' | 'ia' | 'humano'
  status,                                         -- 'pendente' | 'aguardando_aprovacao' | 'enviada' | 'falhou' | 'cancelada'
  agendada_para, idempotency_key unique, tentativas, erro,
  enviada_em, provider_message_id, aprovada_por, validacao jsonb
)
mensagens (
  id, lead_id, perfil_id, direcao,                -- 'entrada' | 'saida'
  autor,                                          -- 'prospect' | 'ia' | 'humano'
  texto, provider_message_id unique, em
)
optouts (provider_id unique, em, perfil_origem, texto_pedido)
eventos (id, tipo, entidade, entidade_id, payload jsonb, em)   -- auditoria de tudo
webhooks_recebidos (id, provider_event_id unique, payload, processado_em)  -- idempotência
feriados (praca, data, nome)
```

### 6.1 · Estados do lead

```text
importado ─► triagem ─┬─► rejeitado
                      └─► na_fila ─► convite_enviado ─┬─► aceito ─► em_sequencia (T2→T3→T4) ─► sem_resposta
                                                      └─► convite_retirado (21 d)
qualquer estado depois do convite ──(mensagem recebida)──► em_conversa
em_conversa ─┬─► qualificado ─► reuniao_marcada
             ├─► encerrado_nao
             ├─► optout
             └─► escalado_humano
régua automática ──(dono do perfil escreveu direto no LinkedIn)──► escalado_humano
perfil pausado ⇒ ações congeladas, estado preservado
```

Regra somada na implementação (SDR-07 e SDR-13): se o dono do perfil escreve
direto no LinkedIn para quem ainda está na régua, a régua para (pendentes
canceladas) e o lead vai para `escalado_humano`. Na Espanha, onde T2–T4 são
tarefas manuais, a mensagem do JP conclui a tarefa do toque e a régua segue.

Somado no SDR-21 (fluxo com blocos): `na_fila → aceito` quando o fluxo pergunta
"Já é conexão?" e a resposta é sim; `aceito → sem_resposta` quando o fluxo
termina logo depois do aceite. Convite retirado segue pela saída "não" da
condição de aceite; um Fim depois disso mantém o lead em `convite_retirado`.

Toda transição grava um evento. Todo `em_conversa` cancela as ações pendentes
na mesma transação.

## 7 · O agente de conversa

Entrada: histórico completo da conversa, dados da pessoa, pesquisa (se houver),
campanha e ângulo, voz e regras do perfil, oferta vigente, praça.

Passo 1 — classificação (Haiku 4.5, saída estruturada):
`interesse | pergunta | objecao | nao | optout | fora_do_escritorio | irrelevante`,
com confiança.

Passo 2 — decisão e rascunho (Sonnet 5, saída estruturada):

```json
{
  "acao": "responder | propor_reuniao | encerrar | registrar_optout | escalar_humano",
  "mensagem": "texto ou null",
  "motivo": "uma linha",
  "estagio_sugerido": "03 | 04 | 05 | null",
  "confianca": 0.0
}
```

Regras duras, que valem depois da geração e não só no prompt: validador §4.2,
modo do perfil (§4.8) e optout detectado → registra antes de qualquer outra coisa.

Base dos prompts: os prompts 5 a 8 da Kakiyo (conversa, objeção, momento de
marcar, reativação), reescritos com as regras da casa: frases curtas, oral, sem
travessão, no máximo 2 perguntas na conversa, link de agenda só com interesse
real, idioma do prospect. Prompt de sistema estável por perfil, com
`cache_control` para cache.

### 7.1 · Eval — o gate para o modo automático

- Dataset: 30+ conversas simuladas por praça, com as objeções reais: "manda
  material", "já tenho quem faça", "quanto custa?", "não sou eu que cuido
  disso", "de onde você tirou meu contato?", "pare de me mandar mensagem",
  resposta em outro idioma, resposta monossilábica.
- Rubrica: respeita o validador · decide a ação certa · não promete resultado
  nem número · não pede reunião cedo demais · tom de voz do perfil. Nota por
  critério; a revisão humana calibra a primeira rodada.
- Gate para ligar o `automatico` num perfil: eval aprovado e 2 semanas em
  `aprovacao` com taxa de edição/rejeição abaixo do limiar (decisão aberta D6,
  sugestão: < 10%).

## 8 · Travas que não são código

| # | Trava | Bloqueia | Dono |
|---|---|---|---|
| T-1 | Conta na Unipile e os perfis conectados. Confirmar com a Unipile de que país sai o IP de cada conta (Luiz = Canadá, JP = Espanha) | M1 | Arthur |
| T-2 | Juliano de acordo com a IA rascunhando em nome dele, no modo `aprovacao` | perfil Juliano em M2 | Juliano |
| T-3 | Acordo de parceria com cláusula de automação assinado com Luiz e JP | perfis Luiz e JP | Arthur |
| T-4 | DPA assinado antes de gravar nome europeu | perfil JP | Arthur |
| T-5 | Postura CASL e LSSI confirmada com fonte local | perfis Luiz e JP | Luiz, JP |
| T-6 | Token da API do RD Station e funil Comercial · Serviço configurado conforme §4.9 | M3 (RD) | Arthur |

Os perfis do Brasil não esperam nenhuma das travas internacionais. Ordem de
ativação: Arthur → Juliano → Luiz → JP.

## 9 · Tickets

Convenção: um ticket = um branch = um PR. Cada PR traz testes dos critérios de
aceite. [verificar] = confirmar na documentação da Unipile ou do RD antes de
codar.

### Marco 0 · Fundação

**SDR-01 · Repositório e esteira**

- Next.js + TypeScript + Supabase + Vercel; lint, typecheck e testes no CI;
  `.env.example`; `CLAUDE.md` do repo apontando para este épico.
- ✅ Aceite: deploy de preview funcionando; CI verde; nenhum segredo versionado.

**SDR-02 · Modelo de dados e seed**

- Migrations da §6, RLS por operador, seed dos 4 perfis com a configuração da §4.3
  (status pausado), seed dos feriados de BR, ON e ES do ano corrente.
- ✅ Aceite: migrations idempotentes; `provider_id` único em `pessoas`;
  `idempotency_key` único em `acoes`.

**SDR-03 · Integração Unipile: contas e webhooks**

- Cliente tipado da Unipile; fluxo de hosted auth para conectar cada perfil;
  receptor de webhooks com verificação de origem [verificar mecanismo],
  gravação em `webhooks_recebidos` e processamento idempotente; sincronização do
  status da conta.
- ✅ Aceite: conectar o perfil do Arthur pelo painel; o mesmo webhook entregue 2×
  gera 1 efeito; conta desconectada muda o perfil para pausado com motivo.

### Marco 1 · Paridade com o PRIME SDR (semana 1)

**SDR-04 · Importação e triagem**

- Importar JSON/CSV do actor Apify e resultado de busca da Unipile. Dedupe por
  `provider_id`, bloqueio por opt-out, regra de um dono (4.7), cooldown de empresa.
  Tela de triagem com aprovar/rejeitar em lote e visualização do perfil.
- ✅ Aceite: pessoa com opt-out nunca entra; pessoa de outro perfil aparece
  bloqueada com o motivo; todo registro tem URL, fonte e data.

**SDR-05 · Campanhas, sequência e validador de copy**

- CRUD de campanha com a sequência como configuração (§4.1), templates com
  `{{first_name}}` e `{{company}}`, validador da §4.2 com teste por regra e prévia
  da mensagem renderizada.
- ✅ Aceite: travessão, palavra proibida, URL no T1–T4 e excesso de caracteres
  bloqueiam o salvamento e o envio, com mensagem clara.

**SDR-06 · Despachante**

- Tick de cron, janela por fuso e feriado, rampa por semana desde a ativação,
  teto diário e semanal somado entre campanhas do perfil, jitter, uma ação por
  perfil por tick, revalidação antes do envio, idempotência, reenvio com backoff.
- ✅ Aceite (testes com relógio simulado): nunca excede o teto; nada sai em fim de
  semana, feriado ou fora da janela; nunca dois toques no mesmo dia para a mesma
  pessoa; duas campanhas no mesmo perfil dividem o teto.

**SDR-07 · Reações a eventos**

- Convite aceito → agenda T2 em +2 dias úteis. Mensagem recebida → `em_conversa`
  e cancela as pendentes na mesma transação. Convite com mais de 21 dias →
  ação `retirar_convite` [verificar endpoint].
- ✅ Aceite: teste de corrida em que a resposta chega enquanto o T3 está na fila —
  o T3 não sai.

**SDR-08 · Guardas de conta**

- As regras de parada da §4.4, botão de pausar/despausar, alerta ao dono do perfil
  e ao Arthur, painel de saúde por perfil (aceite em 3 dias, erros, saldo do dia).
- ✅ Aceite: simular aceite de 10% com 25 convites pausa o perfil; despausar exige
  ação humana registrada em `eventos`.

➡️ Saída do M1: perfil do Arthur rodando uma campanha com copy de template,
equivalente ao que o PRIME SDR fazia.

### Marco 2 · Conversa assistida (semana 2)

**SDR-09 · Inbox**

- Conversas por perfil e estado, histórico completo, resposta manual pelo painel,
  indicador de SLA (4 h úteis no fuso do perfil).
- ✅ Aceite: mensagem enviada pelo painel aparece no LinkedIn e no histórico, com
  autor = humano.

**SDR-10 · Agente de conversa**

- Pipeline da §7 (classificação → decisão e rascunho), prompts por perfil
  versionados no repo, saída estruturada, validador aplicado depois da geração,
  opt-out registrado antes de tudo.
- ✅ Aceite: "pare de me mandar mensagem" em PT, EN e ES vira opt-out global; o
  rascunho nunca viola o validador (quando viola, cai na fila marcado).

**SDR-11 · Fila de aprovação**

- Aprovar, editar ou rejeitar com um clique; a edição guarda o texto original e o
  final (é o dado para melhorar o prompt); alerta de SLA estourado.
- ✅ Aceite: no modo `aprovacao` nada da IA sai sem aprovação; taxa de edição por
  perfil visível.

### Marco 3 · Operação da casa (semana 3)

**SDR-12 · RD Station**

- Criação e movimentação de negociação conforme §4.9, só na praça Doméstico,
  idempotente (`rd_deal_id`), reprocessamento em caso de falha.
- ✅ Aceite: lead triado aparece no 01 com todos os campos; convite enviado move
  para o 02 com ângulo; lead do Canadá nunca chega ao RD.

**SDR-13 · Regras por praça**

- Descadastro obrigatório em toda DM do Canadá (validador); modo manual do JP
  gerando `tarefa_manual` com o roteiro de apoio no lugar de T2–T4; pós-T4 por
  praça; idioma por perfil; export CSV da "planilha-espelho" por praça com as
  colunas: empresa · pessoa e cargo · campanha · ângulo · praça · originador · URL ·
  fonte · data da coleta · estado · próximo passo.
- ✅ Aceite: nenhuma DM automática sai do perfil do JP; DM do Luiz sem descadastro
  é bloqueada.

**SDR-14 · Métricas e gate de leitura**

- Funil por perfil × campanha × ângulo: convites, aceite, resposta sobre aceite,
  conversas, qualificados, reuniões. Marco de leitura em 100 toques por
  campanha. Referência de trabalho: aceite 25–35%, resposta sobre aceite 10–15%
  (Espanha 15–25%). A casa ainda não tem linha de base; o sistema cria a primeira.
- ✅ Aceite: números batem com a contagem de `acoes` e `mensagens`; campanha
  mostra "sem amostra" antes de 100 toques.

➡️ Saída do M3: Arthur e Juliano rodando, com RD. Luiz e JP prontos para
ativar assim que T-3/T-4/T-5 caírem.

### Marco 4 · Personalização e automático (semana 4)

**SDR-15 · Pesquisa do prospect e T1 personalizado**

- Com `modo_copy = personalizada`: busca perfil e posts recentes pela Unipile, gera
  ângulos com base nos prompts 3 e 4 da Kakiyo adaptados às regras da casa, e
  escreve o T1 para aprovação. Teste A/B contra o template na mesma campanha.
- ✅ Aceite: T1 personalizado passa no validador; comparação de aceite
  template × personalizado nas métricas.

**SDR-16 · Eval de conversas**

- Dataset e rubrica da §7.1, script que roda o agente contra o dataset e gera um
  relatório; roda no CI quando um prompt muda.
- ✅ Aceite: relatório por critério e por praça; custo por rodada medido e exibido.

**SDR-17 · Modo automático por perfil**

- Liga o `automatico` por perfil só com o gate da §7.1 cumprido; exceções vão para
  a fila; o sistema volta sozinho para `aprovacao` se a taxa de erro subir.
- ✅ Aceite: tentar ligar sem o gate é bloqueado; o rebaixamento automático fica
  registrado.

### Marco 5 · Painel guiado e fluxo livre (decidido em 09/10/2026)

**SDR-18 · Clareza das telas de operação**

- Cada tela diz para que serve e o que cada botão faz depois de clicado, sem
  códigos internos (T-x, §, nomes de estado). Ativação do perfil vira
  checklist com responsável. "Aprovar" na aprovação usa o texto que está na
  caixa. Toque rejeitado aparece para alguém resolver.
- ✅ Aceite: nenhum texto do painel cita §, T-x ou D-x; editar e aprovar envia
  o texto editado; lead com toque rejeitado aparece na aprovação com o motivo.

**SDR-19 · Primeiros passos obrigatórios**

- Página de primeiros passos e bloqueio da §4.10.
- ✅ Aceite: operador sem campanha pronta é redirecionado de qualquer tela fora
  da lista; ao cumprir o passo 6 o bloqueio sai e não volta.

**SDR-20 · Inbox com todas as conversas**

- Importação do histórico de chats da Unipile, webhook gravando conversa fora
  de campanha e inbox com destaque para as de campanha (§4.6).
- ✅ Aceite: conversa fora de campanha aparece e não dispara IA, SLA nem RD;
  perfil da Espanha sem DPA não grava conversa fora de campanha.

**SDR-21 · Fluxo de campanha com blocos**

- Modelo de fluxo em grafo, versionado, com validação da §4.1; o despachante e
  as reações andam pelo grafo; editor visual no painel. O fluxo de 4 toques
  vira o modelo padrão e as campanhas existentes migram para ele.
- ✅ Aceite: as regras da §4 continuam verdes nos testes com o fluxo padrão;
  fluxo com desvio por aceite, esperas e mensagens arbitrárias roda no relógio
  simulado; fluxo inválido não ativa.

## 10 · Decisões abertas

| # | Decisão | Sugestão | Dono |
|---|---|---|---|
| D1 | Link de agenda: sempre o do Juliano (responsável pela discovery) ou o do dono do perfil? | Juliano | Juliano |
| D2 | IA pode sugerir rascunho ao JP ou nem isso? (a posição escrita é "uma a uma, à mão") | pode sugerir; ele escreve | JP, Arthur |
| D3 | Rampa e teto do perfil do Arthur | igual à do Juliano, teto de 75/semana | Arthur |
| D4 | Cooldown de empresa entre perfis | 30 dias | Arthur |
| D5 | Canal de alerta de SLA e de pausa | e-mail no M1, WhatsApp depois | Arthur |
| D6 | Limiar de edição para liberar o automático | < 10% em 2 semanas | Arthur |
| D7 | Quem opera a triagem da lista (40 h por trimestre estimadas nas campanhas) | — | Arthur |

## 11 · Custos de operação

| Item | Custo/mês |
|---|---|
| Unipile | €49 (até 10 contas) |
| Claude API | ~US$ 20–40 por perfil ativo (estimativa: ~30k tokens de entrada e ~3k de saída por lead no Sonnet 5, a US$ 2/10 por milhão) |
| Vercel, Supabase, Resend | planos que a casa já tem [confirmar o limite de cron] |

## 12 · Como rodar este épico no repo novo

1. Criar o repositório e copiar este arquivo para `docs/epico.md`.
2. No `CLAUDE.md` do repo: "Fonte da verdade do produto: `docs/epico.md`. Regras
   de negócio da §4 são requisito. Um ticket por PR, na ordem da §9."
3. Abrir os tickets SDR-01…17 (GitHub Issues ou ClickUp › GuessLess (interno) ›
   Tecnologia, Dados & IA).
4. Resolver T-1 antes do SDR-03, e D3 antes de ativar o perfil do Arthur.
5. Qualquer mudança de regra de negócio atualiza este arquivo primeiro, no
   mesmo PR do código.
