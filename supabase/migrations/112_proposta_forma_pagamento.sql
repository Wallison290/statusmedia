-- ── 112: forma de pagamento da proposta (valor total ou entrada + parcelas) ──
-- payment_plan = null / {"mode":"total"} → valor total, como sempre foi.
-- {"mode":"parcelado","entrada":3000,"parcelas":8,"primeiro_vencimento":"2026-12-10"}
--   → parcela = (total − entrada) ÷ parcelas (centavos que sobram vão na entrada).
-- Faz parte do conteúdo aceito (entra no código de aceite e trava depois da resposta).
-- No contrato assinado: entrada vira receita do mês no Financeiro e as parcelas
-- viram uma recorrência mensal com início e fim (quantidade de meses).

ALTER TABLE public.crm_proposals ADD COLUMN IF NOT EXISTS payment_plan jsonb;

CREATE OR REPLACE FUNCTION public.crm_proposal_content(p crm_proposals)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT (jsonb_build_object(
    'title', p.title, 'intro', p.intro, 'items', p.items, 'discount', p.discount,
    'total', p.total, 'valid_until', p.valid_until, 'payment_terms', p.payment_terms,
    'options', p.options, 'accepted_option', p.accepted_option
  ) || CASE WHEN p.pdf_url IS NOT NULL THEN jsonb_build_object('pdf_url', p.pdf_url) ELSE '{}'::jsonb END
    || CASE WHEN p.payment_plan IS NOT NULL THEN jsonb_build_object('payment_plan', p.payment_plan) ELSE '{}'::jsonb END)::text;
$function$;

