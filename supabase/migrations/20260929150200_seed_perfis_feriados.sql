-- SDR-02 · Seed dos 4 perfis (§4.3, todos pausados), ângulos (§4.9),
-- feriados das 3 praças e parâmetros globais.
-- Fica em migration, e não em seed.sql, porque produção também precisa dele.
-- Idempotente: on conflict do nothing preserva o que o operador já mudou.

insert into public.perfis (
  slug, nome, praca, fuso, idioma, modo_resposta, rampa, teto_convites_semana,
  palavras_proibidas, rodape_obrigatorio, status, motivo_pausa
) values
  (
    'arthur', 'Arthur', 'domestico', 'America/Sao_Paulo', 'pt', 'aprovacao',
    '[{"semana": 1, "convites_dia": 8, "dms_dia": 15},
      {"semana": 2, "convites_dia": 12, "dms_dia": 20},
      {"semana": 3, "convites_dia": 15, "dms_dia": 25}]',
    75, array['agência', 'marketing', 'growth', 'tráfego'], null,
    'pausado', 'Aguardando ativação: conta na Unipile (T-1) e rampa confirmada (D3)'
  ),
  (
    'juliano', 'Juliano', 'domestico', 'America/Sao_Paulo', 'pt', 'aprovacao',
    '[{"semana": 1, "convites_dia": 8, "dms_dia": 15},
      {"semana": 2, "convites_dia": 12, "dms_dia": 20},
      {"semana": 3, "convites_dia": 15, "dms_dia": 25}]',
    100, array['agência', 'marketing', 'growth', 'tráfego'], null,
    'pausado', 'Aguardando ativação: conta na Unipile (T-1); modo aprovação depende da T-2'
  ),
  (
    -- DMs/dia "proporcional": mesma razão DM/convite do Brasil em cada semana,
    -- arredondada para baixo (6×15/8, 8×20/12, 10×25/15).
    'luiz', 'Luiz', 'canada', 'America/Toronto', 'en', 'aprovacao',
    '[{"semana": 1, "convites_dia": 6, "dms_dia": 11},
      {"semana": 2, "convites_dia": 8, "dms_dia": 13},
      {"semana": 3, "convites_dia": 10, "dms_dia": 16}]',
    50, array['agency', 'marketing', 'growth', 'traffic'], 'or tell me to stop and I will',
    'pausado', 'Aguardando T-1, T-3 e T-5'
  ),
  (
    -- Espanha: DM é manual (§4.5), então o despachante não envia DM nenhuma.
    'jp', 'JP', 'espanha', 'Europe/Madrid', 'es', 'manual',
    '[{"semana": 1, "convites_dia": 4, "dms_dia": 0},
      {"semana": 2, "convites_dia": 5, "dms_dia": 0},
      {"semana": 3, "convites_dia": 6, "dms_dia": 0}]',
    30, array['agencia', 'marketing', 'growth', 'tráfico'], null,
    'pausado', 'Aguardando T-1, T-3, T-4 e T-5'
  )
on conflict (slug) do nothing;

insert into public.angulos (nome, grupo) values
  ('Refém do marketplace', 'servico'),
  ('Margem invisível', 'servico'),
  ('O número não bate', 'servico'),
  ('Cliente que é seu', 'servico'),
  ('ROAS de verdade', 'servico'),
  ('Engenharia, não achismo', 'servico')
on conflict (nome) do nothing;

