-- Preferências manuais para a escrita do follow-up e referências por serviço, por agência.
-- A configuração vazia mantém tom do briefing, tamanho curto e cadência atual.
-- O acesso continua protegido pelas policies existentes de crm_settings.
ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS followup_style jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(followup_style) = 'object');

COMMENT ON COLUMN public.crm_settings.followup_style IS
  'Tom, tamanho, encerramento, orientações, restrições e objetivo/exemplo por contato do follow-up. Emojis são sempre proibidos no envio.';
