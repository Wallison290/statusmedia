-- 113 · Assinatura: vencimento, aviso antes de vencer e carência
--
-- Regra: a assinatura vale até `paid_until` (pago até). Nos `reminder_days`
-- antes disso o sistema avisa que vai vencer; depois do vencimento a agência
-- ainda tem `grace_days` de carência; passado isso o acesso para até o
-- pagamento ser confirmado (o webhook da Stripe avança `paid_until`).
--
-- Os dias ficam em billing_settings (uma linha só) para mudar sem deploy.

-- ── Variáveis da regra ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  reminder_days INT NOT NULL DEFAULT 5 CHECK (reminder_days BETWEEN 0 AND 60),
  grace_days    INT NOT NULL DEFAULT 5 CHECK (grace_days BETWEEN 0 AND 60),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.billing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_read ON public.billing_settings
  FOR SELECT TO authenticated USING (true);

-- ── Assinatura: pago até + cortesia ─────────────────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paid_until     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscriptions.paid_until IS
  'Até quando a assinatura está paga. Só avança com pagamento confirmado (webhook da Stripe ou ajuste manual). NULL = sem vencimento.';
COMMENT ON COLUMN public.subscriptions.billing_exempt IS
  'Cortesia: nunca vence nem bloqueia.';

UPDATE public.subscriptions SET paid_until = current_period_end
WHERE paid_until IS NULL AND current_period_end IS NOT NULL;

-- ── Histórico de pagamentos da assinatura (preenchido pelo webhook) ─────────
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_invoice_id  TEXT UNIQUE,
  plan               TEXT,
  amount_cents       INT NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'brl',
  paid_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start       TIMESTAMPTZ,
  period_end         TIMESTAMPTZ,
  invoice_url        TEXT,
  invoice_pdf        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_payments_user_idx
  ON public.subscription_payments (user_id, paid_at DESC);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscription_payments_read ON public.subscription_payments;
CREATE POLICY subscription_payments_read ON public.subscription_payments
  FOR SELECT TO authenticated USING (public.is_agency_member(user_id));

-- ── Situação da assinatura ──────────────────────────────────────────────────
-- state: cortesia | teste | em_dia | vence_em_breve | carencia | bloqueado | inativo
-- Interna (sem checagem de quem chama): usada pelos limites do plano, que
-- também rodam para membros da equipe e para as Edge Functions.
CREATE OR REPLACE FUNCTION public.subscription_access(p_agency UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s      subscriptions%ROWTYPE;
  cfg    billing_settings%ROWTYPE;
  v_state TEXT;
  v_grace TIMESTAMPTZ;
BEGIN
  SELECT * INTO s FROM subscriptions WHERE user_id = p_agency;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'inativo', 'has_access', false);
  END IF;
  SELECT * INTO cfg FROM billing_settings WHERE id = 1;
  v_grace := s.paid_until + make_interval(days => COALESCE(cfg.grace_days, 5));

  IF s.billing_exempt THEN
    v_state := 'cortesia';
  ELSIF s.status = 'trialing' THEN
    v_state := CASE WHEN s.trial_ends_at > now() THEN 'teste' ELSE 'inativo' END;
  ELSIF s.status IN ('active', 'past_due') THEN
    v_state := CASE
      WHEN s.paid_until IS NULL THEN 'em_dia'
      WHEN now() < s.paid_until - make_interval(days => COALESCE(cfg.reminder_days, 5)) THEN 'em_dia'
      WHEN now() < s.paid_until THEN 'vence_em_breve'
      WHEN now() < v_grace THEN 'carencia'
      ELSE 'bloqueado'
    END;
  ELSE
    -- Cancelada: vale até o fim do que já foi pago, sem carência
    v_state := CASE WHEN s.paid_until > now() THEN 'em_dia' ELSE 'inativo' END;
  END IF;

  RETURN jsonb_build_object(
    'state',         v_state,
    'has_access',    v_state IN ('cortesia', 'teste', 'em_dia', 'vence_em_breve', 'carencia'),
    'paid_until',    s.paid_until,
    'grace_until',   CASE WHEN s.paid_until IS NOT NULL AND NOT s.billing_exempt THEN v_grace END,
    'reminder_days', cfg.reminder_days,
    'grace_days',    cfg.grace_days
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.subscription_access(UUID) FROM PUBLIC, anon, authenticated;

-- Para o app: só a própria agência (dono ou sócio) consulta
CREATE OR REPLACE FUNCTION public.subscription_access_info(p_agency UUID)
RETURNS JSONB
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN public.is_agency_member(p_agency) THEN public.subscription_access(p_agency) END
$$;
GRANT EXECUTE ON FUNCTION public.subscription_access_info(UUID) TO authenticated;

-- Plano que vale para os limites: só enquanto a agência tem acesso
CREATE OR REPLACE FUNCTION public.agency_active_plan(p_agency UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.plan FROM subscriptions s
  WHERE s.user_id = p_agency
    AND COALESCE((public.subscription_access(p_agency)->>'has_access')::boolean, false)
$$;