-- Feriados. Fontes em docs/pesquisa/feriados.md.
-- Brasil: nacionais + Carnaval e Corpus Christi (pontos facultativos com adesão
-- ampla) + 24 e 31/12 (expediente reduzido). Feriados só estaduais ou municipais
-- ficam de fora porque o público é nacional.
insert into public.feriados (praca, data, nome) values
  ('domestico', '2026-01-01', 'Confraternização Universal'),
  ('domestico', '2026-02-16', 'Carnaval'),
  ('domestico', '2026-02-17', 'Carnaval'),
  ('domestico', '2026-04-03', 'Paixão de Cristo'),
  ('domestico', '2026-04-21', 'Tiradentes'),
  ('domestico', '2026-05-01', 'Dia Mundial do Trabalho'),
  ('domestico', '2026-06-04', 'Corpus Christi'),
  ('domestico', '2026-09-07', 'Independência do Brasil'),
  ('domestico', '2026-10-12', 'Nossa Senhora Aparecida'),
  ('domestico', '2026-11-02', 'Finados'),
  ('domestico', '2026-11-15', 'Proclamação da República'),
  ('domestico', '2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  ('domestico', '2026-12-24', 'Véspera de Natal (ponto facultativo)'),
  ('domestico', '2026-12-25', 'Natal'),
  ('domestico', '2026-12-31', 'Véspera de Ano-Novo (ponto facultativo)'),
  ('domestico', '2027-01-01', 'Confraternização Universal'),
  ('domestico', '2027-02-08', 'Carnaval'),
  ('domestico', '2027-02-09', 'Carnaval'),
  ('domestico', '2027-03-26', 'Paixão de Cristo'),
  ('domestico', '2027-04-21', 'Tiradentes'),
  ('domestico', '2027-05-01', 'Dia Mundial do Trabalho'),
  ('domestico', '2027-05-27', 'Corpus Christi'),
  ('domestico', '2027-09-07', 'Independência do Brasil'),
  ('domestico', '2027-10-12', 'Nossa Senhora Aparecida'),
  ('domestico', '2027-11-02', 'Finados'),
  ('domestico', '2027-11-15', 'Proclamação da República'),
  ('domestico', '2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra'),
  ('domestico', '2027-12-24', 'Véspera de Natal (ponto facultativo)'),
  ('domestico', '2027-12-25', 'Natal'),
  ('domestico', '2027-12-31', 'Véspera de Ano-Novo (ponto facultativo)'),
  -- Canadá (Ontário, Toronto): estatutários + Civic Holiday, com dias observados.
  ('canada', '2026-01-01', 'New Year''s Day'),
  ('canada', '2026-02-16', 'Family Day'),
  ('canada', '2026-04-03', 'Good Friday'),
  ('canada', '2026-05-18', 'Victoria Day'),
  ('canada', '2026-07-01', 'Canada Day'),
  ('canada', '2026-08-03', 'Civic Holiday'),
  ('canada', '2026-09-07', 'Labour Day'),
  ('canada', '2026-10-12', 'Thanksgiving Day'),
  ('canada', '2026-12-25', 'Christmas Day'),
  ('canada', '2026-12-28', 'Boxing Day (observado)'),
  ('canada', '2027-01-01', 'New Year''s Day'),
  ('canada', '2027-02-15', 'Family Day'),
  ('canada', '2027-03-26', 'Good Friday'),
  ('canada', '2027-05-24', 'Victoria Day'),
  ('canada', '2027-07-01', 'Canada Day'),
  ('canada', '2027-08-02', 'Civic Holiday'),
  ('canada', '2027-09-06', 'Labour Day'),
  ('canada', '2027-10-11', 'Thanksgiving Day'),
  ('canada', '2027-12-27', 'Christmas Day (observado)'),
  ('canada', '2027-12-28', 'Boxing Day (observado)'),
  -- Espanha (Comunidad de Madrid + cidade de Madri). 2027 ainda sem calendário
  -- oficial: entram só as datas fixas; traslados entram quando o BOCM publicar.
  ('espanha', '2026-01-01', 'Año Nuevo'),
  ('espanha', '2026-01-06', 'Epifanía del Señor'),
  ('espanha', '2026-04-02', 'Jueves Santo'),
  ('espanha', '2026-04-03', 'Viernes Santo'),
  ('espanha', '2026-05-01', 'Fiesta del Trabajo'),
  ('espanha', '2026-05-02', 'Fiesta de la Comunidad de Madrid'),
  ('espanha', '2026-05-15', 'San Isidro Labrador'),
  ('espanha', '2026-08-15', 'Asunción de la Virgen'),
  ('espanha', '2026-10-12', 'Fiesta Nacional de España'),
  ('espanha', '2026-11-02', 'Todos los Santos (traslado)'),
  ('espanha', '2026-11-09', 'Nuestra Señora de la Almudena'),
  ('espanha', '2026-12-07', 'Día de la Constitución (traslado)'),
  ('espanha', '2026-12-08', 'Inmaculada Concepción'),
  ('espanha', '2026-12-25', 'Natividad del Señor'),
  ('espanha', '2027-01-01', 'Año Nuevo'),
  ('espanha', '2027-01-06', 'Epifanía del Señor'),
  ('espanha', '2027-03-25', 'Jueves Santo'),
  ('espanha', '2027-03-26', 'Viernes Santo'),
  ('espanha', '2027-10-12', 'Fiesta Nacional de España'),
  ('espanha', '2027-11-01', 'Todos los Santos'),
  ('espanha', '2027-11-09', 'Nuestra Señora de la Almudena'),
  ('espanha', '2027-12-06', 'Día de la Constitución'),
  ('espanha', '2027-12-08', 'Inmaculada Concepción')
on conflict (praca, data) do nothing;

insert into public.configuracoes (chave, valor, descricao) values
  ('cooldown_empresa_dias', '30',
   'Dias sem outro perfil tocar a mesma empresa (§4.7, decisão D4)'),
  ('sla_horas_uteis', '4',
   'SLA de resposta a quem respondeu, em horas úteis no fuso do perfil (§4.6)'),
  ('convite_expira_dias', '21',
   'Convite pendente há mais dias que isso é retirado (§4.3)'),
  ('pausa_pos_t4_dias', '60',
   'Pausa antes de voltar com ângulo diferente, nas praças com pausa_60_novo_angulo (§4.5)'),
  ('reenvio', '{"max_tentativas": 3, "backoff_minutos": 15}',
   'Erro transitório: nova tentativa com backoff exponencial (§5.1)'),
  ('guardas',
   '{"aceite_minimo": 0.15, "aceite_prazo_dias_uteis": 3, "aceite_amostra_minima": 20,
     "aceite_janela_dias_uteis": 10,
     "queda_brusca": {"ativa": true, "fator": 0.5, "amostra_minima": 20},
     "erros_limite": {"quantidade": 2, "janela_horas": 24}}',
   'Regras de parada automática (§4.4)'),
  ('responsavel_discovery', '"juliano"',
   'Perfil cujo link de agenda vai na proposta de reunião (§4.6, decisão D1)'),
  ('alerta_admin_email', 'null',
   'E-mail do Arthur para os alertas de pausa e SLA (decisão D5)'),
  ('template_exemplo', '{"first_name": "Guilhermina", "company": "Distribuidora Nordeste Alimentos"}',
   'Valores longos usados para checar o teto de caracteres do template antes de salvar'),
  ('leitura_minima_toques', '100',
   'Toques por campanha antes de mostrar taxa (§9 SDR-14)'),
  ('gate_automatico', '{"limiar_edicao": 0.10, "dias_em_aprovacao": 14}',
   'Gate para ligar o modo automático (§7.1, decisão D6)')
on conflict (chave) do nothing;
