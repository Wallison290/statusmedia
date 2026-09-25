-- ── 074: CRM — propostas com aceite pelo link e contratos com assinatura ──────
-- Depende da 073. Idempotente.
--
-- A ideia veio do Sistema (api-proposta / api-contrato), adaptada ao Supabase:
--   • o cliente abre um link público, sem login, e responde ali mesmo;
--   • o link só vale com o `public_token` (um uuid aleatório), nunca com o id;
--   • a resposta grava a PROVA do que foi aceito/assinado: um sha256 do
--     conteúdo naquele instante, data, IP e navegador. Editar depois não apaga
--     a evidência, porque o banco bloqueia a edição de documento já respondido.
--
-- As páginas públicas não leem as tabelas: chamam funções SECURITY DEFINER que
-- validam o token e devolvem só o que o cliente pode ver (mesmo padrão da 066).

-- ── 1. Propostas ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_proposals (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id        uuid          REFERENCES crm_leads(id) ON DELETE SET NULL,

  title          text          NOT NULL,
  intro          text,                          -- texto de abertura, visível ao cliente
  items          jsonb         NOT NULL DEFAULT '[]'::jsonb,  -- [{description, details, quantity, unit_price, recurring}]
  discount       numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,  -- recalculado pelo banco a cada gravação
  valid_until    date,
  payment_terms  text,
  internal_notes text,                          -- só a agência vê

  status         text          NOT NULL DEFAULT 'rascunho'
                               CHECK (status IN ('rascunho', 'enviada', 'visualizada', 'aceita', 'recusada')),
  public_token   uuid          NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  sent_at        timestamptz,
  viewed_at      timestamptz,
  view_count     integer       NOT NULL DEFAULT 0,
  responded_at   timestamptz,
  responder_name text,
  reject_reason  text,
  content_hash   text,
  response_meta  jsonb,

  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE crm_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency manages own proposals" ON crm_proposals;
CREATE POLICY "Agency manages own proposals"
  ON crm_proposals FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS crm_proposals_user_idx ON crm_proposals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_proposals_lead_idx ON crm_proposals (lead_id) WHERE lead_id IS NOT NULL;

-- O conteúdo que o cliente vê — é sobre ele que o hash de aceite é calculado.
CREATE OR REPLACE FUNCTION public.crm_proposal_content(p crm_proposals)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'title', p.title, 'intro', p.intro, 'items', p.items, 'discount', p.discount,
    'total', p.total, 'valid_until', p.valid_until, 'payment_terms', p.payment_terms
  )::text;
$$;

CREATE OR REPLACE FUNCTION public.crm_proposal_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sum numeric := 0;
BEGIN
  -- Documento respondido é prova: não muda mais. Para ajustar, duplica.
  IF TG_OP = 'UPDATE' AND OLD.status IN ('aceita', 'recusada')
     AND crm_proposal_content(NEW) IS DISTINCT FROM crm_proposal_content(OLD) THEN
    RAISE EXCEPTION 'Esta proposta já foi respondida pelo cliente e não pode mais ser alterada. Duplique para criar uma nova versão.';
  END IF;

  IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' THEN
    NEW.items := '[]'::jsonb;
  END IF;

  -- Total calculado aqui, não confiado ao navegador: é o valor que o cliente aceita
  SELECT coalesce(sum(
           greatest(coalesce((i->>'quantity')::numeric, 1), 0)
         * greatest(coalesce((i->>'unit_price')::numeric, 0), 0)
         ), 0)
    INTO v_sum
    FROM jsonb_array_elements(NEW.items) i;

  NEW.discount := greatest(coalesce(NEW.discount, 0), 0);
  NEW.total    := greatest(v_sum - NEW.discount, 0);
  NEW.updated_at := now();

  IF NEW.status = 'enviada' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_proposals_before_write ON crm_proposals;
CREATE TRIGGER crm_proposals_before_write
  BEFORE INSERT OR UPDATE ON crm_proposals
  FOR EACH ROW EXECUTE FUNCTION public.crm_proposal_before_write();

