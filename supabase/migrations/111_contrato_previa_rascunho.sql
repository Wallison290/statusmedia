-- ── 111: pré-visualizar contrato em rascunho ─────────────────────────────────
-- Igual à proposta (108): a agência abre o link do rascunho e vê a página
-- exatamente como o cliente verá, sem poder assinar (sign_crm_contract segue
-- recusando rascunho). Aberturas da agência não contam.

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
  -- Rascunho só abre para a própria agência (dono ou sócio): é a
  -- pré-visualização de "Ver como o cliente". Para o cliente o link segue fora do ar.
  IF NOT FOUND OR c.status = 'cancelado'
     OR (c.status = 'rascunho' AND NOT coalesce(public.is_agency_member(c.user_id), false)) THEN
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
