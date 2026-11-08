-- 116 — Entrega já aprovada (status concluido) não pode ser reenviada pelo portal.
-- A agência aprova pela Equipe ("Só aprovar" ou "Aprovar e mandar para o Planejamento")
-- e o colaborador é avisado no WhatsApp pelo front (send-whatsapp).

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

  SELECT id, title, client_id, planner_id, status INTO v_task
  FROM tasks WHERE id = p_task_id AND assignee_id = v_member.id;
  IF NOT FOUND THEN RETURN json_build_object('error', 'Demanda não encontrada'); END IF;
  IF v_task.planner_id IS NOT NULL THEN
    RETURN json_build_object('error', 'Esta demanda já foi aprovada e está no planejamento.');
  END IF;
  IF v_task.status = 'concluido' THEN
    RETURN json_build_object('error', 'Esta entrega já foi aprovada pela agência.');
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