-- Histórico, avisos e automações nascem das mudanças de status — num só lugar,
-- venha a mudança da tela da agência ou do link do cliente.
CREATE OR REPLACE FUNCTION public.crm_proposal_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_name  text;
  v_total_txt  text := 'R$ ' || to_char(NEW.total, 'FM999G999G990D00');
  v_won_column uuid;
  v_column     uuid;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT name, column_id INTO v_lead_name, v_column FROM crm_leads WHERE id = NEW.lead_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      PERFORM crm_log(NEW.user_id, NEW.lead_id, 'proposta',
        'Proposta criada: "' || NEW.title || '" (' || v_total_txt || ')',
        jsonb_build_object('proposal_id', NEW.id, 'status', NEW.status));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    PERFORM crm_log(NEW.user_id, NEW.lead_id, 'proposta',
      CASE NEW.status
        WHEN 'enviada'     THEN 'Proposta enviada: "' || NEW.title || '"'
        WHEN 'visualizada' THEN 'O cliente abriu a proposta "' || NEW.title || '"'
        WHEN 'aceita'      THEN 'Proposta aceita por ' || coalesce(NEW.responder_name, 'cliente') || ' (' || v_total_txt || ')'
        WHEN 'recusada'    THEN 'Proposta recusada' || coalesce(': ' || NEW.reject_reason, '')
        ELSE 'Proposta voltou para rascunho'
      END,
      jsonb_build_object('proposal_id', NEW.id, 'status', NEW.status));
  END IF;

  IF NEW.status = 'visualizada' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_PROPOSAL_VIEWED',
      'Proposta aberta agora',
      coalesce(v_lead_name, 'O cliente') || ' está vendo a proposta "' || NEW.title || '". Bom momento para um contato.',
      NEW.lead_id);
    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'proposta_visualizada', v_column, 'prop:' || NEW.id);

  ELSIF NEW.status = 'aceita' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_PROPOSAL_ACCEPTED',
      'Proposta aceita! 🎉',
      coalesce(NEW.responder_name, v_lead_name, 'O cliente') || ' aceitou "' || NEW.title || '" (' || v_total_txt || ').',
      NEW.lead_id);

    -- O card anda sozinho para a primeira etapa de ganho e passa a valer o
    -- total aceito. Se o lead já estiver numa etapa de ganho, fica onde está.
    IF NEW.lead_id IS NOT NULL THEN
      SELECT c.id INTO v_won_column
      FROM crm_columns c
      WHERE c.user_id = NEW.user_id AND c.stage_type = 'ganho'
      ORDER BY c.position
      LIMIT 1;

      UPDATE crm_leads l
         SET estimated_value = NEW.total,
             column_id = CASE
               WHEN v_won_column IS NULL THEN l.column_id
               WHEN EXISTS (SELECT 1 FROM crm_columns c WHERE c.id = l.column_id AND c.stage_type = 'ganho') THEN l.column_id
               ELSE v_won_column
             END,
             position = CASE WHEN v_won_column IS NULL THEN l.position ELSE 0 END
       WHERE l.id = NEW.lead_id;
    END IF;

    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'proposta_aceita', v_column, 'prop:' || NEW.id);

  ELSIF NEW.status = 'recusada' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_PROPOSAL_REJECTED',
      'Proposta recusada',
      coalesce(v_lead_name, 'O cliente') || ' recusou "' || NEW.title || '"'
        || coalesce('. Motivo: ' || NEW.reject_reason, '.'),
      NEW.lead_id);
    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'proposta_recusada', v_column, 'prop:' || NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_proposals_after_write ON crm_proposals;
CREATE TRIGGER crm_proposals_after_write
  AFTER INSERT OR UPDATE ON crm_proposals
  FOR EACH ROW EXECUTE FUNCTION public.crm_proposal_after_write();

-- ── 2. Contratos ──────────────────────────────────────────────────────────────
-- Assinatura eletrônica simples: nome completo, CPF/CNPJ, e-mail, rubrica
-- desenhada e o aceite, mais IP, navegador, data e o hash do texto. A agência
-- também pode assinar (rubrica própria) antes de enviar.

CREATE TABLE IF NOT EXISTS crm_contracts (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id                uuid        REFERENCES crm_leads(id) ON DELETE SET NULL,
  proposal_id            uuid        REFERENCES crm_proposals(id) ON DELETE SET NULL,

  title                  text        NOT NULL,
  content                text        NOT NULL DEFAULT '',

  status                 text        NOT NULL DEFAULT 'rascunho'
                                     CHECK (status IN ('rascunho', 'enviado', 'assinado', 'cancelado')),
  public_token           uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),

  agency_signer_name     text,
  agency_signature       text,       -- PNG em data URL
  agency_signed_at       timestamptz,

  sent_at                timestamptz,
  viewed_at              timestamptz,
  signer_name            text,
  signer_document        text,
  signer_email           text,
  signature              text,       -- PNG em data URL
  signed_at              timestamptz,
  content_hash           text,
  sign_meta              jsonb,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  -- Uma rubrica desenhada cabe folgada em 300 KB; mais que isso é abuso
  CONSTRAINT crm_contracts_signature_size CHECK (length(coalesce(signature, '')) <= 300000),
  CONSTRAINT crm_contracts_agency_signature_size CHECK (length(coalesce(agency_signature, '')) <= 300000)
);

