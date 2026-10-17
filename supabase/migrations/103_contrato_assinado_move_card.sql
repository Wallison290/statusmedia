-- ─────────────────────────────────────────────────────────────────────────────
-- 103 · Contrato assinado leva o card para a etapa de ganho
--
-- Igual à proposta aceita (migration 098): assinado o contrato, o card do lead
-- anda sozinho para a primeira etapa de ganho do funil. A troca de etapa passa
-- pelos gatilhos de crm_leads, então fechamento (closed_at), histórico
-- ("ganho"), automações de etapa e as métricas do dashboard saem certos.
--   • lead já numa etapa de ganho: fica onde está;
--   • contrato ligado a uma proposta: o card passa a valer o total dela.
-- Contratos assinados antes desta migration são acertados no fim, com a data
-- de fechamento igual à da assinatura.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.crm_contract_after_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_name  text;
  v_column     uuid;
  v_won_column uuid;
  v_total      numeric;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT name, column_id INTO v_lead_name, v_column FROM crm_leads WHERE id = NEW.lead_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      PERFORM crm_log(NEW.user_id, NEW.lead_id, 'contrato',
        'Contrato criado: "' || NEW.title || '"',
        jsonb_build_object('contract_id', NEW.id, 'status', NEW.status));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    PERFORM crm_log(NEW.user_id, NEW.lead_id, 'contrato',
      CASE NEW.status
        WHEN 'enviado'   THEN 'Contrato enviado para assinatura: "' || NEW.title || '"'
        WHEN 'assinado'  THEN 'Contrato assinado por ' || coalesce(NEW.signer_name, 'cliente')
        WHEN 'cancelado' THEN 'Contrato cancelado: "' || NEW.title || '"'
        ELSE 'Contrato voltou para rascunho'
      END,
      jsonb_build_object('contract_id', NEW.id, 'status', NEW.status));
  END IF;

  IF NEW.status = 'assinado' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_CONTRACT_SIGNED',
      'Contrato assinado! ✍️',
      coalesce(NEW.signer_name, v_lead_name, 'O cliente') || ' assinou "' || NEW.title || '".',
      NEW.lead_id);

    -- Card para a primeira etapa de ganho (se ainda não estiver numa)
    IF NEW.lead_id IS NOT NULL THEN
      SELECT c.id INTO v_won_column
        FROM crm_columns c
       WHERE c.user_id = NEW.user_id AND c.stage_type = 'ganho'
       ORDER BY c.position
       LIMIT 1;

      IF NEW.proposal_id IS NOT NULL THEN
        SELECT p.total INTO v_total FROM crm_proposals p WHERE p.id = NEW.proposal_id;
      END IF;

      UPDATE crm_leads l
         SET estimated_value = coalesce(nullif(v_total, 0), l.estimated_value),
             column_id = v_won_column,
             position  = 0
       WHERE l.id = NEW.lead_id
         AND v_won_column IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM crm_columns c WHERE c.id = l.column_id AND c.stage_type = 'ganho');
    END IF;

    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'contrato_assinado', v_column, 'contr:' || NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- ── Acerto dos contratos já assinados ────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (k.lead_id)
           k.lead_id, k.signed_at,
           (SELECT c.id FROM crm_columns c
             WHERE c.user_id = k.user_id AND c.stage_type = 'ganho'
             ORDER BY c.position LIMIT 1) AS won_column,
           (SELECT p.total FROM crm_proposals p WHERE p.id = k.proposal_id) AS total
      FROM crm_contracts k
      JOIN crm_leads l ON l.id = k.lead_id
     WHERE k.status = 'assinado'
       AND l.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM crm_columns c WHERE c.id = l.column_id AND c.stage_type = 'ganho')
     ORDER BY k.lead_id, k.signed_at DESC
  LOOP
    CONTINUE WHEN r.won_column IS NULL;
    UPDATE crm_leads
       SET column_id = r.won_column, position = 0,
           estimated_value = coalesce(nullif(r.total, 0), estimated_value)
     WHERE id = r.lead_id;
    -- O gatilho marcou o fechamento como agora; vale a data da assinatura
    UPDATE crm_leads SET closed_at = coalesce(r.signed_at, closed_at) WHERE id = r.lead_id;
  END LOOP;
END;
$$;
