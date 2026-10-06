-- ── 091_cobranca_automatica.sql ───────────────────────────────────────────────
-- Financeiro, Fase 2: cobrança automática sem banco integrado.
--
-- O cliente paga direto na conta da agência (ex.: Itaú, sem API). O sistema
-- manda os lembretes sozinho — antes, no dia e depois do vencimento — pelo
-- WhatsApp da agência e/ou e-mail, com Pix Copia e Cola do valor exato
-- (código estático do Banco Central, gerado a partir da chave Pix; não
-- precisa de API). Quem para as cobranças é a própria agência ao marcar o
-- lançamento como pago: só lançamentos EM ABERTO recebem lembrete.
--
-- Envio: Edge Function fin-billing-reminders, chamada de hora em hora pelo
-- pg_cron; cada agência escolhe o horário (fuso de Brasília).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fin_billing_settings (
  user_id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled           BOOLEAN     NOT NULL DEFAULT false,
  pix_key           TEXT,
  pix_key_type      TEXT        CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  receiver_name     TEXT,       -- favorecido como aparece no banco
  receiver_city     TEXT,
  bank_details      TEXT,       -- texto livre: banco, agência, conta, CNPJ
  channel_whatsapp  BOOLEAN     NOT NULL DEFAULT true,
  channel_email     BOOLEAN     NOT NULL DEFAULT false,
  -- Dias em relação ao vencimento: negativo = antes, 0 = no dia, positivo = depois
  stages            INT[]       NOT NULL DEFAULT '{-3,0,1,3,7}',
  send_hour         INT         NOT NULL DEFAULT 9 CHECK (send_hour BETWEEN 6 AND 21),
  template_before   TEXT,
  template_due      TEXT,
  template_after    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Desligar a cobrança automática de um cliente específico
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auto_billing BOOLEAN NOT NULL DEFAULT true;

-- Pausar a cobrança de uma parcela específica (ex.: acordo combinado)
ALTER TABLE public.fin_entries
  ADD COLUMN IF NOT EXISTS billing_paused BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.fin_billing_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id    UUID        NOT NULL REFERENCES public.fin_entries(id) ON DELETE CASCADE,
  client_id   UUID        REFERENCES public.clients(id) ON DELETE SET NULL,
  stage       INT         NOT NULL,
  channel     TEXT        NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  status      TEXT        NOT NULL CHECK (status IN ('enviado', 'falhou', 'pulado')),
  attempts    INT         NOT NULL DEFAULT 1,
  error       TEXT,
  manual      BOOLEAN     NOT NULL DEFAULT false,   -- "Cobrar agora"
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Um lembrete por parcela, etapa e canal (o automático nunca repete)
CREATE UNIQUE INDEX IF NOT EXISTS fin_billing_log_once
  ON public.fin_billing_log (entry_id, stage, channel) WHERE NOT manual;
CREATE INDEX IF NOT EXISTS fin_billing_log_user_idx ON public.fin_billing_log (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS fin_billing_log_entry_idx ON public.fin_billing_log (entry_id);

ALTER TABLE public.fin_billing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_billing_settings_agency ON public.fin_billing_settings;
CREATE POLICY fin_billing_settings_agency ON public.fin_billing_settings FOR ALL
  USING ((user_id = auth.uid() OR public.is_agency_member(user_id)))
  WITH CHECK ((user_id = auth.uid() OR public.is_agency_member(user_id)));

ALTER TABLE public.fin_billing_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_billing_log_read ON public.fin_billing_log;
CREATE POLICY fin_billing_log_read ON public.fin_billing_log FOR SELECT
  USING ((user_id = auth.uid() OR public.is_agency_member(user_id)));

-- Histórico de alterações também nas configurações de cobrança
DROP TRIGGER IF EXISTS trg_fin_billing_settings_audit ON public.fin_billing_settings;
CREATE OR REPLACE FUNCTION public.trg_fin_billing_settings_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor UUID := auth.uid();
BEGIN
  INSERT INTO fin_audit_log (user_id, table_name, row_id, action, actor_id, actor_name, summary, changes)
  VALUES (NEW.user_id, 'fin_billing_settings', NEW.user_id,
          CASE TG_OP WHEN 'INSERT' THEN 'criou' ELSE 'alterou' END,
          v_actor, CASE WHEN v_actor IS NULL THEN 'Sistema' ELSE public.login_display_name(v_actor) END,
          CASE WHEN NEW.enabled THEN 'Cobrança automática ligada' ELSE 'Cobrança automática desligada' END,
          NULL);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_fin_billing_settings_audit
  AFTER INSERT OR UPDATE ON public.fin_billing_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_billing_settings_audit();

-- ── Rotina de hora em hora (a função decide quem está no horário) ────────────
DO $$
DECLARE
  v_base TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_cron_base_url');
  v_secret_name TEXT := (SELECT name FROM vault.secrets WHERE name = 'instagram_cron_secret' LIMIT 1);
BEGIN
  IF v_base IS NULL OR v_secret_name IS NULL THEN
    RAISE NOTICE 'URL base ou segredo ausente no Vault — rotina de cobrança NÃO agendada.';
    RETURN;
  END IF;
  PERFORM cron.unschedule('fin-billing-reminders') FROM cron.job WHERE jobname = 'fin-billing-reminders';
  PERFORM cron.schedule(
    'fin-billing-reminders',
    '5 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %L)
        ),
        body    := '{"action":"run"}'::jsonb,
        timeout_milliseconds := 300000
      );
      $cron$,
      v_base || '/functions/v1/fin-billing-reminders',
      v_secret_name
    )
  );
END $$;