ALTER TABLE crm_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency manages own contracts" ON crm_contracts;
CREATE POLICY "Agency manages own contracts"
  ON crm_contracts FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS crm_contracts_user_idx ON crm_contracts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_contracts_lead_idx ON crm_contracts (lead_id) WHERE lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_contract_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'assinado' AND (
       NEW.content IS DISTINCT FROM OLD.content
    OR NEW.title   IS DISTINCT FROM OLD.title
    OR NEW.status  IS DISTINCT FROM OLD.status
    OR NEW.signature IS DISTINCT FROM OLD.signature
    OR NEW.agency_signature IS DISTINCT FROM OLD.agency_signature
  ) THEN
    RAISE EXCEPTION 'Contrato assinado não pode ser alterado.';
  END IF;

  -- Enviado: o texto já está com o cliente. Mudar agora faria ele assinar algo
  -- diferente do que leu; é preciso voltar para rascunho antes.
  IF TG_OP = 'UPDATE' AND OLD.status = 'enviado' AND NEW.status = 'enviado'
     AND NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'Contrato já enviado. Volte para rascunho antes de editar o texto.';
  END IF;

  IF NEW.agency_signature IS NOT NULL AND NEW.agency_signed_at IS NULL THEN
    NEW.agency_signed_at := now();
  ELSIF NEW.agency_signature IS NULL THEN
    NEW.agency_signed_at := NULL;
  END IF;

  IF NEW.status = 'enviado' AND NEW.sent_at IS NULL THEN
    NEW.sent_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_contracts_before_write ON crm_contracts;
CREATE TRIGGER crm_contracts_before_write
  BEFORE INSERT OR UPDATE ON crm_contracts
  FOR EACH ROW EXECUTE FUNCTION public.crm_contract_before_write();

