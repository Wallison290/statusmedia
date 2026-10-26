-- ─────────────────────────────────────────────────────────────────────────────
-- 106 · Contrato avulso assinado entra sozinho no Financeiro
--
-- Contrato assinado no CRM cuja proposta só tem itens avulsos (nenhum
-- recorrente) vira uma conta a receber em fin_entries, sem passar pelo
-- "Gerar cobrança" da aba Recorrências:
--   • valor = soma dos itens avulsos − desconto (igual ao proposalSplit do front);
--   • vencimento = dia da assinatura; categoria "Projetos e serviços avulsos";
--   • no cliente convertido do lead, se houver; senão no nome da empresa/lead.
-- Contrato com item recorrente continua no fluxo manual (mensalidade precisa de
-- dia e início escolhidos). Contrato que já gerou lançamento/recorrência é
-- ignorado, então o trigger nunca duplica cobrança.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fin_bill_oneoff_contract(p_contract UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ct        crm_contracts;
  v_items   jsonb;
  v_disc    numeric;
  v_rec     numeric := 0;
  v_one     numeric := 0;
  v_client  uuid;
  v_who     text;
  v_due     date;
  v_id      uuid;
  it        jsonb;
BEGIN
  SELECT * INTO ct FROM crm_contracts WHERE id = p_contract;
  IF NOT FOUND OR ct.status <> 'assinado' OR ct.proposal_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM fin_entries WHERE contract_id = ct.id)
     OR EXISTS (SELECT 1 FROM fin_recurrences WHERE contract_id = ct.id) THEN
    RETURN NULL;
  END IF;

  SELECT items, coalesce(discount, 0) INTO v_items, v_disc FROM crm_proposals WHERE id = ct.proposal_id;
  IF jsonb_typeof(v_items) <> 'array' THEN RETURN NULL; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF coalesce((it->>'recurring')::boolean, false) THEN
      v_rec := v_rec + coalesce(nullif(it->>'quantity', '')::numeric, 1) * coalesce(nullif(it->>'unit_price', '')::numeric, 0);
    ELSE
      v_one := v_one + coalesce(nullif(it->>'quantity', '')::numeric, 1) * coalesce(nullif(it->>'unit_price', '')::numeric, 0);
    END IF;
  END LOOP;
  v_one := greatest(0, v_one - v_disc);
  IF v_rec > 0 OR v_one <= 0 THEN RETURN NULL; END IF;

  SELECT l.converted_client_id, coalesce(nullif(l.company, ''), l.name)
    INTO v_client, v_who FROM crm_leads l WHERE l.id = ct.lead_id;
  v_who := coalesce(v_who, ct.signer_name, 'Cliente');
  v_due := coalesce(ct.signed_at, now())::date;

  INSERT INTO fin_entries (user_id, type, description, amount, due_date, competence, status,
                           account_id, category_id, client_id, counterparty, contract_id,
                           installment, installments, notes)
  VALUES (ct.user_id, 'receita', ct.title || ' · ' || coalesce((SELECT company_name FROM clients WHERE id = v_client), v_who),
          v_one, v_due, date_trunc('month', v_due)::date, 'aberto',
          public.fin_default_account(ct.user_id),
          (SELECT id FROM fin_categories WHERE user_id = ct.user_id AND system_key = 'projetos' LIMIT 1),
          v_client, CASE WHEN v_client IS NULL THEN v_who END, ct.id,
          1, 1, 'Gerado do contrato assinado no CRM.')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_bill_oneoff_contract(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_contract_signed_bill()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'assinado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'assinado') THEN
    BEGIN
      PERFORM public.fin_bill_oneoff_contract(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Faturar é consequência; nunca impede a assinatura
      RAISE WARNING 'fin_bill_oneoff_contract(%): %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_signed_bill ON public.crm_contracts;
CREATE TRIGGER trg_contract_signed_bill AFTER INSERT OR UPDATE OF status ON public.crm_contracts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contract_signed_bill();
