# Feriados das praças (seed do SDR-02)

Pesquisa em fontes oficiais, 29/09/2026. As datas estão em
`supabase/migrations/20260929150200_seed_perfis_feriados.sql`. A tabela
`feriados` é configuração: o admin corrige pelo banco sem deploy.

## Critério

O despachante não envia nada em dia que consta em `feriados` para a praça do
perfil (§4.1). O calendário é o do **público** da praça, não o da cidade do
remetente.

- **Brasil (`domestico`)**: feriados nacionais, mais Carnaval (segunda e terça) e
  Corpus Christi, que oficialmente são pontos facultativos mas têm adesão ampla.
  Também 24/12 e 31/12, de expediente reduzido. Feriados só estaduais ou
  municipais (ex.: 09/07 em SP, 25/01 na capital) ficam de fora, porque o
  público é nacional.
- **Canadá (`canada`)**: os 9 estatutários de Ontário mais o Civic Holiday, que
  não é estatutário mas é amplamente folgado. Quando o feriado cai no fim de
  semana, entra o dia observado (ex.: Boxing Day 2026 → 28/12).
- **Espanha (`espanha`)**: calendário oficial da Comunidad de Madrid, com os
  traslados, mais os locais da cidade de Madri (San Isidro e Almudena).

## Fontes

- Brasil 2026: [Portaria MGI nº 11.460/2025, DOU 30/12/2025](https://www.in.gov.br/web/dou/-/portaria-mgi-n-11.460-de-29-de-dezembro-de-2025-678388627);
  20/11 pela [Lei 14.759/2023](https://www2.camara.leg.br/legin/fed/lei/2023/lei-14759-21-dezembro-2023-795091-publicacaooriginal-170568-pl.html).
- Ontário: [Employment Standards Act, public holidays](https://www.ontario.ca/document/your-guide-employment-standards-act-0/public-holidays)
  e [City of Toronto, statutory holidays](https://www.toronto.ca/home/contact-us/statutory-holidays/).
- Madri 2026: [Decreto 75/2025, BOCM nº 229](https://www.bocm.es/boletin/CM_Orden_BOCM/2025/09/25/BOCM-20250925-16.PDF)
  (conferido no [BOE-A-2025-21667](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-21667))
  e [calendário da cidade de Madri](https://www.madrid.es/).

## Pendências [verificar]

- **Brasil 2027**: datas calculadas pela lei (Páscoa em 28/03/2027). A portaria
  federal de 2027 sai em dezembro de 2026.
- **Ontário 2027**: os dias observados de Natal (27/12) e Boxing Day (28/12)
  seguem a regra usual. A City of Toronto só publicou até 01/01/2027.
- **Madri 2027**: a Comunidad não publicou. Entraram só as datas fixas.
  02/05 e 15/08 caem num domingo e podem ganhar traslado: incluir quando o BOCM
  publicar (esperado para outubro de 2026). San Isidro 2027 cai num sábado.
