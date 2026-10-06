-- ── 090_financeiro_base.sql ───────────────────────────────────────────────────
-- Financeiro, Fase 1: a base de um financeiro completo.
--
-- Até aqui o Financeiro era "um valor mensal fixo no cadastro do cliente" e
-- uma lista de pagamentos. Agora existe um livro de LANÇAMENTOS (contas a
-- receber e a pagar), com contas bancárias, categorias, recorrências,
-- transferências e histórico de alterações.
--
-- Compatibilidade (nada do que já existe muda de comportamento):
--   • A mensalidade do cliente (clients.valor_mensal + dia_vencimento) vira
--     uma recorrência mantida pelo banco — editar o cliente atualiza a
--     recorrência e as próximas parcelas em aberto.
--   • Dar baixa num lançamento de cliente continua gravando em
--     client_payments e atualizando clients.last_payment_date, que o
--     Dashboard, o portal do cliente e a cobrança por WhatsApp já usam.
--   • Os pagamentos antigos viram lançamentos pagos (histórico do caixa).
--
-- Situação "atrasado" não é gravada: é aberto + vencimento no passado.
-- Tudo pertence à agência (user_id = dono) e vale para sócios (088).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabelas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fin_accounts (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT          NOT NULL,
  kind             TEXT          NOT NULL DEFAULT 'banco' CHECK (kind IN ('banco', 'caixa', 'carteira', 'outro')),
  initial_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_default       BOOLEAN       NOT NULL DEFAULT false,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_accounts_user_idx ON public.fin_accounts (user_id);

CREATE TABLE IF NOT EXISTS public.fin_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('receita', 'despesa')),
  -- Linha do DRE gerencial (Fase 4): receita | deducao (impostos sobre a
  -- receita) | custo (custo do serviço entregue) | despesa (operação)
  dre_group   TEXT        NOT NULL DEFAULT 'despesa'
              CHECK (dre_group IN ('receita', 'deducao', 'custo', 'despesa')),
  color       TEXT        NOT NULL DEFAULT '#64748b',
  system_key  TEXT,       -- categorias criadas pelo sistema (ex.: 'mensalidades')
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_categories_user_idx ON public.fin_categories (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS fin_categories_system_unique
  ON public.fin_categories (user_id, system_key) WHERE system_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fin_recurrences (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type             TEXT          NOT NULL CHECK (type IN ('receita', 'despesa')),
  description      TEXT          NOT NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  category_id      UUID          REFERENCES public.fin_categories(id) ON DELETE SET NULL,
  account_id       UUID          REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  client_id        UUID          REFERENCES public.clients(id) ON DELETE CASCADE,
  counterparty     TEXT,         -- fornecedor / pagador quando não é um cliente
  interval_months  INT           NOT NULL DEFAULT 1 CHECK (interval_months IN (1, 2, 3, 6, 12)),
  day_of_month     INT           NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  start_date       DATE          NOT NULL DEFAULT current_date,
  end_date         DATE,
  is_active        BOOLEAN       NOT NULL DEFAULT true,
  -- 'cliente' = espelho da mensalidade do cadastro do cliente (mantida pelo banco)
  source           TEXT          NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'cliente', 'contrato')),
  contract_id      UUID          REFERENCES public.crm_contracts(id) ON DELETE SET NULL,
  created_by       UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_recurrences_user_idx ON public.fin_recurrences (user_id);
-- Uma mensalidade-espelho por cliente
CREATE UNIQUE INDEX IF NOT EXISTS fin_recurrences_client_unique
  ON public.fin_recurrences (client_id) WHERE source = 'cliente';