CREATE OR REPLACE FUNCTION public.crm_contract_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_name text;
  v_column    uuid;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT name, column_id INTO v_lead_name, v_column FROM crm_leads WHERE id = NEW.lead_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.lead_id IS NOT NULL THEN
      PERFORM crm_log(NEW.user_id, NEW.lead_id, 'contrato',
        'Contrato criado: "' || NEW.title || '"',
        jsonb_build_object('contract_id', NEW.id, 'status', NEW.status));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    PERFORM crm_log(NEW.user_id, NEW.lead_id, 'contrato',
      CASE NEW.status
        WHEN 'enviado'   THEN 'Contrato enviado para assinatura: "' || NEW.title || '"'
        WHEN 'assinado'  THEN 'Contrato assinado por ' || coalesce(NEW.signer_name, 'cliente')
        WHEN 'cancelado' THEN 'Contrato cancelado: "' || NEW.title || '"'
        ELSE 'Contrato voltou para rascunho'
      END,
      jsonb_build_object('contract_id', NEW.id, 'status', NEW.status));
  END IF;

  IF NEW.status = 'assinado' THEN
    PERFORM crm_notify(NEW.user_id, 'CRM_CONTRACT_SIGNED',
      'Contrato assinado! ✍️',
      coalesce(NEW.signer_name, v_lead_name, 'O cliente') || ' assinou "' || NEW.title || '".',
      NEW.lead_id);
    PERFORM crm_run_automations(NEW.user_id, NEW.lead_id, 'contrato_assinado', v_column, 'contr:' || NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_contracts_after_write ON crm_contracts;
CREATE TRIGGER crm_contracts_after_write
  AFTER INSERT OR UPDATE ON crm_contracts
  FOR EACH ROW EXECUTE FUNCTION public.crm_contract_after_write();

-- ── 3. Auxiliares das páginas públicas ────────────────────────────────────────

-- IP e navegador de quem respondeu. O PostgREST expõe os cabeçalhos da
-- requisição; fora dele (SQL Editor, testes) volta vazio sem erro.
CREATE OR REPLACE FUNCTION public.crm_request_meta()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers json;
BEGIN
  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  RETURN jsonb_build_object(
    'ip',         split_part(coalesce(v_headers->>'x-forwarded-for', v_headers->>'x-real-ip', ''), ',', 1),
    'user_agent', left(coalesce(v_headers->>'user-agent', ''), 400),
    'at',         now()
  );
END;
$$;

-- Nome e logo da agência para o cabeçalho das páginas públicas
CREATE OR REPLACE FUNCTION public.crm_agency_public(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', coalesce(nullif(p.agency_name, ''), nullif(p.full_name, ''), 'Agência'),
    'logo', p.avatar_url
  )
  FROM profiles p WHERE p.id = p_user;
$$;

REVOKE ALL ON FUNCTION public.crm_agency_public(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Proposta pública ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_crm_proposal(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p        crm_proposals;
  v_today  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_lead   jsonb;
BEGIN
  SELECT * INTO p FROM crm_proposals WHERE public_token = p_token;
  -- Rascunho não existe para o cliente: o link só passa a valer quando enviado
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
    'title',          p.title,
    'intro',          p.intro,
    'items',          p.items,
    'discount',       p.discount,
    'total',          p.total,
    'valid_until',    p.valid_until,
    'payment_terms',  p.payment_terms,
    'status',         p.status,
    'expired',        p.status IN ('enviada', 'visualizada') AND p.valid_until IS NOT NULL AND p.valid_until < v_today,
    'sent_at',        p.sent_at,
    'responded_at',   p.responded_at,
    'responder_name', p.responder_name,
    'content_hash',   p.content_hash,
    'lead',           v_lead,
    'agency',         crm_agency_public(p.user_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_proposal(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.respond_crm_proposal(
  p_token uuid, p_accept boolean, p_name text, p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p       crm_proposals;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_name  text := left(btrim(coalesce(p_name, '')), 150);
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

  UPDATE crm_proposals
     SET status         = CASE WHEN p_accept THEN 'aceita' ELSE 'recusada' END,
         responded_at   = now(),
         responder_name = v_name,
         reject_reason  = CASE WHEN p_accept THEN NULL ELSE nullif(left(btrim(coalesce(p_reason, '')), 1000), '') END,
         content_hash   = encode(sha256(convert_to(crm_proposal_content(p), 'UTF8')), 'hex'),
         response_meta  = crm_request_meta()
   WHERE id = p.id;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_accept THEN 'aceita' ELSE 'recusada' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_crm_proposal(uuid, boolean, text, text) TO anon, authenticated;

-- ── 5. Contrato público ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_crm_contract(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c crm_contracts;
BEGIN
  SELECT * INTO c FROM crm_contracts WHERE public_token = p_token;
  IF NOT FOUND OR c.status IN ('rascunho', 'cancelado') THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS DISTINCT FROM c.user_id AND c.viewed_at IS NULL THEN
    UPDATE crm_contracts SET viewed_at = now() WHERE id = c.id;
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
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_contract(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.sign_crm_contract(
  p_token uuid, p_name text, p_document text, p_email text, p_signature text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c      crm_contracts;
  v_name text := left(btrim(coalesce(p_name, '')), 150);
  v_doc  text := regexp_replace(coalesce(p_document, ''), '\D', '', 'g');
  v_mail text := lower(left(btrim(coalesce(p_email, '')), 200));
BEGIN
  SELECT * INTO c FROM crm_contracts WHERE public_token = p_token FOR UPDATE;
  IF NOT FOUND OR c.status IN ('rascunho', 'cancelado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contrato não encontrado.');
  END IF;
  IF c.status = 'assinado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Este contrato já foi assinado.');
  END IF;
  IF length(v_name) < 5 OR position(' ' IN v_name) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe o nome completo.');
  END IF;
  IF length(v_doc) NOT IN (11, 14) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CPF ou CNPJ inválido.');
  END IF;
  IF v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'E-mail inválido.');
  END IF;
  IF p_signature IS NULL OR p_signature NOT LIKE 'data:image/png;base64,%' OR length(p_signature) > 300000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Faça sua rubrica no quadro de assinatura.');
  END IF;

  UPDATE crm_contracts
     SET status          = 'assinado',
         signer_name     = v_name,
         signer_document = v_doc,
         signer_email    = v_mail,
         signature       = p_signature,
         signed_at       = now(),
         content_hash    = encode(sha256(convert_to(c.content, 'UTF8')), 'hex'),
         sign_meta       = crm_request_meta()
   WHERE id = c.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_crm_contract(uuid, text, text, text, text) TO anon, authenticated;
