-- ── 082: CRM — follow-up automático move o card de etapa ───────────────────
-- Depende da 080. Idempotente.
--
-- Para cada degrau (1, 3, 7, 14 dias), a etapa do funil para onde o lead vai
-- quando o follow-up sai: { "1": "<column_id>", ... }. Valor "none" = não mover.
-- Degrau sem escolha: a função procura uma etapa pelo nome ("24h", "03 dias"...).

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS followup_columns jsonb NOT NULL DEFAULT '{}'::jsonb;
