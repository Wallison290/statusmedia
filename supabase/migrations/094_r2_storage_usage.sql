-- ─────────────────────────────────────────────────────────────────────────────
-- 094 · Armazenamento no R2: medição por agência, limite do plano e limpeza
--
-- Quase todo upload vai para o Cloudflare R2 (src/lib/uploadArquivo.ts), mas o
-- medidor antigo (get_user_storage_bytes) só via o Supabase Storage. E nada
-- apagava arquivo do R2: excluir um anexo deixava o arquivo lá para sempre.
--
-- Como fica:
--   • r2_objects: inventário do bucket. A Edge Function r2-storage-sync (cron,
--     a cada 30 min) lista o bucket e grava chave, URL e tamanho real.
--     r2-upload-url também grava na hora do envio (tamanho declarado), para o
--     arquivo contar antes da próxima sincronização.
--   • Uso da agência = arquivos do R2 que ela ainda referencia no banco
--     (r2_file_refs) + envios dela das últimas 24 h ainda não salvos em lugar
--     nenhum + o que restou no Supabase Storage. Excluiu o anexo, o espaço
--     volta na hora.
--   • Órfão = arquivo que nenhuma coluna do banco cita (busca em TODAS as
--     colunas de texto/json/array do schema public, não numa lista fixa).
--     Fica marcado e só é apagado do R2 depois de 7 dias órfão.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.r2_objects (
  key           TEXT        PRIMARY KEY,
  url           TEXT        NOT NULL,
  bytes         BIGINT      NOT NULL DEFAULT 0,
  owner_hint    UUID,                       -- agência que enviou (quando se sabe)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),  -- LastModified no R2
  synced_at     TIMESTAMPTZ,                -- última vez visto na listagem do bucket
  orphan_since  TIMESTAMPTZ                 -- primeira vez visto sem referência
);
CREATE INDEX IF NOT EXISTS r2_objects_url_idx   ON public.r2_objects (url);
CREATE INDEX IF NOT EXISTS r2_objects_owner_idx ON public.r2_objects (owner_hint, created_at);

-- Só funções do servidor mexem aqui
ALTER TABLE public.r2_objects ENABLE ROW LEVEL SECURITY;