CREATE TABLE IF NOT EXISTS public.fin_entries (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type          TEXT          NOT NULL CHECK (type IN ('receita', 'despesa')),
  description   TEXT          NOT NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  due_date      DATE          NOT NULL,
  competence    DATE          NOT NULL,  -- 1º dia do mês a que se refere (DRE)
  status        TEXT          NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  paid_at       DATE,
  paid_amount   NUMERIC(14,2),
  account_id    UUID          REFERENCES public.fin_accounts(id) ON DELETE SET NULL,
  category_id   UUID          REFERENCES public.fin_categories(id) ON DELETE SET NULL,
  client_id     UUID          REFERENCES public.clients(id) ON DELETE SET NULL,
  counterparty  TEXT,
  recurrence_id UUID          REFERENCES public.fin_recurrences(id) ON DELETE SET NULL,
  contract_id   UUID          REFERENCES public.crm_contracts(id) ON DELETE SET NULL,
  installment   INT,
  installments  INT,
  notes         TEXT,
  created_by    UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT fin_entries_paid_consistency CHECK (
    (status = 'pago' AND paid_at IS NOT NULL AND paid_amount IS NOT NULL)
    OR (status <> 'pago')
  )
);
CREATE INDEX IF NOT EXISTS fin_entries_user_due_idx  ON public.fin_entries (user_id, due_date);
CREATE INDEX IF NOT EXISTS fin_entries_client_idx    ON public.fin_entries (client_id) WHERE client_id IS NOT NULL;
-- Uma parcela por recorrência e mês: a geração automática nunca duplica
CREATE UNIQUE INDEX IF NOT EXISTS fin_entries_recurrence_competence
  ON public.fin_entries (recurrence_id, competence) WHERE recurrence_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fin_transfers (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id  UUID          NOT NULL REFERENCES public.fin_accounts(id) ON DELETE CASCADE,
  to_account_id    UUID          NOT NULL REFERENCES public.fin_accounts(id) ON DELETE CASCADE,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  transfer_date    DATE          NOT NULL DEFAULT current_date,
  notes            TEXT,
  created_by       UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT fin_transfers_distinct CHECK (from_account_id <> to_account_id)
);
CREATE INDEX IF NOT EXISTS fin_transfers_user_idx ON public.fin_transfers (user_id);

CREATE TABLE IF NOT EXISTS public.fin_audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        NOT NULL,      -- agência
  table_name  TEXT        NOT NULL,
  row_id      UUID        NOT NULL,
  action      TEXT        NOT NULL CHECK (action IN ('criou', 'alterou', 'excluiu')),
  actor_id    UUID,
  actor_name  TEXT,
  summary     TEXT,
  changes     JSONB,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_audit_user_idx ON public.fin_audit_log (user_id, at DESC);
CREATE INDEX IF NOT EXISTS fin_audit_row_idx  ON public.fin_audit_log (row_id);

ALTER TABLE public.client_payments
  ADD COLUMN IF NOT EXISTS entry_id UUID REFERENCES public.fin_entries(id) ON DELETE SET NULL;

-- ── 2. RLS: agência e sócios (mesma regra da 088) ────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin_accounts','fin_categories','fin_recurrences','fin_entries','fin_transfers'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_agency', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING ((user_id = auth.uid() OR public.is_agency_member(user_id)))
         WITH CHECK ((user_id = auth.uid() OR public.is_agency_member(user_id)))',
      t || '_agency', t);
  END LOOP;
END;
$$;

-- Histórico: só leitura pela agência; escrita só pelos triggers
ALTER TABLE public.fin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_audit_log_read ON public.fin_audit_log;
CREATE POLICY fin_audit_log_read ON public.fin_audit_log
  FOR SELECT USING ((user_id = auth.uid() OR public.is_agency_member(user_id)));

-- ── 3. Utilidades ─────────────────────────────────────────────────────────────

-- Vencimento num mês: dia 31 vira o último dia em meses mais curtos
CREATE OR REPLACE FUNCTION public.fin_due_in_month(p_month DATE, p_day INT)
RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
  SELECT (date_trunc('month', p_month)::date
          + (LEAST(p_day, EXTRACT(day FROM (date_trunc('month', p_month) + interval '1 month - 1 day'))::int) - 1))
$$;

-- "Outubro 2026" / "10/2026" / "2026-10" → 2026-10-01 (mês de referência antigo)
CREATE OR REPLACE FUNCTION public.fin_parse_reference_month(p_ref TEXT, p_fallback DATE)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  months TEXT[] := ARRAY['janeiro','fevereiro','março','abril','maio','junho','julho',
                         'agosto','setembro','outubro','novembro','dezembro'];
  s TEXT := lower(trim(coalesce(p_ref, '')));
  m INT; y INT; i INT;
