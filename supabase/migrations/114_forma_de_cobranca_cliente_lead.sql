-- ─────────────────────────────────────────────────────────────────────────────
-- 114 · Forma de cobrança no cadastro do cliente e no lead do CRM
--
-- Três jeitos de cobrar um serviço:
--   • recorrente → valor mensal + dia de vencimento (como sempre foi);
--   • unico      → um valor só, pago numa data;
--   • parcelado  → entrada (opcional) + N parcelas mensais.
--
-- No cliente (clients):
--   billing_mode        'recorrente' (padrão, nada muda para quem já existe)
--   valor_total         total do serviço (único ou parcelado)
--   entrada             valor da entrada (parcelado)
--   parcelas            quantidade de parcelas (parcelado)
--   billing_due_date    data do pagamento (único) ou da entrada (parcelado)
--   installments_start  vencimento da 1ª parcela (parcelado)
--   plan_entry_id       lançamento gerado para o pagamento único / entrada
--
-- Financeiro:
--   • recorrente: a mensalidade-espelho (fin_recurrences source 'cliente') segue igual;
--   • parcelado: a MESMA linha-espelho vira as parcelas, com início e fim
--     (parcela = (total − entrada) ÷ N; centavos do arredondamento vão na entrada,
--     igual à proposta parcelada da 112);
--   • único / entrada: um lançamento em fin_entries (plan_entry_id). Enquanto
--     estiver em aberto, acompanha o cadastro; depois de pago, não muda mais.
--
-- No lead (crm_leads.payment_plan):
--   {"mode":"recorrente"} → estimated_value é o valor mensal
--   {"mode":"unico"}      → estimated_value é o valor total
--   {"mode":"parcelado","entrada":3000,"parcelas":8} → estimated_value é o total
--   null = como era antes (valor único)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_mode       TEXT NOT NULL DEFAULT 'recorrente',
  ADD COLUMN IF NOT EXISTS valor_total        NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS entrada            NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS parcelas           INT,
  ADD COLUMN IF NOT EXISTS billing_due_date   DATE,
  ADD COLUMN IF NOT EXISTS installments_start DATE,
  ADD COLUMN IF NOT EXISTS plan_entry_id      UUID REFERENCES public.fin_entries(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER TABLE public.clients ADD CONSTRAINT clients_billing_mode_check
    CHECK (billing_mode IN ('recorrente', 'unico', 'parcelado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.clients ADD CONSTRAINT clients_parcelas_check
    CHECK (parcelas IS NULL OR parcelas BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS payment_plan JSONB;

-- ── Cliente → Financeiro ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_sync_client_recurrence(p_client UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c         clients;
  v_mode    TEXT;
  v_live    BOOLEAN;   -- cliente em dia com a agência (não encerrado/cancelado)
  v_active  BOOLEAN;
  v_cat     UUID;
  v_cat_one UUID;
  v_rec     UUID;
  v_desc    TEXT;
  v_amount  NUMERIC;
  v_day     INT;
  v_start   DATE;
  v_end     DATE;
  v_n       INT;
  v_ent     NUMERIC := 0;
  v_parc    NUMERIC;
  v_one     NUMERIC := 0;   -- valor do lançamento avulso (único ou entrada)
  v_due     DATE;
  v_entry   fin_entries;
BEGIN
  SELECT * INTO c FROM clients WHERE id = p_client;
  IF NOT FOUND THEN RETURN; END IF;

  v_mode := COALESCE(c.billing_mode, 'recorrente');
  v_live := NOT (c.financial_status = 'cancelado' AND COALESCE(c.manual_status_override, false))
            AND COALESCE(c.status, 'ativo') NOT IN ('encerrado');

  -- Linha-espelho: mensalidade (recorrente) ou parcelas (parcelado)
  IF v_mode = 'parcelado' THEN
    v_n := COALESCE(c.parcelas, 0);
    IF COALESCE(c.valor_total, 0) > 0 AND v_n >= 1 AND COALESCE(c.entrada, 0) < c.valor_total THEN
      v_ent   := GREATEST(COALESCE(c.entrada, 0), 0);
      v_parc  := round((c.valor_total - v_ent) / v_n, 2);
      v_ent   := c.valor_total - v_parc * v_n;   -- centavos do arredondamento ficam na entrada
      v_start := COALESCE(c.installments_start, (date_trunc('month', current_date) + interval '1 month')::date);
      v_end   := (v_start + make_interval(months => v_n - 1))::date;
      v_day   := EXTRACT(day FROM v_start)::int;
      v_amount := v_parc;
      v_desc  := 'Parcelas (' || v_n || 'x) · ' || c.company_name;
      v_active := v_live AND v_parc > 0;
      v_one   := v_ent;
      v_due   := COALESCE(c.billing_due_date, current_date);
    ELSE
      v_active := false;
    END IF;
  ELSIF v_mode = 'recorrente' THEN
    v_amount := c.valor_mensal;
    v_day    := c.dia_vencimento;
    v_desc   := 'Mensalidade · ' || c.company_name;
    v_active := v_live AND COALESCE(c.valor_mensal, 0) > 0 AND c.dia_vencimento IS NOT NULL;
  ELSE  -- unico
    v_active := false;
    IF COALESCE(c.valor_total, 0) > 0 THEN
      v_one := c.valor_total;
      v_due := COALESCE(c.billing_due_date, current_date);
    END IF;
  END IF;

  SELECT id INTO v_rec FROM fin_recurrences WHERE client_id = c.id AND source = 'cliente';

  -- Trocou entre mensalidade e parcelas: a linha antiga é arquivada (vira manual e
  -- pausada, o que tira as próximas em aberto) e nasce uma nova. Assim um mês já
  -- pago da mensalidade não bloqueia a parcela do mesmo mês.
  IF v_rec IS NOT NULL AND v_active
     AND (v_mode = 'parcelado') <> ((SELECT end_date FROM fin_recurrences WHERE id = v_rec) IS NOT NULL) THEN
    UPDATE fin_recurrences SET is_active = false, source = 'manual', updated_at = now() WHERE id = v_rec;
    v_rec := NULL;
  END IF;

  IF v_rec IS NOT NULL OR v_active OR v_one > 0 OR c.plan_entry_id IS NOT NULL THEN
    PERFORM public.fin_ensure_defaults(c.user_id);
  END IF;

  IF v_rec IS NOT NULL OR v_active THEN
    SELECT id INTO v_cat FROM fin_categories
     WHERE user_id = c.user_id AND system_key = CASE WHEN v_mode = 'parcelado' THEN 'projetos' ELSE 'mensalidades' END;

    IF v_rec IS NULL THEN
      INSERT INTO fin_recurrences (user_id, type, description, amount, category_id, account_id,
                                   client_id, day_of_month, start_date, end_date, is_active, source)
      VALUES (c.user_id, 'receita', v_desc, v_amount, v_cat,
              public.fin_default_account(c.user_id), c.id, v_day,
              COALESCE(v_start, date_trunc('month', current_date)::date), v_end, true, 'cliente');
    ELSIF v_active THEN
      UPDATE fin_recurrences SET
        description  = v_desc,
        amount       = v_amount,
        day_of_month = v_day,
        -- parcelado tem início e fim; ao voltar para mensalidade, começa no mês atual e não acaba
        start_date   = CASE WHEN v_mode = 'parcelado' THEN v_start
                            WHEN end_date IS NOT NULL THEN date_trunc('month', current_date)::date
                            ELSE start_date END,
        end_date     = v_end,
        is_active    = true,
        updated_at   = now()
      WHERE id = v_rec;
    ELSE
      UPDATE fin_recurrences SET
        description = CASE WHEN v_mode = 'recorrente' THEN 'Mensalidade · ' || c.company_name ELSE description END,
        is_active   = false,
        updated_at  = now()
      WHERE id = v_rec AND is_active;
    END IF;
  END IF;

  -- Lançamento avulso: pagamento único ou entrada do parcelado
  IF c.plan_entry_id IS NOT NULL THEN
    SELECT * INTO v_entry FROM fin_entries WHERE id = c.plan_entry_id;
  END IF;

  IF v_entry.id IS NOT NULL AND v_entry.status <> 'aberto' THEN
    RETURN;   -- já pago (ou cancelado à mão): o cadastro não mexe mais
  END IF;

  IF v_one > 0 AND v_live THEN
    SELECT id INTO v_cat_one FROM fin_categories WHERE user_id = c.user_id AND system_key = 'projetos';
    v_desc := CASE WHEN v_mode = 'parcelado' THEN 'Entrada · ' ELSE 'Pagamento único · ' END || c.company_name;
    IF v_entry.id IS NOT NULL THEN
      UPDATE fin_entries SET
        description = v_desc,
        amount      = v_one,
        due_date    = v_due,
        competence  = date_trunc('month', v_due)::date,
        updated_at  = now()
      WHERE id = v_entry.id;
    ELSE
      INSERT INTO fin_entries (user_id, type, description, amount, due_date, competence, status,
                               account_id, category_id, client_id, installment, installments, notes)
      VALUES (c.user_id, 'receita', v_desc, v_one, v_due, date_trunc('month', v_due)::date, 'aberto',
              public.fin_default_account(c.user_id), v_cat_one, c.id, 1, 1,
              'Gerado pelo cadastro do cliente.')
      RETURNING * INTO v_entry;
      -- plan_entry_id não está na lista do gatilho: este UPDATE não chama a sincronização de novo
      UPDATE clients SET plan_entry_id = v_entry.id WHERE id = c.id;
    END IF;
  ELSIF v_entry.id IS NOT NULL THEN
    -- Mudou para mensalidade, zerou o valor ou encerrou: o lançamento em aberto sai
    UPDATE clients SET plan_entry_id = NULL WHERE id = c.id;
    DELETE FROM fin_entries WHERE id = v_entry.id AND status = 'aberto';
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
     OR NEW.manual_status_override IS DISTINCT FROM OLD.manual_status_override
     OR NEW.billing_mode IS DISTINCT FROM OLD.billing_mode
     OR NEW.valor_total IS DISTINCT FROM OLD.valor_total
     OR NEW.entrada IS DISTINCT FROM OLD.entrada
     OR NEW.parcelas IS DISTINCT FROM OLD.parcelas
     OR NEW.billing_due_date IS DISTINCT FROM OLD.billing_due_date
     OR NEW.installments_start IS DISTINCT FROM OLD.installments_start THEN
    PERFORM public.fin_sync_client_recurrence(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fin_sync_client_recurrence(UUID) FROM PUBLIC, anon, authenticated;
