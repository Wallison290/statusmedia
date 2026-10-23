-- 105: agenda posts já aprovados quando o Instagram do cliente é conectado
--
-- O trigger auto_schedule_instagram_post (072) só age no momento da aprovação.
-- Se o cliente aprova ANTES de a conta do Instagram estar conectada, o trigger
-- sai sem agendar e o post fica parado como "aprovado" para sempre.
-- Caso real: Ellen Stuker aprovou 2 posts em 21/10 e a conta foi conectada em
-- 22/10 — o post de 23/10 12:00 não saiu.
--
-- Agora, ao conectar (ou reativar) a conta, os posts aprovados, ainda não
-- agendados e com horário no FUTURO entram na fila. Horários já passados
-- ficam de fora de propósito: não publicamos conteúdo atrasado sem alguém decidir.

CREATE OR REPLACE FUNCTION public.schedule_pending_approved_posts(
  p_user_id   uuid,
  p_client_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_ig_account_id uuid;
  v_item          record;
  v_media_urls    text[];
  v_scheduled_at  timestamptz;
  v_count         integer := 0;
BEGIN
  SELECT id INTO v_ig_account_id
  FROM instagram_accounts
  WHERE user_id = p_user_id AND client_id = p_client_id AND is_active = true
  LIMIT 1;

  IF v_ig_account_id IS NULL THEN RETURN 0; END IF;

  FOR v_item IN
    SELECT p.*
    FROM planner p
    WHERE p.user_id = p_user_id
      AND p.client_id = p_client_id
      AND p.ig_scheduled IS NOT TRUE
      AND p.ig_post_type IS NOT NULL
      AND p.scheduled_date IS NOT NULL
      AND lower(trim(coalesce(p.content_type, ''))) NOT IN ('story', 'stories')
      AND (
        CASE WHEN p.art_approval_status IS NOT NULL OR p.copy_approval_status IS NOT NULL
          THEN p.art_approval_status = 'aprovado' AND p.copy_approval_status = 'aprovado'
          ELSE p.approval_status = 'aprovado'
        END
      )
      AND NOT EXISTS (
        SELECT 1 FROM scheduled_posts s
        WHERE s.planner_id = p.id AND s.status IN ('scheduled', 'publishing', 'published')
      )
  LOOP
    v_scheduled_at := (
      (v_item.scheduled_date::date + COALESCE(v_item.scheduled_time::time, '09:00'::time))
      AT TIME ZONE 'America/Sao_Paulo'
    );
    CONTINUE WHEN v_scheduled_at <= now();

    v_media_urls := NULL;
    SELECT ARRAY_AGG(file_url ORDER BY sort_order)
    INTO v_media_urls
    FROM planner_attachments
    WHERE planner_id = v_item.id AND is_ig_media = true;

    IF v_media_urls IS NULL OR array_length(v_media_urls, 1) = 0 THEN
      SELECT ARRAY_AGG(file_url)
      INTO v_media_urls
      FROM planner_attachments
      WHERE planner_id = v_item.id
        AND (file_type LIKE 'image/%' OR file_type LIKE 'video/%');
    END IF;

    CONTINUE WHEN v_media_urls IS NULL OR array_length(v_media_urls, 1) = 0;

    INSERT INTO scheduled_posts (
      user_id, ig_account_id, client_id, planner_id,
      post_type, caption, media_urls, scheduled_at, status
    ) VALUES (
      v_item.user_id, v_ig_account_id, v_item.client_id, v_item.id,
      v_item.ig_post_type, COALESCE(v_item.notes, ''), v_media_urls, v_scheduled_at, 'scheduled'
    );

    UPDATE planner SET ig_scheduled = true, status = 'publicado' WHERE id = v_item.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_on_ig_account_connect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.is_active IS NOT TRUE OR NEW.client_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.is_active IS TRUE
     AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id THEN
    RETURN NEW;
  END IF;

  PERFORM public.schedule_pending_approved_posts(NEW.user_id, NEW.client_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_schedule_on_ig_connect ON public.instagram_accounts;
CREATE TRIGGER trigger_schedule_on_ig_connect
  AFTER INSERT OR UPDATE OF is_active, client_id ON public.instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION public.schedule_on_ig_account_connect();

REVOKE EXECUTE ON FUNCTION public.schedule_pending_approved_posts(uuid, uuid) FROM PUBLIC, anon, authenticated;
