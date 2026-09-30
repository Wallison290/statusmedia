-- ── 080: CRM — conversas do WhatsApp e follow-up automático ─────────────────
-- Depende da 073, 075 e 076. Idempotente.
--
-- Conversas: toda mensagem trocada entre o WhatsApp conectado da agência e um
-- lead fica em `crm_messages` (o webhook grava o que chega e o que a agência
-- digita no celular; o sistema grava o que ele mesmo envia).
--
-- Follow-up: a agência cadastra o briefing do que está vendendo (`crm_offers`)
-- e liga a automação. De hora em hora a função crm-followup olha cada lead:
--   • só age quando a ÚLTIMA mensagem real da conversa foi da agência (o lead
--     parou de responder). Follow-up automático não conta como interação;
--   • degraus de 1, 3, 7 e 14 dias de silêncio, cada um usado UMA vez por lead
--     (`followup_done`). O lead voltou a falar e sumiu de novo: espera o
--     próximo degrau que ainda não foi usado;
--   • a IA escreve a mensagem na hora, com o briefing e a conversa real;
--   • depois do de 14 dias, o lead vai para a etapa de perdido.

-- ── 1. Briefings do que a agência vende ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_offers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  product     text,       -- o que vende
  audience    text,       -- para quem
  problem     text,       -- a necessidade/dor que ataca
  solution    text,       -- o que resolve na vida do negócio
  price       text,
  proof       text,       -- casos e resultados reais (a IA não inventa nenhum)
  tips        text,       -- dicas úteis que dá para oferecer sem vender
  tone        text,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_offers_user_idx ON public.crm_offers (user_id);

ALTER TABLE public.crm_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency manages own crm offers" ON public.crm_offers;
CREATE POLICY "Agency manages own crm offers"
  ON public.crm_offers FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. Conversas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_messages (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id       uuid        NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  direction     text        NOT NULL CHECK (direction IN ('in', 'out')),
  text          text        NOT NULL,
  -- whatsapp: trocada no aparelho/webhook; sistema: enviada pelo CRM;
  -- followup: enviada pela automação (não conta como interação)
  source        text        NOT NULL DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'sistema', 'followup')),
  followup_step integer,
  wa_id         text,       -- id da mensagem no WhatsApp: webhook repetido não duplica
  sent_at       timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_messages_lead_idx ON public.crm_messages (lead_id, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS crm_messages_wa_id_uq ON public.crm_messages (user_id, wa_id) WHERE wa_id IS NOT NULL;

ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;

-- A agência só lê. Quem grava é o servidor (webhook, envio e follow-up).
DROP POLICY IF EXISTS "Agency reads own crm messages" ON public.crm_messages;
CREATE POLICY "Agency reads own crm messages"
  ON public.crm_messages FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.crm_messages FROM anon, authenticated;

-- ── 3. Estado do follow-up ────────────────────────────────────────────────────
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS followup_paused   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_offer_id uuid        REFERENCES public.crm_offers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_done     integer[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS followup_last_at  timestamptz;

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS followup_enabled boolean NOT NULL DEFAULT false;

-- Reserva o degrau antes de enviar: duas varreduras ao mesmo tempo não mandam
-- o mesmo follow-up duas vezes. Só a service role chama.
CREATE OR REPLACE FUNCTION public.crm_followup_claim(p_lead uuid, p_step integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE crm_leads
       SET followup_done = array_append(followup_done, p_step),
           followup_last_at = now()
     WHERE id = p_lead AND NOT (p_step = ANY (followup_done))
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$$;

-- Envio falhou: devolve o degrau para a próxima varredura tentar de novo
CREATE OR REPLACE FUNCTION public.crm_followup_release(p_lead uuid, p_step integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE crm_leads SET followup_done = array_remove(followup_done, p_step) WHERE id = p_lead;
$$;

REVOKE ALL ON FUNCTION public.crm_followup_claim(uuid, integer)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_followup_release(uuid, integer) FROM PUBLIC, anon, authenticated;

-- ── 4. Varredura de hora em hora ──────────────────────────────────────────────
-- Mesmo esquema da 071: URL base e segredo saem do Vault. A função confere o
-- horário (8h às 20h, segunda a sábado, horário de Brasília) e sai se estiver fora.
DO $$
DECLARE
  v_base text := coalesce(
    current_setting('app.settings.supabase_url', true),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_cron_base_url')
  );
  v_secret_name text := (SELECT name FROM vault.secrets WHERE name = 'instagram_cron_secret' LIMIT 1);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_cron/pg_net indisponíveis — cron NÃO agendado.';
    RETURN;
  END IF;
  IF v_base IS NULL OR v_secret_name IS NULL THEN
    RAISE NOTICE 'URL base ou segredo ausente no Vault — cron NÃO agendado.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('crm-followup') FROM cron.job WHERE jobname = 'crm-followup';

  PERFORM cron.schedule(
    'crm-followup',
    '7 * * * *',
    format(
      $cron$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %L)
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 300000
      );
      $cron$,
      v_base || '/functions/v1/crm-followup',
      v_secret_name
    )
  );
END $$;
