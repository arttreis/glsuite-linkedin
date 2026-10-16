# Naming · os módulos do Kakou

16/10/2026 · proposta para decidir (D13 e D11 do épico) · dono: Arthur

O Kakou passa a ser vendido em módulos (§4.14 do épico): o SDR no LinkedIn,
os disparos no WhatsApp, os disparos no Telegram e a base (contatos, tags e
segmentos), que vem em todo plano. Este documento propõe os nomes de venda e
o desenho dos planos. No código nada depende do nome: cada módulo tem um id
fixo (`linkedin`, `whatsapp`, `telegram`) e o nome que aparece na tela fica num
lugar só (`src/domain/modulos.ts`). Trocar o nome é trocar uma linha.

## 1 · De onde partimos

- **A marca é Kakou.** Ela já está no app (sdr.glsuite.io), nos e-mails e no
  primeiro acesso. Os módulos vivem embaixo dela, não ao lado.
- **A família da casa.** Ferramentas do GL Suite: BrandMeUp, SEOme, UTMize,
  LPMaker, GoMarketer, GL Forms, GL Data, GL Content, Dora IA, Atlas IA. Outros
  produtos da GuessLess: MailMe, MeiVende, Votto, Merlin. O padrão é nome curto,
  sonoro, com uma pista do que faz.
- **O painel não usa jargão:** cada tela e botão dizem o que fazem. O menu
  continua "Chats", "Pipeline", "Campanhas", "Contatos", "Disparos". Nome de
  marca de módulo aparece no Plano, na página de preços e no comercial, não no
  menu.

## 2 · Critérios

1. **Diz o que faz** para quem compra (dono de PME, gestor comercial), sem
   explicação.
2. **Fica bem depois de "Kakou"**: "Kakou + nome" soa como uma coisa só.
3. **Sem marca de terceiro no nome.** WhatsApp, Telegram e LinkedIn aparecem
   na descrição ("disparos no WhatsApp"), nunca no nome do produto: as
   diretrizes de marca da Meta e do Telegram não deixam usar a marca deles
   como nome de produto [verificar nas diretrizes de cada um antes de
   publicar a página de preços], e o canal pode mudar.
4. **Curto e fácil de escrever**, sem cedilha nem til, para caber em domínio,
   URL e @.
5. **Funciona na tabela de preço** lado a lado, e no singular ("o Kakou X").

## 3 · Três famílias

### A · Descritiva

| Módulo | Nome | Linha de apoio |
|---|---|---|
| Base | **Kakou Contatos** | seus contatos de todos os canais, com tags e segmentos |
| SDR no LinkedIn | **Kakou SDR** | um SDR de IA que prospecta e conversa no LinkedIn por você |
| Disparos (WhatsApp e Telegram) | **Kakou Disparos** | uma mensagem para um segmento inteiro, pela API oficial do WhatsApp ou pelo seu bot do Telegram |
| Tudo junto | **Kakou Completo** | |

- A favor: zero explicação; o nome de venda é igual ao do menu; quem procura
  "disparo whatsapp api oficial" se reconhece.
- Contra: genérico, não vira marca; "disparos" lembra spam para parte do
  público.

### B · Verbos (na linha do MeiVende)

| Módulo | Nome | Linha de apoio |
|---|---|---|
| Base | **Kakou Organiza** | |
| SDR no LinkedIn | **Kakou Prospecta** | "o Kakou prospecta por você no LinkedIn" |
| Disparos | **Kakou Avisa** | "o Kakou avisa todo mundo de uma vez, no WhatsApp ou no Telegram" |
| Tudo junto | **Kakou Completo** | |