BEGIN
  FOR i IN 1..12 LOOP
    IF s LIKE months[i] || '%' THEN
      m := i;
      y := NULLIF(substring(s FROM '(\d{4})'), '')::int;
      EXIT;
    END IF;
  END LOOP;
  IF m IS NULL AND s ~ '^\d{1,2}/\d{4}$' THEN
    m := split_part(s, '/', 1)::int; y := split_part(s, '/', 2)::int;
  ELSIF m IS NULL AND s ~ '^\d{4}-\d{1,2}' THEN
    y := split_part(s, '-', 1)::int; m := split_part(s, '-', 2)::int;
  END IF;
  IF m BETWEEN 1 AND 12 AND y BETWEEN 2000 AND 2100 THEN
    RETURN make_date(y, m, 1);
  END IF;
  RETURN date_trunc('month', p_fallback)::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_month_label(p_month DATE)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto',
                'Setembro','Outubro','Novembro','Dezembro'])[EXTRACT(month FROM p_month)::int]
         || ' ' || EXTRACT(year FROM p_month)::int
$$;

-- ── 4. Categorias e conta padrão de cada agência ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_ensure_defaults(p_agency UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_agency IS NULL THEN RETURN; END IF;

  INSERT INTO fin_categories (user_id, name, type, dre_group, color, system_key)
  VALUES
    (p_agency, 'Mensalidades',             'receita', 'receita', '#2563EB', 'mensalidades'),
    (p_agency, 'Projetos e serviços avulsos','receita', 'receita', '#0EA5E9', 'projetos'),
    (p_agency, 'Outras receitas',          'receita', 'receita', '#14B8A6', 'outras_receitas'),
    (p_agency, 'Impostos sobre a receita', 'despesa', 'deducao', '#F59E0B', 'impostos'),
    (p_agency, 'Freelancers e terceiros',  'despesa', 'custo',   '#A855F7', 'freelancers'),
    (p_agency, 'Mídia e anúncios',         'despesa', 'custo',   '#EC4899', 'midia'),
    (p_agency, 'Ferramentas e software',   'despesa', 'despesa', '#6366F1', 'ferramentas'),
    (p_agency, 'Salários e pró-labore',    'despesa', 'despesa', '#EF4444', 'salarios'),
    (p_agency, 'Aluguel e estrutura',      'despesa', 'despesa', '#F97316', 'estrutura'),
    (p_agency, 'Marketing da agência',     'despesa', 'despesa', '#84CC16', 'marketing'),
    (p_agency, 'Taxas bancárias',          'despesa', 'despesa', '#78716C', 'taxas'),
    (p_agency, 'Outras despesas',          'despesa', 'despesa', '#64748B', 'outras_despesas')
  ON CONFLICT (user_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM fin_accounts WHERE user_id = p_agency) THEN
    INSERT INTO fin_accounts (user_id, name, kind, is_default)
    VALUES (p_agency, 'Conta principal', 'banco', true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_default_account(p_agency UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM fin_accounts WHERE user_id = p_agency AND is_active
  ORDER BY is_default DESC, created_at LIMIT 1
$$;

-- Chamada pela tela do Financeiro ao abrir (idempotente)
CREATE OR REPLACE FUNCTION public.fin_bootstrap()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fin_ensure_defaults(public.current_agency_id());
END;
$$;

-- ── 5. Recorrências → parcelas ───────────────────────────────────────────────
-- Gera as parcelas do mês de início até 3 meses à frente (base do fluxo de
-- caixa). Parcelas em aberto acompanham mudanças da recorrência; pagas nunca
-- mudam. Recorrência inativa/encerrada remove só as parcelas futuras em aberto.
CREATE OR REPLACE FUNCTION public.fin_sync_recurrence(p_rec UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r       fin_recurrences;
  horizon DATE := (date_trunc('month', current_date) + interval '3 months')::date;
  m       DATE;
  due     DATE;
  first_m DATE;
BEGIN
  SELECT * INTO r FROM fin_recurrences WHERE id = p_rec;
  IF NOT FOUND THEN RETURN; END IF;

  -- Parcelas em aberto que não deveriam mais existir
  DELETE FROM fin_entries e
  WHERE e.recurrence_id = r.id AND e.status = 'aberto'
    AND e.due_date >= current_date
    AND (NOT r.is_active
         OR (r.end_date IS NOT NULL AND e.due_date > r.end_date)
         OR e.due_date < r.start_date
         -- fora do ciclo (ex.: virou trimestral)
         OR ((EXTRACT(year FROM e.competence) * 12 + EXTRACT(month FROM e.competence))
             - (EXTRACT(year FROM r.start_date) * 12 + EXTRACT(month FROM r.start_date)))::int
            % r.interval_months <> 0);

  IF NOT r.is_active THEN RETURN; END IF;

  -- Parcelas futuras em aberto acompanham valor, descrição, categoria e dia
  UPDATE fin_entries e SET
    amount       = r.amount,
    description  = r.description,
    category_id  = r.category_id,
    account_id   = COALESCE(e.account_id, r.account_id),
    client_id    = r.client_id,
    counterparty = r.counterparty,
    due_date     = public.fin_due_in_month(e.competence, r.day_of_month),
    updated_at   = now()
  WHERE e.recurrence_id = r.id AND e.status = 'aberto' AND e.due_date >= current_date;

  first_m := date_trunc('month', r.start_date)::date;
  m := first_m;
  WHILE m <= horizon LOOP
    due := public.fin_due_in_month(m, r.day_of_month);
    IF due >= r.start_date AND (r.end_date IS NULL OR due <= r.end_date) THEN
      INSERT INTO fin_entries (user_id, type, description, amount, due_date, competence,
                               account_id, category_id, client_id, counterparty,
                               recurrence_id, contract_id, created_by)
      VALUES (r.user_id, r.type, r.description, r.amount, due, m,
              r.account_id, r.category_id, r.client_id, r.counterparty,
              r.id, r.contract_id, r.created_by)
      ON CONFLICT (recurrence_id, competence) WHERE recurrence_id IS NOT NULL DO NOTHING;
    END IF;
    m := (m + make_interval(months => r.interval_months))::date;
  END LOOP;
END;
$$;

-- Rodada diária: estende o horizonte de todas as recorrências ativas
CREATE OR REPLACE FUNCTION public.fin_generate_all()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT id FROM fin_recurrences WHERE is_active LOOP
    PERFORM public.fin_sync_recurrence(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fin_recurrence_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fin_sync_recurrence(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin_recurrence_sync ON public.fin_recurrences;
CREATE TRIGGER trg_fin_recurrence_sync
  AFTER INSERT OR UPDATE ON public.fin_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_recurrence_sync();

-- ── 6. Mensalidade do cadastro do cliente ↔ recorrência ─────────────────────
CREATE OR REPLACE FUNCTION public.fin_sync_client_recurrence(p_client UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c        clients;
  v_active BOOLEAN;
  v_cat    UUID;
  v_rec    UUID;
BEGIN
  SELECT * INTO c FROM clients WHERE id = p_client;
  IF NOT FOUND THEN RETURN; END IF;

  v_active := COALESCE(c.valor_mensal, 0) > 0 AND c.dia_vencimento IS NOT NULL
              AND NOT (c.financial_status = 'cancelado' AND COALESCE(c.manual_status_override, false))
              AND COALESCE(c.status, 'ativo') NOT IN ('encerrado');

  SELECT id INTO v_rec FROM fin_recurrences WHERE client_id = c.id AND source = 'cliente';

  IF v_rec IS NULL AND NOT v_active THEN RETURN; END IF;

  PERFORM public.fin_ensure_defaults(c.user_id);
  SELECT id INTO v_cat FROM fin_categories WHERE user_id = c.user_id AND system_key = 'mensalidades';

  IF v_rec IS NULL THEN
    INSERT INTO fin_recurrences (user_id, type, description, amount, category_id, account_id,
                                 client_id, day_of_month, start_date, is_active, source)
    VALUES (c.user_id, 'receita', 'Mensalidade · ' || c.company_name, c.valor_mensal, v_cat,
            public.fin_default_account(c.user_id), c.id, c.dia_vencimento,
            date_trunc('month', current_date)::date, true, 'cliente');
  ELSE
    UPDATE fin_recurrences SET
      description  = 'Mensalidade · ' || c.company_name,
      amount       = CASE WHEN COALESCE(c.valor_mensal, 0) > 0 THEN c.valor_mensal ELSE amount END,
      day_of_month = COALESCE(c.dia_vencimento, day_of_month),
      is_active    = v_active,
      updated_at   = now()
    WHERE id = v_rec;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fin_client_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.valor_mensal IS DISTINCT FROM OLD.valor_mensal
     OR NEW.dia_vencimento IS DISTINCT FROM OLD.dia_vencimento
     OR NEW.company_name IS DISTINCT FROM OLD.company_name
     OR NEW.status IS DISTINCT FROM OLD.status
     OR (NEW.financial_status = 'cancelado') IS DISTINCT FROM (OLD.financial_status = 'cancelado')
     OR NEW.manual_status_override IS DISTINCT FROM OLD.manual_status_override THEN
    PERFORM public.fin_sync_client_recurrence(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin_client_sync ON public.clients;
CREATE TRIGGER trg_fin_client_sync
  AFTER INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_client_sync();

-- ── 7. Baixa e estorno ───────────────────────────────────────────────────────
-- Recebimento de cliente continua indo para client_payments (histórico do
-- portal) e para clients.last_payment_date (situação no Dashboard e na lista).
CREATE OR REPLACE FUNCTION public.fin_after_client_receipt(p_client UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE clients SET
    last_payment_date      = (SELECT max(payment_date) FROM client_payments WHERE client_id = p_client AND status = 'pago'),
    financial_status       = CASE WHEN financial_status = 'cancelado' AND manual_status_override THEN financial_status ELSE 'ativo' END,
    manual_status_override = CASE WHEN financial_status = 'cancelado' AND manual_status_override THEN true ELSE false END,
    updated_at             = now()
  WHERE id = p_client
$$;

CREATE OR REPLACE FUNCTION public.fin_settle(
  p_entry UUID, p_paid_at DATE DEFAULT current_date,
  p_amount NUMERIC DEFAULT NULL, p_account UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e fin_entries;
BEGIN
  SELECT * INTO e FROM fin_entries WHERE id = p_entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
  IF NOT public.is_agency_member(e.user_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF e.status = 'pago' THEN RETURN; END IF;

  UPDATE fin_entries SET
    status      = 'pago',
    paid_at     = COALESCE(p_paid_at, current_date),
    paid_amount = COALESCE(p_amount, e.amount),
    account_id  = COALESCE(p_account, e.account_id, public.fin_default_account(e.user_id)),
    notes       = COALESCE(NULLIF(p_notes, ''), e.notes),
    updated_at  = now()
  WHERE id = p_entry;

  IF e.type = 'receita' AND e.client_id IS NOT NULL THEN
    INSERT INTO client_payments (client_id, user_id, amount, payment_date, reference_month, notes, status, entry_id)
    VALUES (e.client_id, e.user_id, COALESCE(p_amount, e.amount), COALESCE(p_paid_at, current_date),
            public.fin_month_label(e.competence), NULLIF(p_notes, ''), 'pago', e.id);
    PERFORM public.fin_after_client_receipt(e.client_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fin_reopen(p_entry UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e fin_entries;
BEGIN
  SELECT * INTO e FROM fin_entries WHERE id = p_entry;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
  IF NOT public.is_agency_member(e.user_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  IF e.status <> 'pago' THEN RETURN; END IF;

  UPDATE fin_entries SET status = 'aberto', paid_at = NULL, paid_amount = NULL, updated_at = now()
  WHERE id = p_entry;

  IF e.client_id IS NOT NULL THEN
    DELETE FROM client_payments WHERE entry_id = e.id;
    PERFORM public.fin_after_client_receipt(e.client_id);
  END IF;
END;
$$;

-- Fluxo antigo "Registrar pagamento" do cliente: dá baixa na parcela do mês
-- (se existir) ou cria um recebimento já pago.
CREATE OR REPLACE FUNCTION public.fin_register_client_payment(
  p_client UUID, p_amount NUMERIC, p_paid_at DATE, p_reference TEXT, p_notes TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c       clients;
  v_comp  DATE := public.fin_parse_reference_month(p_reference, p_paid_at);
  v_entry UUID;
BEGIN
  SELECT * INTO c FROM clients WHERE id = p_client;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.'; END IF;
  IF NOT public.is_agency_member(c.user_id) THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  PERFORM public.fin_ensure_defaults(c.user_id);

  SELECT e.id INTO v_entry FROM fin_entries e
  JOIN fin_recurrences r ON r.id = e.recurrence_id AND r.source = 'cliente'
  WHERE e.client_id = p_client AND e.competence = v_comp AND e.status = 'aberto'
  LIMIT 1;

  IF v_entry IS NULL THEN
    INSERT INTO fin_entries (user_id, type, description, amount, due_date, competence,
                             account_id, category_id, client_id, created_by)
    VALUES (c.user_id, 'receita', 'Mensalidade · ' || c.company_name, p_amount, p_paid_at, v_comp,
            public.fin_default_account(c.user_id),
            (SELECT id FROM fin_categories WHERE user_id = c.user_id AND system_key = 'mensalidades'),
            c.id, auth.uid())
    RETURNING id INTO v_entry;
  END IF;

  PERFORM public.fin_settle(v_entry, p_paid_at, p_amount, NULL, p_notes);
  -- Mantém o texto do mês como a pessoa digitou no histórico antigo
  UPDATE client_payments SET reference_month = COALESCE(NULLIF(trim(p_reference), ''), reference_month)
  WHERE entry_id = v_entry;
  RETURN v_entry;
END;
$$;

-- ── 8. Autoria e histórico de alterações ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fin_authorship()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;
  IF TG_TABLE_NAME = 'fin_entries' THEN
    NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_entries_authorship ON public.fin_entries;
CREATE TRIGGER trg_fin_entries_authorship BEFORE INSERT OR UPDATE ON public.fin_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_authorship();
DROP TRIGGER IF EXISTS trg_fin_recurrences_authorship ON public.fin_recurrences;
CREATE TRIGGER trg_fin_recurrences_authorship BEFORE INSERT ON public.fin_recurrences
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_authorship();
DROP TRIGGER IF EXISTS trg_fin_transfers_authorship ON public.fin_transfers;
CREATE TRIGGER trg_fin_transfers_authorship BEFORE INSERT ON public.fin_transfers
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_authorship();

CREATE OR REPLACE FUNCTION public.trg_fin_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old   JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new   JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_row   JSONB := COALESCE(v_new, v_old);
  v_diff  JSONB := '{}'::jsonb;
  k       TEXT;
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF k NOT IN ('updated_at', 'updated_by') AND v_new->k IS DISTINCT FROM v_old->k THEN
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('de', v_old->k, 'para', v_new->k));
      END IF;
    END LOOP;
    IF v_diff = '{}'::jsonb THEN RETURN NEW; END IF;
  END IF;

  INSERT INTO fin_audit_log (user_id, table_name, row_id, action, actor_id, actor_name, summary, changes)
  VALUES (
    (v_row->>'user_id')::uuid, TG_TABLE_NAME, (v_row->>'id')::uuid,
    CASE TG_OP WHEN 'INSERT' THEN 'criou' WHEN 'UPDATE' THEN 'alterou' ELSE 'excluiu' END,
    v_actor,
    CASE WHEN v_actor IS NULL THEN 'Sistema' ELSE public.login_display_name(v_actor) END,
    COALESCE(v_row->>'description', v_row->>'name', v_row->>'notes', ''),
    CASE TG_OP WHEN 'UPDATE' THEN v_diff ELSE v_row END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin_accounts','fin_categories','fin_recurrences','fin_entries','fin_transfers'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.trg_fin_audit()', 'trg_' || t || '_audit', t);
  END LOOP;
END;
$$;

-- ── 9. Saldos e fluxo de caixa (leitura) ─────────────────────────────────────
CREATE OR REPLACE VIEW public.fin_account_balances
WITH (security_invoker = true) AS
SELECT a.id, a.user_id, a.name, a.kind, a.is_default, a.is_active, a.initial_balance,
       a.initial_balance
       + COALESCE((SELECT sum(CASE WHEN e.type = 'receita' THEN e.paid_amount ELSE -e.paid_amount END)
                   FROM fin_entries e WHERE e.account_id = a.id AND e.status = 'pago'), 0)
       + COALESCE((SELECT sum(t.amount) FROM fin_transfers t WHERE t.to_account_id = a.id), 0)
       - COALESCE((SELECT sum(t.amount) FROM fin_transfers t WHERE t.from_account_id = a.id), 0)
       AS balance
FROM fin_accounts a;

-- ── 10. Grants ────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.fin_sync_recurrence(UUID)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_generate_all()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_sync_client_recurrence(UUID)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_ensure_defaults(UUID)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_after_client_receipt(UUID)     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.fin_bootstrap()                    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fin_settle(UUID, DATE, NUMERIC, UUID, TEXT) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fin_reopen(UUID)                   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fin_register_client_payment(UUID, NUMERIC, DATE, TEXT, TEXT) TO authenticated;
GRANT  SELECT ON public.fin_account_balances TO authenticated;

-- ── 11. Migração do que já existe ────────────────────────────────────────────
-- 11a. Categorias e conta padrão para toda agência
SELECT public.fin_ensure_defaults(p.id) FROM profiles p WHERE p.role = 'agency';

-- 11b. Pagamentos antigos viram lançamentos pagos (histórico do caixa)
WITH src AS (
  SELECT cp.*, c.company_name,
         public.fin_parse_reference_month(cp.reference_month, cp.payment_date) AS comp
  FROM client_payments cp JOIN clients c ON c.id = cp.client_id
  WHERE cp.entry_id IS NULL AND cp.status = 'pago'
), ins AS (
  INSERT INTO fin_entries (user_id, type, description, amount, due_date, competence, status,
                           paid_at, paid_amount, account_id, category_id, client_id, notes, created_at)
  SELECT s.user_id, 'receita', 'Mensalidade · ' || s.company_name, s.amount, s.payment_date, s.comp,
         'pago', s.payment_date, s.amount, public.fin_default_account(s.user_id),
         (SELECT id FROM fin_categories fc WHERE fc.user_id = s.user_id AND fc.system_key = 'mensalidades'),
         s.client_id, s.notes, s.created_at
  FROM src s
  RETURNING id, client_id, paid_at, paid_amount, created_at
)
UPDATE client_payments cp SET entry_id = ins.id
FROM ins
WHERE cp.client_id = ins.client_id AND cp.payment_date = ins.paid_at
  AND cp.amount = ins.paid_amount AND cp.created_at = ins.created_at AND cp.entry_id IS NULL;

-- 11c. Mensalidades dos clientes viram recorrências (começando neste mês).
-- O pagamento já feito deste mês é ligado à recorrência para não gerar
-- uma cobrança duplicada do mesmo mês.
DO $$
DECLARE c RECORD; v_rec UUID; v_paid UUID;
BEGIN
  FOR c IN SELECT id FROM clients WHERE COALESCE(valor_mensal, 0) > 0 AND dia_vencimento IS NOT NULL LOOP
    -- Liga o lançamento pago deste mês (vindo de 11b) antes de gerar as parcelas
    PERFORM public.fin_sync_client_recurrence(c.id);
  END LOOP;
END;
$$;

-- Parcelas geradas para um mês que o cliente já pagou (pagamento antigo,
-- sem recorrência): marca como pagas usando o pagamento existente.
UPDATE fin_entries gen SET
  status = 'pago', paid_at = old.paid_at, paid_amount = old.paid_amount,
  account_id = COALESCE(gen.account_id, old.account_id), updated_at = now()
FROM fin_entries old
WHERE gen.recurrence_id IS NOT NULL AND gen.status = 'aberto'
  AND old.recurrence_id IS NULL AND old.status = 'pago'
  AND old.client_id = gen.client_id AND old.competence = gen.competence;

-- E o lançamento antigo duplicado sai (o histórico do cliente aponta para a parcela)
WITH dup AS (
  SELECT old.id AS old_id, gen.id AS gen_id
  FROM fin_entries old
  JOIN fin_entries gen ON gen.client_id = old.client_id AND gen.competence = old.competence
   AND gen.recurrence_id IS NOT NULL AND gen.status = 'pago'
  WHERE old.recurrence_id IS NULL AND old.status = 'pago'
    AND gen.paid_at = old.paid_at AND gen.paid_amount = old.paid_amount
)
, relink AS (
  UPDATE client_payments cp SET entry_id = dup.gen_id FROM dup WHERE cp.entry_id = dup.old_id
  RETURNING dup.old_id
)
DELETE FROM fin_entries WHERE id IN (SELECT old_id FROM dup);

-- ── 12. Rotina diária: estende as recorrências (06:00 UTC) ───────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('fin-generate-recurrences') FROM cron.job WHERE jobname = 'fin-generate-recurrences';
    PERFORM cron.schedule('fin-generate-recurrences', '0 6 * * *', 'SELECT public.fin_generate_all()');
  ELSE
    RAISE NOTICE 'pg_cron ausente: recorrências só estendem ao editar.';
  END IF;
END;
$$;
