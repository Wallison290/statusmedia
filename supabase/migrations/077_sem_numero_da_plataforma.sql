-- ── 077: fim do número da plataforma ─────────────────────────────────────────
-- Todo WhatsApp da StatusMedia agora sai pelo número conectado de cada agência
-- (supabase/functions/_shared/whatsapp.ts). O número único da plataforma deixou
-- de enviar qualquer coisa.
--
-- 1. O vigia da instância da plataforma (whatsapp-health, migration 071) não
--    tem mais o que vigiar: o cron sai. Quem avisa agora é o próprio app, com
--    um banner para a agência cujo número está desconectado.
-- 2. Cada instância de agência ganha a marca de "webhook configurado": é por
--    ele que o assistente "CRM ..." recebe as mensagens daquele número.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('whatsapp-health')
    FROM cron.job WHERE jobname = 'whatsapp-health';
  END IF;
END $$;

ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS webhook_set boolean NOT NULL DEFAULT false;
