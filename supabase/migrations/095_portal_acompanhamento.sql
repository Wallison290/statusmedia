-- ─────────────────────────────────────────────────────────────────────────────
-- 095 · Acompanhamento do acesso ao portal do cliente
--
-- A agência criava o cliente e ficava no escuro: o convite saiu? O cliente
-- criou a senha? Já entrou alguma vez? Agora:
--   • client_portal_events: linha do tempo do acesso de cada cliente
--     (convite enviado/reenviado/falhou pela Edge Function invite-client;
--      senha criada e primeiro acesso por trigger em auth.users).
--   • client_portal_status(cliente) e client_portal_status_all(): situação
--     atual, lida direto do Auth (convidado em, senha criada, último acesso).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_portal_events (
  id          BIGSERIAL   PRIMARY KEY,
  client_id   UUID        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,              -- agência
  kind        TEXT        NOT NULL CHECK (kind IN
                ('convite_enviado', 'convite_reenviado', 'convite_falhou', 'senha_criada', 'primeiro_acesso')),
  email       TEXT,
  detail      TEXT,
  actor_name  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_portal_events_client_idx ON public.client_portal_events (client_id, at DESC);

ALTER TABLE public.client_portal_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_portal_events_read ON public.client_portal_events;
CREATE POLICY client_portal_events_read ON public.client_portal_events
  FOR SELECT USING (user_id = auth.uid() OR public.is_agency_member(user_id));

-- ── 1. Senha criada / primeiro acesso, registrados pelo próprio Auth ────────
CREATE OR REPLACE FUNCTION public.trg_portal_auth_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client UUID;
  v_agency UUID;
BEGIN
  -- Cliente convidado (dados do convite) ou que se cadastrou sozinho (perfil)
  SELECT COALESCE(NULLIF(NEW.raw_user_meta_data->>'linked_client_id', '')::UUID,
                  (SELECT linked_client_id FROM profiles WHERE id = NEW.id AND role = 'client'))
  INTO v_client;
  IF v_client IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_agency FROM clients WHERE id = v_client;
  IF v_agency IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(OLD.raw_user_meta_data->>'needs_password_setup', '') = 'true'
     AND COALESCE(NEW.raw_user_meta_data->>'needs_password_setup', '') = 'false' THEN
    INSERT INTO client_portal_events (client_id, user_id, kind, email)
    VALUES (v_client, v_agency, 'senha_criada', NEW.email);
  END IF;

  IF OLD.last_sign_in_at IS NULL AND NEW.last_sign_in_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM client_portal_events WHERE client_id = v_client AND kind = 'primeiro_acesso' AND email = NEW.email) THEN
    INSERT INTO client_portal_events (client_id, user_id, kind, email)
    VALUES (v_client, v_agency, 'primeiro_acesso', NEW.email);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- registro é secundário: nunca atrapalha o login do cliente
END;
$$;

DROP TRIGGER IF EXISTS trg_portal_auth_events ON auth.users;
CREATE TRIGGER trg_portal_auth_events
  AFTER UPDATE OF raw_user_meta_data, last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_portal_auth_events();

-- ── 2. Situação atual ────────────────────────────────────────────────────────
-- state: sem_email | nao_convidado | aguardando_senha | ativo | conta_externa
--   conta_externa = o e-mail do cliente já é login de outra pessoa (agência,
--   outro cliente): o convite não pode ser enviado para ele.
CREATE OR REPLACE FUNCTION public.portal_state_for(p_client UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  c  clients;
  u  auth.users;
  st TEXT;
BEGIN
  SELECT * INTO c FROM clients WHERE id = p_client;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NULLIF(trim(c.email), '') IS NULL THEN
    RETURN jsonb_build_object('client_id', c.id, 'state', 'sem_email');
  END IF;

  -- Conta do cliente: a ligada a ele (pelo perfil, no cadastro próprio, ou
  -- pelos dados do convite); senão, a do e-mail cadastrado
  SELECT au.* INTO u FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE (p.role = 'client' AND p.linked_client_id = c.id)
     OR au.raw_user_meta_data->>'linked_client_id' = c.id::text
  ORDER BY (lower(au.email) = lower(trim(c.email))) DESC, au.last_sign_in_at DESC NULLS LAST, au.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO u FROM auth.users WHERE lower(email) = lower(trim(c.email)) LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('client_id', c.id, 'state', 'conta_externa', 'email', c.email);
    END IF;
  END IF;

  IF u.id IS NULL THEN
    RETURN jsonb_build_object('client_id', c.id, 'state', 'nao_convidado', 'email', c.email);
  END IF;

  st := CASE WHEN COALESCE(u.raw_user_meta_data->>'needs_password_setup', 'false') = 'true'
             THEN 'aguardando_senha' ELSE 'ativo' END;

  RETURN jsonb_build_object(
    'client_id',       c.id,
    'state',           st,
    'email',           u.email,
    'email_differs',   lower(u.email) <> lower(trim(c.email)),
    'invited_at',      u.invited_at,
    'password_set_at', (SELECT max(at) FROM client_portal_events e WHERE e.client_id = c.id AND e.kind = 'senha_criada'),
    'last_sign_in_at', u.last_sign_in_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.client_portal_status(p_client UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agency UUID;
BEGIN
  SELECT user_id INTO v_agency FROM clients WHERE id = p_client;
  IF v_agency IS NULL OR NOT (v_agency = auth.uid() OR public.is_agency_member(v_agency)) THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  RETURN public.portal_state_for(p_client);
END;
$$;

-- Lista: situação de todos os clientes da agência de quem chama
CREATE OR REPLACE FUNCTION public.client_portal_status_all()
RETURNS SETOF JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.portal_state_for(c.id) FROM clients c
  WHERE c.user_id = public.current_agency_id()
$$;

REVOKE EXECUTE ON FUNCTION public.portal_state_for(UUID)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_portal_auth_events()      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.client_portal_status(UUID)    TO authenticated;
GRANT  EXECUTE ON FUNCTION public.client_portal_status_all()    TO authenticated;

-- ── 3. Histórico: quem já tem acesso ganha o registro do que já aconteceu ──
INSERT INTO public.client_portal_events (client_id, user_id, kind, email, detail, at)
SELECT c.id, c.user_id, 'convite_enviado', u.email, 'registrado a partir do histórico do Auth', u.invited_at
FROM auth.users u JOIN public.clients c ON c.id::text = u.raw_user_meta_data->>'linked_client_id'
WHERE u.invited_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.client_portal_events e WHERE e.client_id = c.id);

INSERT INTO public.client_portal_events (client_id, user_id, kind, email, detail, at)
SELECT c.id, c.user_id, 'primeiro_acesso', u.email, 'registrado a partir do histórico do Auth', COALESCE(u.last_sign_in_at, u.created_at)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
JOIN public.clients c ON c.id::text = u.raw_user_meta_data->>'linked_client_id' OR (p.role = 'client' AND p.linked_client_id = c.id)
WHERE u.last_sign_in_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.client_portal_events e WHERE e.client_id = c.id AND e.kind = 'primeiro_acesso');