- A favor: diz a ação, soa brasileiro e vira frase de anúncio sozinho ("o Kakou
  prospecta", "o Kakou avisa").
- Contra: "Organiza" é fraco para a base; verbo não vai bem no plural ("os
  Kakou Avisa").

### C · Pescaria (o repositório já se chama Anzol)

| Módulo | Nome | Linha de apoio |
|---|---|---|
| Base | **Cardume** | seus contatos, separados em grupos por tag e segmento |
| SDR no LinkedIn | **Anzol** | um a um, no LinkedIn, com um SDR que conversa como você |
| Disparos | **Tarrafa** | uma mensagem que alcança muita gente de uma vez, no WhatsApp ou no Telegram |
| Tudo junto | **Kakou Pescaria** | |

- A favor: a mais memorável e a única que conta uma história ("Anzol para
  fisgar um a um, Tarrafa para lançar a rede, Cardume para organizar o que você
  pescou"); diferencia de tudo o que existe no mercado de disparo.
- Contra: pede uma frase de explicação na primeira vez; "pescar cliente" pode
  soar predatório para parte do público; não traduz (o GL Suite vende em
  inglês, espanhol e francês).

### Comparação

| Critério | A · Descritiva | B · Verbos | C · Pescaria |
|---|---|---|---|
| Diz o que faz | ✅ | ✅ | ⚠️ com a linha de apoio |
| Bem depois de "Kakou" | ✅ | ✅ | ⚠️ funciona sozinho, sem o Kakou |
| Sem marca de terceiro | ✅ | ✅ | ✅ |
| Curto, sem acento | ✅ | ✅ | ✅ |
| Vira marca, é lembrado | ❌ | ⚠️ | ✅ |
| Traduz | ⚠️ | ❌ | ❌ |

### Recomendação

**A · Descritiva para a tabela de preços e o Plano**, porque módulo é
complemento comprado por quem já entendeu o Kakou: o nome tem de se explicar
sozinho, e o painel já fala assim. **C · Pescaria como narrativa de
marketing**, se o Arthur gostar: "Kakou SDR, o anzol" e "Kakou Disparos, a
tarrafa" na página do produto, sem obrigar o cliente a decorar nomes novos. B
fica como alternativa se a página de vendas for toda em verbos.

Se a escolha for outra, o que muda no código é o `NOME_DO_MODULO` em
`src/domain/modulos.ts`.

## 4 · Planos e preço (sugestão para D11)

O que custa para a GuessLess hoje (§11 do épico):

| Módulo | Custo direto por mês | Cresce com |
|---|---|---|
| SDR no LinkedIn | Unipile ~€5 por conta (€49 até 10) + Claude ~US$ 20 a 40 por conta ativa + menos de US$ 1 por primeiro acesso | contas do LinkedIn vinculadas |
| Disparos no WhatsApp | quase zero: a Meta cobra cada template entregue direto na conta do WhatsApp Business do cliente | conexão e suporte (hoje à mão, D15) |
| Disparos no Telegram | zero: a Bot API é gratuita | — |
| Base | banco e Vercel que a casa já paga | — |

Desenho sugerido:

- **Kakou SDR por conta do LinkedIn vinculada**, porque é o que gera custo
  (Unipile e Claude por conta) e o que dá resultado (convites e conversas por
  conta). Faixa para testar: R$ 497 a R$ 997 por conta por mês.
- **Disparos por mês, sem preço por mensagem.** A Meta cobra a mensagem do
  WhatsApp direto do cliente; se o Kakou cobrar por mensagem, o cliente paga
  duas vezes pela mesma coisa. Faixa para testar: R$ 197 a R$ 397 por mês com
  o WhatsApp, R$ 97 a R$ 197 com o Telegram, os dois canais com desconto.
- **Conexão do WhatsApp como serviço de implantação**, cobrada uma vez,
  enquanto ela for à mão (verificação do negócio na Meta, número, token). Sai
  quando houver o Embedded Signup (D15).
- **Kakou Completo** com desconto em cima da soma.
- **Base sempre incluída** (D12): sem ela, nenhum módulo funciona.

As faixas são hipótese, não pesquisa de preço: valem para a primeira conversa
com clientes. Antes de publicar, comparar com quem vende disparo pela API
oficial no Brasil e com as ferramentas de automação de LinkedIn em reais
[verificar].

## 5 · Antes de publicar um nome

- [verificar] Registro no INPI (classes 9, 35 e 42) dos nomes escolhidos, e se
  "Kakou" já está registrado pela GuessLess.
- [verificar] Domínio e @ nas redes, se o nome do módulo for usado fora do
  app.
- [verificar] Diretrizes de marca da Meta (WhatsApp) e do Telegram para a
  página de preços: como pode aparecer o nome e o logo de cada um.
- Ligar o nome à cobrança: no GL Suite, cada módulo pode virar uma ferramenta
  do catálogo (`tools`), vendida avulsa como as outras (D16).
