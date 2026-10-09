-- ─────────────────────────────────────────────────────────────────────────────
-- 093 · Planos 2026 (Starter R$97 · Pro R$197 · Agency R$297)
--
-- Fonte única dos limites no banco: plan_limit(plano, chave). As Edge Functions
-- e os triggers leem daqui; o front espelha os mesmos números em
-- src/config/plans.ts (mantenha os dois iguais).
--
-- Os "créditos de IA" genéricos acabaram. Cada uso de IA tem a sua cota:
--   ai_messages  → mensagens escritas pela IA no CRM (follow-up automático e
--                  "Sugerir com IA" na ficha do lead)
--   ai_reports   → análises de relatório com IA
--   ai_assistant → assistente do CRM (no app e no WhatsApp)
-- A saudação do Dashboard não consome cota.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Limites por plano ─────────────────────────────────────────────────────
-- -1 = ilimitado · 0 = não incluso · 1 = incluso (para recursos liga/desliga)
CREATE OR REPLACE FUNCTION public.plan_limit(p_plan TEXT, p_key TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'clients'      THEN CASE p_plan WHEN 'starter' THEN 5   WHEN 'pro' THEN 15  WHEN 'agency' THEN 40   END
    WHEN 'team'         THEN CASE p_plan WHEN 'starter' THEN 1   WHEN 'pro' THEN 3   WHEN 'agency' THEN -1   END
    WHEN 'instagram'    THEN CASE p_plan WHEN 'starter' THEN 1   WHEN 'pro' THEN 10  WHEN 'agency' THEN 40   END
    WHEN 'storage_gb'   THEN CASE p_plan WHEN 'starter' THEN 10  WHEN 'pro' THEN 50  WHEN 'agency' THEN 150  END
    WHEN 'ai_messages'  THEN CASE p_plan WHEN 'starter' THEN 0   WHEN 'pro' THEN 300 WHEN 'agency' THEN 1500 END
    WHEN 'ai_reports'   THEN CASE p_plan WHEN 'starter' THEN 0   WHEN 'pro' THEN 30  WHEN 'agency' THEN 150  END
    WHEN 'ai_assistant' THEN CASE p_plan WHEN 'starter' THEN 0   WHEN 'pro' THEN 0   WHEN 'agency' THEN 1000 END
    WHEN 'reports'      THEN CASE p_plan WHEN 'starter' THEN 0   ELSE 1 END
    WHEN 'crm_full'     THEN CASE p_plan WHEN 'starter' THEN 0   ELSE 1 END  -- propostas, contratos, automações
    WHEN 'auto_billing' THEN CASE p_plan WHEN 'starter' THEN 0   ELSE 1 END  -- cobrança automática + nota fiscal
    WHEN 'partners'     THEN CASE p_plan WHEN 'agency'  THEN 1   ELSE 0 END
  END
$$;

-- Plano em vigor da agência (NULL = sem assinatura ativa ou trial vencido)
CREATE OR REPLACE FUNCTION public.agency_active_plan(p_agency UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT plan FROM subscriptions
  WHERE user_id = p_agency
    AND (status = 'active' OR (status = 'trialing' AND trial_ends_at > now()))
$$;

-- Atalho para Edge Functions e para o front: limite da agência numa chave
CREATE OR REPLACE FUNCTION public.agency_limit(p_agency UUID, p_key TEXT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.plan_limit(public.agency_active_plan(p_agency), p_key), 0)
$$;

-- ── 2. Cotas de IA separadas ─────────────────────────────────────────────────
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS ai_messages  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_reports   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_assistant INT NOT NULL DEFAULT 0;

-- Sócios leem o uso da agência (mesma regra das outras tabelas da agência)
DROP POLICY IF EXISTS "ai_usage_read_own" ON public.ai_usage;
DROP POLICY IF EXISTS ai_usage_read_agency ON public.ai_usage;
CREATE POLICY ai_usage_read_agency ON public.ai_usage
  FOR SELECT USING (user_id = auth.uid() OR public.is_agency_member(user_id));

-- Consome 1 da cota, de forma atômica (duas chamadas ao mesmo tempo não
-- passam do limite). Retorna {allowed, used, limit, plan, reason}.
CREATE OR REPLACE FUNCTION public.ai_consume(p_agency UUID, p_kind TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan  TEXT := public.agency_active_plan(p_agency);
  v_limit INT;
  v_month TEXT := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM');
  v_used  INT;
BEGIN
  IF p_kind NOT IN ('ai_messages', 'ai_reports', 'ai_assistant') THEN
    RAISE EXCEPTION 'Tipo de cota inválido: %', p_kind;
  END IF;
  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_inactive', 'used', 0, 'limit', 0);
  END IF;

  v_limit := COALESCE(public.plan_limit(v_plan, p_kind), 0);
  IF v_limit = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_in_plan', 'used', 0, 'limit', 0, 'plan', v_plan);
  END IF;

  INSERT INTO ai_usage (user_id, month) VALUES (p_agency, v_month)
  ON CONFLICT (user_id, month) DO NOTHING;

  EXECUTE format(
    'UPDATE ai_usage SET %1$I = %1$I + 1, updated_at = now()
      WHERE user_id = $1 AND month = $2 AND ($3 = -1 OR %1$I < $3)
      RETURNING %1$I', p_kind)
  INTO v_used USING p_agency, v_month, v_limit;

  IF v_used IS NULL THEN
    EXECUTE format('SELECT %I FROM ai_usage WHERE user_id = $1 AND month = $2', p_kind)
    INTO v_used USING p_agency, v_month;
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'used', v_used, 'limit', v_limit, 'plan', v_plan);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', v_limit, 'plan', v_plan);
END;
$$;

-- ── 3. Limite de clientes (5 / 15 / 40) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_client_plan_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan  TEXT;
  v_count INT;
  v_limit INT;
BEGIN
  v_plan := public.agency_active_plan(NEW.user_id);
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Assinatura inativa. Assine ou reative um plano para adicionar clientes.';
  END IF;

  v_limit := public.plan_limit(v_plan, 'clients');
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'Plano desconhecido (%). Entre em contato com o suporte.', v_plan;
  END IF;
  IF v_limit = -1 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM clients
  WHERE user_id = NEW.user_id AND status NOT IN ('inactive', 'cancelado');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de % clientes do seu plano atingido. Faça upgrade para adicionar mais.', v_limit;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Limite de equipe (1 / 3 / ilimitado) ─────────────────────────────────
-- Só colaboradores contam; dono e sócios (kind owner/partner, migration 089)
-- são criados pelo próprio banco e ficam fora do limite.
CREATE OR REPLACE FUNCTION public.check_team_plan_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  IF NEW.kind <> 'collaborator' OR NOT NEW.is_active THEN RETURN NEW; END IF;
  -- Reativação ou edição de quem já estava ativo não conta de novo
  IF TG_OP = 'UPDATE' AND OLD.is_active AND OLD.kind = 'collaborator' THEN RETURN NEW; END IF;

  v_limit := public.agency_limit(NEW.user_id, 'team');
  IF v_limit = -1 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM team_members
  WHERE user_id = NEW.user_id AND kind = 'collaborator' AND is_active AND id <> NEW.id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de % membro(s) de equipe do seu plano atingido. Faça upgrade para adicionar mais.', GREATEST(v_limit, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_team_plan_limit ON public.team_members;
CREATE TRIGGER enforce_team_plan_limit
  BEFORE INSERT OR UPDATE OF is_active, kind ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.check_team_plan_limit();

-- ── 5. Grants ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.ai_consume(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.plan_limit(TEXT, TEXT)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.agency_limit(UUID, TEXT) TO authenticated;