CREATE OR REPLACE FUNCTION public.get_crm_proposal(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p        crm_proposals;
  v_today  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_lead   jsonb;
BEGIN
  SELECT * INTO p FROM crm_proposals WHERE public_token = p_token;
  -- Rascunho só abre para a própria agência (dono ou sócio): é a
  -- pré-visualização de "Ver como o cliente". Para o cliente o link segue fora do ar.
  IF NOT FOUND OR (p.status = 'rascunho' AND NOT coalesce(public.is_agency_member(p.user_id), false)) THEN
    RETURN NULL;
  END IF;

  -- A própria agência (dono ou sócio) abrindo o link para conferir não conta
  IF NOT coalesce(public.is_agency_member(p.user_id), false) AND crm_register_view(p.user_id, 'proposta', p.id) THEN
    UPDATE crm_proposals
       SET view_count     = view_count + 1,
           viewed_at      = coalesce(viewed_at, now()),
           last_viewed_at = now(),
           status         = CASE WHEN status = 'enviada' THEN 'visualizada' ELSE status END
     WHERE id = p.id
    RETURNING * INTO p;
    IF p.lead_id IS NOT NULL AND p.view_count > 1 THEN
      PERFORM crm_log(p.user_id, p.lead_id, 'proposta',
        'O cliente abriu a proposta "' || p.title || '" de novo (' || p.view_count || 'ª vez)',
        jsonb_build_object('proposal_id', p.id, 'view', p.view_count));
    END IF;
  END IF;

  SELECT jsonb_build_object('name', l.name, 'company', l.company)
    INTO v_lead FROM crm_leads l WHERE l.id = p.lead_id;

  RETURN jsonb_build_object(
    'title',           p.title,
    'intro',           p.intro,
    'items',           p.items,
    'discount',        p.discount,
    'total',           p.total,
    'options',         p.options,
    'accepted_option', p.accepted_option,
    'valid_until',     p.valid_until,
    'payment_terms',   p.payment_terms,
    'payment_plan',    p.payment_plan,
    'pdf_url',         p.pdf_url,
    'pdf_name',        p.pdf_name,
    'status',          p.status,
    'expired',         p.status IN ('enviada', 'visualizada') AND p.valid_until IS NOT NULL AND p.valid_until < v_today,
    'sent_at',         p.sent_at,
    'responded_at',    p.responded_at,
    'responder_name',  p.responder_name,
    'content_hash',    p.content_hash,
    'lead',            v_lead,
    'agency',          crm_agency_public(p.user_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_bill_oneoff_contract(p_contract uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ct        crm_contracts;
  v_items   jsonb;
  v_disc    numeric;
  v_total   numeric;
  v_plan    jsonb;
  v_rec     numeric := 0;
  v_one     numeric := 0;
  v_client  uuid;
  v_who     text;
  v_label   text;
  v_due     date;
  v_id      uuid;
  v_n       int;
  v_ent     numeric;
  v_parc    numeric;
  v_first   date;
  v_cat     uuid;
  it        jsonb;
BEGIN
  SELECT * INTO ct FROM crm_contracts WHERE id = p_contract;
  IF NOT FOUND OR ct.status <> 'assinado' OR ct.proposal_id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM fin_entries WHERE contract_id = ct.id)
     OR EXISTS (SELECT 1 FROM fin_recurrences WHERE contract_id = ct.id) THEN
    RETURN NULL;
  END IF;

  SELECT items, coalesce(discount, 0), total, payment_plan INTO v_items, v_disc, v_total, v_plan
  FROM crm_proposals WHERE id = ct.proposal_id;

  SELECT l.converted_client_id, coalesce(nullif(l.company, ''), l.name)
    INTO v_client, v_who FROM crm_leads l WHERE l.id = ct.lead_id;
  v_who   := coalesce(v_who, ct.signer_name, 'Cliente');
  v_label := coalesce((SELECT company_name FROM clients WHERE id = v_client), v_who);
  v_due   := coalesce(ct.signed_at, now())::date;
  v_cat   := (SELECT id FROM fin_categories WHERE user_id = ct.user_id AND system_key = 'projetos' LIMIT 1);

  -- Entrada + parcelas: entrada no mês da assinatura, parcelas como recorrência com fim
  IF v_plan->>'mode' = 'parcelado' THEN
    v_n   := greatest(coalesce(nullif(v_plan->>'parcelas', '')::int, 1), 1);
    v_ent := greatest(coalesce(nullif(v_plan->>'entrada', '')::numeric, 0), 0);
    IF coalesce(v_total, 0) <= 0 OR v_ent >= v_total THEN RETURN NULL; END IF;
    v_parc  := round((v_total - v_ent) / v_n, 2);
    v_ent   := v_total - v_parc * v_n;   -- centavos do arredondamento ficam na entrada
    v_first := coalesce(nullif(v_plan->>'primeiro_vencimento', '')::date, (v_due + interval '1 month')::date);

    IF v_ent > 0 THEN
      INSERT INTO fin_entries (user_id, type, description, amount, due_date, competence, status,
                               account_id, category_id, client_id, counterparty, contract_id,
                               installment, installments, notes)
      VALUES (ct.user_id, 'receita', ct.title || ' · Entrada · ' || v_label,
              v_ent, v_due, date_trunc('month', v_due)::date, 'aberto',
              public.fin_default_account(ct.user_id), v_cat,
              v_client, CASE WHEN v_client IS NULL THEN v_who END, ct.id,
              1, 1, 'Entrada do contrato assinado no CRM.')
      RETURNING id INTO v_id;
    END IF;

    INSERT INTO fin_recurrences (user_id, type, description, amount, category_id, account_id,
                                 client_id, counterparty, interval_months, day_of_month,
                                 start_date, end_date, is_active, source, contract_id)
    VALUES (ct.user_id, 'receita', ct.title || ' · Parcelas (' || v_n || 'x) · ' || v_label,
            v_parc, v_cat, public.fin_default_account(ct.user_id),
            v_client, CASE WHEN v_client IS NULL THEN v_who END, 1, EXTRACT(day FROM v_first)::int,
            v_first, (v_first + make_interval(months => v_n - 1))::date, true, 'contrato', ct.id)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

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

  INSERT INTO fin_entries (user_id, type, description, amount, due_date, competence, status,
                           account_id, category_id, client_id, counterparty, contract_id,
                           installment, installments, notes)
  VALUES (ct.user_id, 'receita', ct.title || ' · ' || v_label,
          v_one, v_due, date_trunc('month', v_due)::date, 'aberto',
          public.fin_default_account(ct.user_id), v_cat,
          v_client, CASE WHEN v_client IS NULL THEN v_who END, ct.id,
          1, 1, 'Gerado do contrato assinado no CRM.')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_bill_oneoff_contract(uuid) FROM PUBLIC, anon, authenticated;
