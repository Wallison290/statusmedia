-- ─────────────────────────────────────────────────────────────────────────────
-- 097 · Proposta com várias opções no mesmo envio
--
-- Um link, várias opções (ex.: Essencial / Completo / Premium). O cliente
-- escolhe uma e aceita. options = [] continua sendo a proposta de uma opção só.
--
-- options: [{ id, name, description, items[], discount, recommended, total }]
--   total de cada opção é calculado aqui (não confiado ao navegador).
-- items / discount / total da proposta = a opção "representante":
--   antes da resposta, a recomendada (ou a primeira); depois do aceite, a
--   escolhida. Assim lista, valor do lead, contrato e Financeiro continuam
--   lendo items/total como sempre.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.crm_proposals
  ADD COLUMN IF NOT EXISTS options         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS accepted_option text;

CREATE OR REPLACE FUNCTION public.crm_items_sum(p_items jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(sum(
           greatest(coalesce((i->>'quantity')::numeric, 1), 0)
         * greatest(coalesce((i->>'unit_price')::numeric, 0), 0)), 0)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) i
$$;

-- O que o cliente vê (base do código de aceite): agora com as opções e a escolhida
CREATE OR REPLACE FUNCTION public.crm_proposal_content(p crm_proposals)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'title', p.title, 'intro', p.intro, 'items', p.items, 'discount', p.discount,
    'total', p.total, 'valid_until', p.valid_until, 'payment_terms', p.payment_terms,
    'options', p.options, 'accepted_option', p.accepted_option
  )::text;
$$;

CREATE OR REPLACE FUNCTION public.crm_proposal_before_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_opts jsonb := '[]'::jsonb;
  o      jsonb;
  v_rep  jsonb;
  v_disc numeric;
BEGIN
  -- Documento respondido é prova: não muda mais. Para ajustar, duplica.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('aceita', 'recusada')
     AND crm_proposal_content(NEW) IS DISTINCT FROM crm_proposal_content(OLD) THEN
    RAISE EXCEPTION 'Esta proposta já foi respondida pelo cliente e não pode mais ser alterada. Duplique para criar uma nova versão.';
  END IF;

  IF jsonb_typeof(NEW.items)   IS DISTINCT FROM 'array' THEN NEW.items   := '[]'::jsonb; END IF;
  IF jsonb_typeof(NEW.options) IS DISTINCT FROM 'array' THEN NEW.options := '[]'::jsonb; END IF;

  -- Opções: total de cada uma calculado aqui
  IF jsonb_array_length(NEW.options) > 0 THEN
    FOR o IN SELECT * FROM jsonb_array_elements(NEW.options) LOOP
      v_disc := greatest(coalesce((o->>'discount')::numeric, 0), 0);
      v_opts := v_opts || jsonb_build_array(o
        || jsonb_build_object('discount', v_disc,
                              'total', greatest(crm_items_sum(o->'items') - v_disc, 0)));
    END LOOP;
    NEW.options := v_opts;

    -- Representante: a escolhida (depois do aceite), senão a recomendada, senão a primeira
    SELECT x INTO v_rep FROM jsonb_array_elements(v_opts) x
    ORDER BY (x->>'id' = NEW.accepted_option) DESC NULLS LAST,
             coalesce((x->>'recommended')::boolean, false) DESC
    LIMIT 1;
    NEW.items    := coalesce(v_rep->'items', '[]'::jsonb);
    NEW.discount := coalesce((v_rep->>'discount')::numeric, 0);
  ELSE
    NEW.accepted_option := NULL;
  END IF;

  NEW.discount := greatest(coalesce(NEW.discount, 0), 0);
  NEW.total    := greatest(crm_items_sum(NEW.items) - NEW.discount, 0);
  NEW.updated_at := now();

  IF NEW.status = 'enviada' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- ── Página pública ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_crm_proposal(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p        crm_proposals;
  v_today  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_lead   jsonb;
BEGIN
  SELECT * INTO p FROM crm_proposals WHERE public_token = p_token;
  IF NOT FOUND OR p.status = 'rascunho' THEN
    RETURN NULL;
  END IF;

  -- A própria agência abrindo o link para conferir não conta como visita
  IF auth.uid() IS DISTINCT FROM p.user_id THEN
    UPDATE crm_proposals
       SET view_count = view_count + 1,
           viewed_at  = coalesce(viewed_at, now()),
           status     = CASE WHEN status = 'enviada' THEN 'visualizada' ELSE status END
     WHERE id = p.id
    RETURNING * INTO p;
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
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_proposal(uuid) TO anon, authenticated;

-- Resposta: com opções, o aceite exige a opção escolhida
DROP FUNCTION IF EXISTS public.respond_crm_proposal(uuid, boolean, text, text);
CREATE OR REPLACE FUNCTION public.respond_crm_proposal(
  p_token uuid, p_accept boolean, p_name text, p_reason text DEFAULT NULL, p_option text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p       crm_proposals;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_name  text := left(btrim(coalesce(p_name, '')), 150);
  v_opt   jsonb;
BEGIN
  -- FOR UPDATE: dois cliques simultâneos não geram duas respostas
  SELECT * INTO p FROM crm_proposals WHERE public_token = p_token FOR UPDATE;
  IF NOT FOUND OR p.status = 'rascunho' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Proposta não encontrada.');
  END IF;
  IF p.status IN ('aceita', 'recusada') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta proposta já foi respondida.');
  END IF;
  IF p.valid_until IS NOT NULL AND p.valid_until < v_today THEN
    RETURN jsonb_build_object('ok', false, 'error', 'O prazo desta proposta terminou. Fale com a agência para receber uma nova.');
  END IF;
  IF length(v_name) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe seu nome completo.');
  END IF;

  IF p_accept AND jsonb_array_length(p.options) > 0 THEN
    SELECT x INTO v_opt FROM jsonb_array_elements(p.options) x WHERE x->>'id' = p_option;
    IF v_opt IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Escolha uma das opções antes de aceitar.');
    END IF;
    -- O que fica registrado (e no código de aceite) é a opção escolhida
    p.accepted_option := v_opt->>'id';
    p.items           := v_opt->'items';
    p.discount        := (v_opt->>'discount')::numeric;
    p.total           := (v_opt->>'total')::numeric;
  END IF;

  UPDATE crm_proposals
     SET status          = CASE WHEN p_accept THEN 'aceita' ELSE 'recusada' END,
         accepted_option = p.accepted_option,
         responded_at    = now(),
         responder_name  = v_name,
         reject_reason   = CASE WHEN p_accept THEN NULL ELSE nullif(left(btrim(coalesce(p_reason, '')), 1000), '') END,
         content_hash    = encode(sha256(convert_to(crm_proposal_content(p), 'UTF8')), 'hex'),
         response_meta   = crm_request_meta()
   WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_accept THEN 'aceita' ELSE 'recusada' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_crm_proposal(uuid, boolean, text, text, text) TO anon, authenticated;
