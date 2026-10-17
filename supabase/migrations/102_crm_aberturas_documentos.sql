-- ─────────────────────────────────────────────────────────────────────────────
-- 102 · Cada abertura do contrato e da proposta pelo cliente
--
-- Antes o contrato guardava só a primeira abertura (viewed_at) e a proposta só
-- somava view_count, sem horários. Agora cada abertura vira uma linha em
-- crm_doc_views (data, hora, IP e navegador), o documento guarda total e
-- última abertura, e o histórico do lead registra cada uma.
--
-- Regras:
--   • quem é da agência (dono ou sócio, logado) abrindo o link não conta.
--     Visitante sem login faz is_agency_member devolver NULL (não false): o
--     coalesce é o que faz o cliente contar. Sem ele o contrato nunca
--     registrava a abertura;
--   • recarregar a página não infla o número: nova abertura só conta 30 min
--     depois da última registrada para aquele documento.
-- Contratos já abertos ficam com 1 abertura (a primeira, que já existia).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crm_doc_views (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        NOT NULL,
  doc_kind   text        NOT NULL CHECK (doc_kind IN ('contrato', 'proposta')),
  doc_id     uuid        NOT NULL,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  ip         text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS crm_doc_views_doc_idx ON public.crm_doc_views (doc_kind, doc_id, viewed_at DESC);

ALTER TABLE public.crm_doc_views ENABLE ROW LEVEL SECURITY;

-- Só leitura pela agência; quem grava é a função abaixo (SECURITY DEFINER)
DROP POLICY IF EXISTS "Agency reads own doc views" ON public.crm_doc_views;
CREATE POLICY "Agency reads own doc views"
  ON public.crm_doc_views FOR SELECT
  USING (user_id = auth.uid() OR public.is_agency_member(user_id));

ALTER TABLE public.crm_contracts
  ADD COLUMN IF NOT EXISTS view_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

ALTER TABLE public.crm_proposals
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

UPDATE public.crm_contracts
   SET view_count = 1, last_viewed_at = viewed_at
 WHERE viewed_at IS NOT NULL AND view_count = 0;

-- Registra a abertura se a última do documento foi há mais de 30 min.
-- Devolve true quando contou.
CREATE OR REPLACE FUNCTION public.crm_register_view(p_user uuid, p_kind text, p_doc uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta jsonb := crm_request_meta();
BEGIN
  -- Duas abas abrindo juntas não contam duas vezes
  PERFORM pg_advisory_xact_lock(hashtext('crm_doc_view:' || p_doc::text));
  IF EXISTS (
    SELECT 1 FROM crm_doc_views
     WHERE doc_kind = p_kind AND doc_id = p_doc AND viewed_at > now() - interval '30 minutes'
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO crm_doc_views (user_id, doc_kind, doc_id, ip, user_agent)
  VALUES (p_user, p_kind, p_doc, nullif(v_meta->>'ip', ''), nullif(v_meta->>'user_agent', ''));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_register_view(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── Contrato ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_crm_contract(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c crm_contracts;
BEGIN
  SELECT * INTO c FROM crm_contracts WHERE public_token = p_token;
  IF NOT FOUND OR c.status IN ('rascunho', 'cancelado') THEN
    RETURN NULL;
  END IF;

  IF NOT coalesce(public.is_agency_member(c.user_id), false) AND crm_register_view(c.user_id, 'contrato', c.id) THEN
    UPDATE crm_contracts
       SET view_count     = view_count + 1,
           viewed_at      = coalesce(viewed_at, now()),
           last_viewed_at = now()
     WHERE id = c.id
    RETURNING * INTO c;
    IF c.lead_id IS NOT NULL THEN
      PERFORM crm_log(c.user_id, c.lead_id, 'contrato',
        CASE WHEN c.view_count = 1
          THEN 'O cliente abriu o contrato "' || c.title || '"'
          ELSE 'O cliente abriu o contrato "' || c.title || '" de novo (' || c.view_count || 'ª vez)'
        END,
        jsonb_build_object('contract_id', c.id, 'view', c.view_count));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'title',              c.title,
    'content',            c.content,
    'status',             c.status,
    'sent_at',            c.sent_at,
    'agency_signer_name', c.agency_signer_name,
    'agency_signature',   c.agency_signature,
    'agency_signed_at',   c.agency_signed_at,
    'signer_name',        c.signer_name,
    -- Documento mascarado: a página é pública e o link pode ser repassado
    'signer_document',    CASE WHEN c.signer_document IS NULL THEN NULL
                               ELSE '***' || right(c.signer_document, 4) END,
    'signature',          c.signature,
    'signed_at',          c.signed_at,
    'content_hash',       c.content_hash,
    'sign_ip',            c.sign_meta->>'ip',
    'agency',             crm_agency_public(c.user_id)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_crm_contract(uuid) TO anon, authenticated;

-- ── Proposta ─────────────────────────────────────────────────────────────────
-- A primeira abertura já entra no histórico pela troca de status
-- (enviada → visualizada); daqui só saem as seguintes.
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
