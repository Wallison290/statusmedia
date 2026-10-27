-- ── 107: proposta em PDF anexado ─────────────────────────────────────────────
-- A agência pode anexar um PDF pronto no lugar de montar a proposta no
-- sistema. O link, a contagem de aberturas e o aceite são os mesmos; o valor
-- (opcional) vai como um item único, então total, card e ganho continuam
-- funcionando sem mudança.

ALTER TABLE public.crm_proposals
  ADD COLUMN IF NOT EXISTS pdf_url  text,
  ADD COLUMN IF NOT EXISTS pdf_name text;

-- O PDF entra no conteúdo protegido: proposta respondida não troca de arquivo.
-- Só aparece quando existe, para os códigos de aceite antigos continuarem batendo.
CREATE OR REPLACE FUNCTION public.crm_proposal_content(p crm_proposals)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT (jsonb_build_object(
    'title', p.title, 'intro', p.intro, 'items', p.items, 'discount', p.discount,
    'total', p.total, 'valid_until', p.valid_until, 'payment_terms', p.payment_terms,
    'options', p.options, 'accepted_option', p.accepted_option
  ) || CASE WHEN p.pdf_url IS NOT NULL THEN jsonb_build_object('pdf_url', p.pdf_url) ELSE '{}'::jsonb END)::text;
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
  IF NOT FOUND OR p.status = 'rascunho' THEN
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

GRANT EXECUTE ON FUNCTION public.get_crm_proposal(uuid) TO anon, authenticated;
