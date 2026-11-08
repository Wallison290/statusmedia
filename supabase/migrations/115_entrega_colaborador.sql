-- =============================================
-- 115 — Entrega do colaborador (vídeo, imagem, carrossel)
--
-- A agência diz na demanda o que vai ser entregue (Reels, post ou carrossel).
-- O colaborador, pelo portal (/colaborador/:token), anexa os arquivos ou cola
-- um link; a demanda vai sozinha para "Em revisão" e a agência é avisada.
-- A agência confere e pede ajuste (volta para "Em andamento" com o recado) ou
-- manda para o Planejamento (cria o post com os arquivos; planner_id guarda
-- a ligação).
--
-- tasks.deliveries: [{ id, url, type: 'image'|'video', name, size }] na ordem
-- dos slides. Fica em jsonb: o r2_referenced_urls já varre jsonb, então os
-- arquivos entregues não são tratados como órfãos.
-- =============================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deliverable_type TEXT
    CHECK (deliverable_type IS NULL OR deliverable_type IN ('reels', 'post', 'carrossel')),
  ADD COLUMN IF NOT EXISTS deliveries       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agency_feedback  TEXT,
  ADD COLUMN IF NOT EXISTS planner_id       UUID REFERENCES public.planner(id) ON DELETE SET NULL;

-- ── Leitura do portal: inclui os campos novos e o nome da agência ──────────
CREATE OR REPLACE FUNCTION public.get_collaborator_data(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_member RECORD; v_tasks JSON; v_agency TEXT;
BEGIN
  SELECT id, name, role, color, avatar_url, portal_token, user_id INTO v_member
  FROM team_members WHERE portal_token = p_token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Link inválido'); END IF;

  SELECT COALESCE(NULLIF(p.agency_name, ''), NULLIF(p.full_name, '')) INTO v_agency
  FROM profiles p WHERE p.id = v_member.user_id;

  SELECT json_agg(json_build_object(
    'id', t.id, 'title', t.title, 'description', t.description, 'status', t.status,
    'priority', t.priority, 'due_date', t.due_date, 'due_time', t.due_time,
    'collaborator_note', t.collaborator_note, 'delivery_url', t.delivery_url,
    'task_links', COALESCE(t.task_links, '[]'::jsonb),
    'deliverable_type', t.deliverable_type,
    'deliveries', COALESCE(t.deliveries, '[]'::jsonb),
    'delivered_at', t.delivered_at,
    'agency_feedback', t.agency_feedback,
    'in_planner', t.planner_id IS NOT NULL,
    'created_at', t.created_at, 'updated_at', t.updated_at, 'client_id', t.client_id,
    'clients', CASE WHEN c.id IS NOT NULL THEN json_build_object('id', c.id, 'company_name', c.company_name, 'logo_url', c.logo_url) ELSE NULL END)
    ORDER BY t.due_date ASC NULLS LAST) INTO v_tasks
  FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
  WHERE t.assignee_id = v_member.id;

  RETURN json_build_object(
    'member', json_build_object('id', v_member.id, 'name', v_member.name,
      'role', v_member.role, 'color', v_member.color, 'avatar_url', v_member.avatar_url,
      'portal_token', v_member.portal_token, 'user_id', v_member.user_id),
    'agency_name', v_agency,
    'tasks', COALESCE(v_tasks, '[]'::json));
END; $function$;

-- ── Envio da entrega pelo colaborador ───────────────────────────────────────
-- Grava arquivos + link + observação, põe a demanda em "Em revisão" e avisa a
-- agência. Só aceita arquivos do R2 da própria agência (a chave começa com o
-- id da agência), no máximo 10 (limite do carrossel do Instagram).
CREATE OR REPLACE FUNCTION public.submit_collaborator_delivery(
  p_token        text,
  p_task_id      uuid,
  p_deliveries   jsonb,
  p_delivery_url text DEFAULT NULL,
  p_note         text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member RECORD; v_task RECORD; v_item jsonb; v_url text; v_clean jsonb := '[]'::jsonb;
BEGIN
  SELECT id, name, user_id INTO v_member
  FROM team_members WHERE portal_token = p_token AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Link inválido'); END IF;

  SELECT id, title, client_id, planner_id INTO v_task
  FROM tasks WHERE id = p_task_id AND assignee_id = v_member.id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Demanda não encontrada'); END IF;
  IF v_task.planner_id IS NOT NULL THEN
    RETURN json_build_object('error', 'Esta demanda já foi aprovada e está no planejamento.');
  END IF;

  IF p_deliveries IS NULL OR jsonb_typeof(p_deliveries) <> 'array' THEN p_deliveries := '[]'::jsonb; END IF;
  IF jsonb_array_length(p_deliveries) > 10 THEN
    RETURN json_build_object('error', 'Envie no máximo 10 arquivos.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_deliveries) LOOP
    v_url := v_item->>'url';
    IF v_url IS NULL
       OR v_url !~ ('^https://[^/]+/' || v_member.user_id::text || '/')
       OR (v_item->>'type') NOT IN ('image', 'video') THEN
      RETURN json_build_object('error', 'Arquivo inválido na entrega.');
    END IF;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'id',   COALESCE(v_item->>'id', gen_random_uuid()::text),
      'url',  v_url,
      'type', v_item->>'type',
      'name', left(COALESCE(v_item->>'name', ''), 160),
      'size', CASE WHEN (v_item->>'size') ~ '^\d+$' THEN (v_item->>'size')::bigint ELSE NULL END
    ));
  END LOOP;

  p_delivery_url := NULLIF(btrim(COALESCE(p_delivery_url, '')), '');
  IF p_delivery_url IS NOT NULL AND p_delivery_url !~* '^https?://' THEN
    RETURN json_build_object('error', 'O link precisa começar com https://');
  END IF;
  IF jsonb_array_length(v_clean) = 0 AND p_delivery_url IS NULL THEN
    RETURN json_build_object('error', 'Anexe um arquivo ou cole um link.');
  END IF;

  UPDATE tasks SET
    deliveries        = v_clean,
    delivery_url      = p_delivery_url,
    collaborator_note = NULLIF(btrim(COALESCE(p_note, '')), ''),
    status            = 'revisao',
    delivered_at      = now(),
    updated_at        = now()
  WHERE id = p_task_id;

  INSERT INTO notifications (user_id, client_id, type, title, message, link)
  VALUES (v_member.user_id, v_task.client_id, 'TASK_STATUS_UPDATE',
          'Entrega para conferir',
          v_member.name || ' entregou "' || COALESCE(v_task.title, 'Demanda') || '".',
          p_task_id::text);

  RETURN json_build_object('success', true, 'deliveries', v_clean, 'delivered_at', now());
END; $function$;

REVOKE ALL ON FUNCTION public.submit_collaborator_delivery(text, uuid, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_collaborator_delivery(text, uuid, jsonb, text, text) TO anon, authenticated;

