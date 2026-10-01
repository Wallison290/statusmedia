-- ── 081: CRM — etiqueta do WhatsApp Business no primeiro contato ────────────
-- Depende da 080. Idempotente.
--
-- Mensagem enviada pelo CRM com o lead na primeira etapa do funil: a conversa
-- ganha no WhatsApp Business da agência a etiqueta escolhida aqui (ex.:
-- "Primeiro contato"). Guarda o id da etiqueta na UazAPI e o nome, para a tela.
-- Só adiciona: as etiquetas que a conversa já tinha continuam.

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS wa_first_contact_label      text,
  ADD COLUMN IF NOT EXISTS wa_first_contact_label_name text;
