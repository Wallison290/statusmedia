-- ── 109: marcar proposta como aceita pela agência ───────────────────────────
-- Para quando a proposta foi fechada por fora do sistema (conversa, reunião,
-- PDF por e-mail). A agência marca o aceite e segue o mesmo caminho do aceite
-- pelo link: card vai para a etapa de ganho, automações rodam e o botão
-- "Gerar contrato" aparece. Fica registrado que foi a agência quem marcou
-- (response_meta.manual), sem IP do cliente.

CREATE OR REPLACE FUNCTION public.accept_crm_proposal_manual(p_id uuid, p_name text, p_option text DEFAULT NULL)
RETURNS crm_proposals LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  p      crm_proposals;
  v_name text := left(btrim(coalesce(p_name, '')), 150);
  v_opt  jsonb;
BEGIN
  -- SECURITY INVOKER: a política da tabela já limita à agência (dono ou sócio)
  SELECT * INTO p FROM crm_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
  IF p.status IN ('aceita', 'recusada') THEN RAISE EXCEPTION 'Esta proposta já foi respondida.'; END IF;
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'Informe quem aceitou a proposta.'; END IF;

  IF jsonb_array_length(p.options) > 0 THEN
    SELECT x INTO v_opt FROM jsonb_array_elements(p.options) x WHERE x->>'id' = p_option;
    IF v_opt IS NULL THEN RAISE EXCEPTION 'Escolha qual opção o cliente aceitou.'; END IF;
    p.accepted_option := v_opt->>'id';
    p.items           := v_opt->'items';
    p.discount        := (v_opt->>'discount')::numeric;
    p.total           := (v_opt->>'total')::numeric;
  END IF;

  UPDATE crm_proposals
     SET status          = 'aceita',
         accepted_option = p.accepted_option,
         responded_at    = now(),
         responder_name  = v_name,
         reject_reason   = NULL,
         content_hash    = encode(sha256(convert_to(crm_proposal_content(p), 'UTF8')), 'hex'),
         response_meta   = jsonb_build_object('manual', true, 'by', auth.uid(), 'at', now())
   WHERE id = p.id
  RETURNING * INTO p;
  RETURN p;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_crm_proposal_manual(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_crm_proposal_manual(uuid, text, text) TO authenticated;

-- Aviso "Proposta aceita!" só quando foi o cliente; o histórico do lead diz quem marcou
CREATE OR REPLACE FUNCTION public.crm_proposal_after_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_name  text;
  v_total_txt  text := 'R$ ' || to_char(NEW.total, 'FM999G999G990D00');
  v_won_column uuid;
  v_column     uuid;
  v_prop_col   crm_columns;
  v_manual     boolean := coalesce((NEW.response_meta->>'manual')::boolean, false);
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
                                || CASE WHEN v_manual THEN ' · marcada pela agência' ELSE '' END
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
    -- Aceite marcado pela própria agência (fechou por fora): sem aviso para ela mesma
    IF NOT v_manual THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_PROPOSAL_ACCEPTED',
      'Proposta aceita! 🎉',
      coalesce(NEW.responder_name, v_lead_name, 'O cliente') || ' aceitou "' || NEW.title || '" (' || v_total_txt || ').',
      NEW.lead_id);
    END IF;

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
$function$;
