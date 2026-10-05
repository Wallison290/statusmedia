-- ── 087: reserva do Supabase volta para o R2 sozinha ───────────────────────
-- Idempotente. Função: supabase/functions/storage-to-r2.
--
-- Quando o navegador não consegue enviar ao Cloudflare R2, o upload cai na
-- reserva do Supabase Storage (086). De 10 em 10 minutos esta rotina copia
-- esses arquivos para o R2, troca o link e apaga do Supabase, para o plano
-- gratuito (1 GB) não lotar de novo.
DO $$
DECLARE
  v_base text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_cron_base_url');
  v_secret_name text := (SELECT name FROM vault.secrets WHERE name = 'instagram_cron_secret' LIMIT 1);
BEGIN
  IF v_base IS NULL OR v_secret_name IS NULL THEN
    RAISE NOTICE 'URL base ou segredo ausente no Vault — cron NÃO agendado.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('storage-to-r2') FROM cron.job WHERE jobname = 'storage-to-r2';

  PERFORM cron.schedule(
    'storage-to-r2',
    '*/10 * * * *',
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
      v_base || '/functions/v1/storage-to-r2',
      v_secret_name
    )
  );
END $$;
