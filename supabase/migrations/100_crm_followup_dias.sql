-- ─────────────────────────────────────────────────────────────────────────────
-- 100 · Dias do follow-up escolhidos pela agência
--
-- Antes a sequência era fixa em 1, 3, 7 e 14 dias de silêncio. Agora cada
-- agência escolhe os dias, igual à cobrança automática do financeiro. O padrão
-- continua 1, 3, 7 e 14: quem já usa não percebe diferença.
-- De 1 a 6 contatos, cada um entre 1 e 60 dias. A ordem e a duplicidade são
-- normalizadas na função crm-followup e na tela.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS followup_steps integer[] NOT NULL DEFAULT '{1,3,7,14}';

ALTER TABLE public.crm_settings DROP CONSTRAINT IF EXISTS crm_settings_followup_steps_check;
ALTER TABLE public.crm_settings ADD CONSTRAINT crm_settings_followup_steps_check
  CHECK (
    cardinality(followup_steps) BETWEEN 1 AND 6
    AND 1 <= ALL (followup_steps)
    AND 60 >= ALL (followup_steps)
  );

COMMENT ON COLUMN public.crm_settings.followup_steps IS
  'Dias de silêncio em que sai cada contato do follow-up automático (1 a 6 contatos, de 1 a 60 dias).';