-- URL sem query string (?v=...), para comparar
CREATE OR REPLACE FUNCTION public.r2_norm(p_url TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT split_part(p_url, '?', 1) $$;

-- ── 1. Quem referencia cada arquivo (com dono) ──────────────────────────────
-- Colunas onde o app grava links de upload. Para a MEDIÇÃO por agência.
-- (A limpeza de órfãos não depende desta lista: ela varre o schema inteiro.)
CREATE OR REPLACE VIEW public.r2_file_refs AS
  SELECT user_id AS agency_id, public.r2_norm(file_url)       AS url FROM public.planner_attachments WHERE file_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(media_url)          FROM public.content_assets      WHERE media_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(file_url)           FROM public.client_materials    WHERE file_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(file_url)           FROM public.client_documents    WHERE file_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(file_url)           FROM public.report_attachments  WHERE file_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(pdf_url)            FROM public.fin_invoices        WHERE pdf_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(xml_url)            FROM public.fin_invoices        WHERE xml_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(brand_logo_url)     FROM public.crm_settings        WHERE brand_logo_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(logo_url)           FROM public.clients             WHERE logo_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(delivery_url)       FROM public.tasks               WHERE delivery_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(avatar_url)         FROM public.team_members        WHERE avatar_url IS NOT NULL
  UNION ALL SELECT id,      public.r2_norm(avatar_url)         FROM public.profiles            WHERE avatar_url IS NOT NULL
  UNION ALL SELECT user_id, public.r2_norm(u)                  FROM public.scheduled_posts, unnest(media_urls) AS u WHERE media_urls IS NOT NULL
  UNION ALL SELECT f.user_id, public.r2_norm(m[1])             FROM public.feeds f,
              regexp_matches(f.posts::text, '(https?://[^\s"\\,{}\[\]]+)', 'g') AS m WHERE f.posts IS NOT NULL;

REVOKE ALL ON public.r2_file_refs FROM PUBLIC, anon, authenticated;

-- ── 2. Uso por agência ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agency_r2_bytes(p_agency UUID)
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (SELECT DISTINCT url FROM r2_file_refs WHERE agency_id = p_agency)
  SELECT COALESCE(SUM(o.bytes), 0)::BIGINT
  FROM r2_objects o
  WHERE o.url IN (SELECT url FROM mine)
     -- Envio recente que ainda não foi salvo em lugar nenhum (upload em andamento)
     OR (o.owner_hint = p_agency AND o.created_at > now() - interval '1 day'
         AND NOT EXISTS (SELECT 1 FROM r2_file_refs r WHERE r.url = o.url))
$$;

-- Total da agência: R2 + o que ainda está no Supabase Storage
CREATE OR REPLACE FUNCTION public.agency_storage_bytes(p_agency UUID)
RETURNS BIGINT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.agency_r2_bytes(p_agency) + COALESCE(public.get_user_storage_bytes(p_agency), 0)
$$;

-- ── 3. Órfãos ────────────────────────────────────────────────────────────────
-- Todas as URLs do R2 citadas em qualquer coluna de texto/json/array do schema
-- public. Varredura genérica de propósito: um recurso novo que grave links numa
-- coluna nova continua protegido sem ninguém lembrar de atualizar uma lista.
CREATE OR REPLACE FUNCTION public.r2_referenced_urls(p_base TEXT)
RETURNS TABLE (url TEXT) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'r2_objects'
      AND c.data_type IN ('text', 'character varying', 'jsonb', 'json', 'ARRAY')
  LOOP
    RETURN QUERY EXECUTE format(
      'SELECT DISTINCT public.r2_norm(m[1]) FROM public.%I, regexp_matches(%I::text, %L, ''g'') AS m
        WHERE %I::text LIKE %L',
      r.table_name, r.column_name, '(https?://[^\s"\\,{}\[\]]+)', r.column_name, '%' || p_base || '%');
  END LOOP;
END;
$$;

-- Marca/desmarca órfãos e devolve as chaves que podem ser apagadas do R2
-- (órfãs há mais de 7 dias). Arquivo com menos de 24 h nunca é órfão.
CREATE OR REPLACE FUNCTION public.r2_mark_orphans(p_base TEXT)
RETURNS TABLE (key TEXT, url TEXT, bytes BIGINT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _r2_refs (url TEXT PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _r2_refs;
  INSERT INTO _r2_refs SELECT DISTINCT x.url FROM public.r2_referenced_urls(p_base) x ON CONFLICT DO NOTHING;

  UPDATE r2_objects o SET orphan_since = NULL
  WHERE o.orphan_since IS NOT NULL AND EXISTS (SELECT 1 FROM _r2_refs r WHERE r.url = o.url);

  UPDATE r2_objects o SET orphan_since = now()
  WHERE o.orphan_since IS NULL AND o.created_at < now() - interval '1 day'
    AND NOT EXISTS (SELECT 1 FROM _r2_refs r WHERE r.url = o.url);

  RETURN QUERY SELECT o.key, o.url, o.bytes FROM r2_objects o
    WHERE o.orphan_since < now() - interval '7 days';
END;
$$;

-- ── 4. Grants ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.agency_r2_bytes(UUID)     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.agency_storage_bytes(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.r2_referenced_urls(TEXT)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.r2_mark_orphans(TEXT)      FROM PUBLIC, anon, authenticated;

-- ── 5. Rotina: r2-storage-sync a cada 30 min ────────────────────────────────
DO $$
DECLARE
  v_base text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'instagram_cron_base_url');
  v_secret_name text := (SELECT name FROM vault.secrets WHERE name = 'instagram_cron_secret' LIMIT 1);
BEGIN
  IF v_base IS NULL OR v_secret_name IS NULL THEN
    RAISE NOTICE 'URL base ou segredo ausente no Vault — cron NÃO agendado.';
    RETURN;
  END IF;

  PERFORM cron.unschedule('r2-storage-sync') FROM cron.job WHERE jobname = 'r2-storage-sync';
  PERFORM cron.schedule(
    'r2-storage-sync',
    '7,37 * * * *',
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
      v_base || '/functions/v1/r2-storage-sync',
      v_secret_name
    )
  );
END $$;
