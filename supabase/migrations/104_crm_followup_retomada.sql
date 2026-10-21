-- ─────────────────────────────────────────────────────────────────────────────
-- 104 · Retomada do follow-up para leads sem conversa gravada
--
-- O crm-followup só conta o silêncio a partir da última mensagem real gravada
-- em crm_messages. Leads prospectados antes do webhook (ou pelo celular, sem
-- registro) não têm conversa nenhuma e ficavam parados para sempre.
-- followup_resume_at marca "a agência falou por último aqui": quando não há
-- mensagem real depois dessa data, o silêncio conta a partir dela. Se o lead
-- responder depois, vale a conversa normal.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS followup_resume_at timestamptz;

COMMENT ON COLUMN public.crm_leads.followup_resume_at IS
  'Retomada do follow-up: conta como última mensagem da agência quando não há mensagem real gravada depois dela.';
