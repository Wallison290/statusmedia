-- ─────────────────────────────────────────────────────────────────────────────
-- 099 · Card em etapa de perda encerra o follow-up automático
--
-- Antes, o crm-followup só pulava o lead enquanto ele estava em "perdido": se
-- o card voltasse para outra etapa, as mensagens recomeçavam. Agora, entrar
-- numa etapa de perda (tipo "perdido" ou nome "Sem interesse", "Desqualificado",
-- "Descartado"...) pausa o follow-up de vez (followup_paused), igual ao
-- desinteresse detectado na conversa. Para retomar, a agência religa na ficha.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_crm_lead_lost_stops_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c crm_columns;
BEGIN
  IF NEW.column_id IS NULL OR NEW.followup_paused THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.column_id IS NOT DISTINCT FROM OLD.column_id THEN RETURN NEW; END IF;

  SELECT * INTO c FROM crm_columns WHERE id = NEW.column_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF c.stage_type = 'perdido'
     OR lower(c.name) ~ '(sem\s*interesse|desqualificad|descartad|perdid|desisti)' THEN
    NEW.followup_paused := true;
    -- No INSERT o lead ainda não existe para o histórico apontar
    IF TG_OP = 'UPDATE' THEN PERFORM crm_log(NEW.user_id, NEW.id, 'automacao',
      'Follow-up automático encerrado: lead movido para "' || c.name || '".',
      jsonb_build_object('followup', 'encerrado_por_etapa', 'column_id', c.id)); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_lead_lost_stops_followup ON public.crm_leads;
CREATE TRIGGER crm_lead_lost_stops_followup
  BEFORE INSERT OR UPDATE OF column_id ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_crm_lead_lost_stops_followup();

-- Quem já está numa etapa de perda hoje também fica com o follow-up encerrado
UPDATE public.crm_leads l SET followup_paused = true
FROM public.crm_columns c
WHERE c.id = l.column_id AND NOT l.followup_paused
  AND (c.stage_type = 'perdido' OR lower(c.name) ~ '(sem\s*interesse|desqualificad|descartad|perdid|desisti)');
