-- ─────────────────────────────────────────────────────────────────────────────
-- 098 · Proposta enviada move o card do lead para a etapa de proposta
--
-- Ao enviar (status → 'enviada'), o card vai para a primeira etapa comum cujo
-- nome contém "proposta" ("Proposta", "Proposta enviada"...). Só anda para
-- frente e nunca tira o lead de ganho/perdido. Sem etapa assim, fica onde está.
-- O resto da função é o da migration 074.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_proposal_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_name  text;
  v_total_txt  text := 'R$ ' || to_char(NEW.total, 'FM999G999G990D00');
  v_won_column uuid;
  v_column     uuid;
  v_prop_col   crm_columns;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT name, column_id INTO v_lead_name, v_column FROM crm_leads WHERE id = NEW.lead_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      PERFORM crm_log(NEW.user_id, NEW.lead_id, 'proposta',
        'Proposta criada: "' || NEW.title || '" (' || v_total_txt || ')',
        jsonb_build_object('proposal_id', NEW.id, 'status', NEW.status));
    END IF;
    IF NEW.status <> 'enviada' THEN RETURN NEW; END IF;
  ELSIF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL AND TG_OP = 'UPDATE' THEN
    PERFORM crm_log(NEW.user_id, NEW.lead_id, 'proposta',
      CASE NEW.status
        WHEN 'enviada'     THEN 'Proposta enviada: "' || NEW.title || '"'
        WHEN 'visualizada' THEN 'O cliente abriu a proposta "' || NEW.title || '"'
        WHEN 'aceita'      THEN 'Proposta aceita por ' || coalesce(NEW.responder_name, 'cliente') || ' (' || v_total_txt || ')'
        WHEN 'recusada'    THEN 'Proposta recusada' || coalesce(': ' || NEW.reject_reason, '')
        ELSE 'Proposta voltou para rascunho'
      END,
      jsonb_build_object('proposal_id', NEW.id, 'status', NEW.status));
  END IF;

  IF NEW.status = 'enviada' THEN
    -- Card do lead para a etapa de proposta (só para frente)
    IF NEW.lead_id IS NOT NULL THEN
      SELECT c.* INTO v_prop_col FROM crm_columns c
      WHERE c.user_id = NEW.user_id AND c.stage_type = 'normal' AND c.name ILIKE '%proposta%'
      ORDER BY c.position LIMIT 1;

      IF v_prop_col.id IS NOT NULL THEN
        UPDATE crm_leads l SET column_id = v_prop_col.id, position = 0
        WHERE l.id = NEW.lead_id
          AND l.column_id IS DISTINCT FROM v_prop_col.id
          AND NOT EXISTS (
            SELECT 1 FROM crm_columns cur
            WHERE cur.id = l.column_id
              AND (cur.stage_type IN ('ganho', 'perdido') OR cur.position >= v_prop_col.position));
      END IF;
    END IF;

  ELSIF NEW.status = 'visualizada' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_PROPOSAL_VIEWED',
      'Proposta aberta agora',
      coalesce(v_lead_name, 'O cliente') || ' está vendo a proposta "' || NEW.title || '". Bom momento para um contato.',
      NEW.lead_id);
    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'proposta_visualizada', v_column, 'prop:' || NEW.id);

  ELSIF NEW.status = 'aceita' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_PROPOSAL_ACCEPTED',
      'Proposta aceita! 🎉',
      coalesce(NEW.responder_name, v_lead_name, 'O cliente') || ' aceitou "' || NEW.title || '" (' || v_total_txt || ').',
      NEW.lead_id);

    -- O card anda sozinho para a primeira etapa de ganho e passa a valer o
    -- total aceito. Se o lead já estiver numa etapa de ganho, fica onde está.
    IF NEW.lead_id IS NOT NULL THEN
      SELECT c.id INTO v_won_column
      FROM crm_columns c
      WHERE c.user_id = NEW.user_id AND c.stage_type = 'ganho'
      ORDER BY c.position
      LIMIT 1;

      UPDATE crm_leads l
         SET estimated_value = NEW.total,
             column_id = CASE
               WHEN v_won_column IS NULL THEN l.column_id
               WHEN EXISTS (SELECT 1 FROM crm_columns c WHERE c.id = l.column_id AND c.stage_type = 'ganho') THEN l.column_id
               ELSE v_won_column
             END,
             position = CASE WHEN v_won_column IS NULL THEN l.position ELSE 0 END
       WHERE l.id = NEW.lead_id;
    END IF;

    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'proposta_aceita', v_column, 'prop:' || NEW.id);

  ELSIF NEW.status = 'recusada' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_PROPOSAL_REJECTED',
      'Proposta recusada',
      coalesce(v_lead_name, 'O cliente') || ' recusou "' || NEW.title || '"'
        || coalesce('. Motivo: ' || NEW.reject_reason, '.'),
      NEW.lead_id);
    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'proposta_recusada', v_column, 'prop:' || NEW.id);
  END IF;

  RETURN NEW;
END;
$$;
