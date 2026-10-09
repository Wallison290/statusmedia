-- ─────────────────────────────────────────────────────────────────────────────
-- 096 · Portal: "último acesso" = última atividade, não último login
--
-- auth.users.last_sign_in_at só muda quando o cliente digita e-mail e senha.
-- Quem continua logado no celular abre o portal todo dia sem login novo, e o
-- painel mostrava uma data velha (caso real: login dia 03, uso até dia 07).
-- Enquanto o portal está aberto o app renova a sessão (~1 vez por hora); cada
-- renovação fica em auth.refresh_tokens / auth.sessions. Daqui sai:
--   last_seen_at   → a atividade mais recente (login ou renovação)
--   active_days_30 → em quantos dias diferentes o cliente usou o portal nos
--                    últimos 30 dias (horário de Brasília)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.portal_state_for(p_client UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  c    clients;
  u    auth.users;
  st   TEXT;
  seen TIMESTAMPTZ;
  days INT;
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

  SELECT GREATEST(
    u.last_sign_in_at,
    (SELECT max(GREATEST(s.refreshed_at::timestamptz, s.updated_at)) FROM auth.sessions s WHERE s.user_id = u.id),
    (SELECT max(r.created_at) FROM auth.refresh_tokens r WHERE r.user_id = u.id::text)
  ) INTO seen;

  SELECT count(DISTINCT d) INTO days FROM (
    SELECT (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d
      FROM auth.refresh_tokens r WHERE r.user_id = u.id::text AND r.created_at > now() - interval '30 days'
    UNION
    SELECT (u.last_sign_in_at AT TIME ZONE 'America/Sao_Paulo')::date WHERE u.last_sign_in_at > now() - interval '30 days'
  ) x;

  RETURN jsonb_build_object(
    'client_id',       c.id,
    'state',           st,
    'email',           u.email,
    'email_differs',   lower(u.email) <> lower(trim(c.email)),
    'invited_at',      u.invited_at,
    'password_set_at', (SELECT max(at) FROM client_portal_events e WHERE e.client_id = c.id AND e.kind = 'senha_criada'),
    'last_sign_in_at', u.last_sign_in_at,
    'last_seen_at',    seen,
    'active_days_30',  days
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.portal_state_for(UUID) FROM PUBLIC, anon, authenticated;
