-- ─────────────────────────────────────────────────────────────────────────────
-- 101 · Contrato enviado também por e-mail
--
-- Ao enviar o contrato para assinatura, a função crm-contract-email manda o
-- link por e-mail (Resend) para o e-mail do lead, com a marca da agência.
-- Aqui só fica registrado quando e para quem saiu o último e-mail, para a tela
-- mostrar e o histórico do lead contar.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.crm_contracts
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_to text;
