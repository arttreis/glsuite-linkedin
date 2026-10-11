-- Saem as regras por praça (SDR-53, §3 do épico de 10/10/2026): o rodapé do
-- Canadá, a tarefa manual e a trava de DPA da Espanha, e a praça no público.
-- Fuso e feriados ficam no perfil: `perfis.praca` continua como a chave do
-- calendário de feriados. As colunas antigas (`perfis.rodape_obrigatorio`,
-- `publicos.praca`) ficam no banco, sem uso, porque migrations anteriores ainda
-- as citam e a reaplicação delas tem de continuar idempotente. Idempotente.

delete from public.configuracoes where chave = 'travas';
