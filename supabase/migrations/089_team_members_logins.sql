-- ── 089_team_members_logins.sql ───────────────────────────────────────────────
-- Dono e sócios como "responsáveis" automáticos.
--
-- Todo campo "Responsável" do sistema (tarefas, CRM, modelos de tarefa) lista
-- as linhas de team_members da agência. Até aqui só existiam colaboradores
-- cadastrados à mão na aba Equipe. Agora o banco mantém sozinho:
--   • uma linha kind='owner'   para o dono de cada agência;
--   • uma linha kind='partner' para cada sócio (agency_partners, migration 088).
-- Sócio removido vira inativo (as tarefas antigas continuam com o nome dele).
-- O nome acompanha o perfil (full_name) da pessoa.
-- Essas linhas não contam no limite de membros do plano e não aparecem nos
-- cartões de colaborador da aba Equipe (o front filtra por kind).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'collaborator';

ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_kind_check;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_kind_check CHECK (kind IN ('collaborator', 'owner', 'partner'));

-- Uma linha por pessoa com login em cada agência
CREATE UNIQUE INDEX IF NOT EXISTS team_members_login_unique
  ON public.team_members (user_id, member_user_id) WHERE member_user_id IS NOT NULL;

-- ── Nome de exibição de quem tem login ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.login_display_name(p_user UUID, p_fallback TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(TRIM(p.full_name), ''),
    NULLIF(TRIM(p_fallback), ''),
    NULLIF(TRIM(p.agency_name), ''),
    split_part(COALESCE(p.email, u.email, ''), '@', 1),
    'Sem nome'
  )
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user
$$;

-- ── Cria/reativa a linha de responsável de uma pessoa com login ─────────────
CREATE OR REPLACE FUNCTION public.sync_login_member(
  p_agency UUID, p_person UUID, p_kind TEXT, p_fallback TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO team_members (user_id, member_user_id, kind, name, email, color, is_active)
  SELECT p_agency, p_person, p_kind,
         public.login_display_name(p_person, p_fallback),
         u.email,
         CASE p_kind WHEN 'owner' THEN '#2563EB' ELSE '#059669' END,
         true
  FROM auth.users u WHERE u.id = p_person
  ON CONFLICT (user_id, member_user_id) WHERE member_user_id IS NOT NULL
  DO UPDATE SET is_active = true,
                kind      = EXCLUDED.kind,
                name      = EXCLUDED.name,
                email     = EXCLUDED.email;
END;
$$;

-- ── Sócio entra / sai ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_agency_partner_members()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.sync_login_member(NEW.owner_id, NEW.owner_id, 'owner');
    PERFORM public.sync_login_member(NEW.owner_id, NEW.partner_user_id, 'partner', NEW.name);
    RETURN NEW;
  END IF;
  -- DELETE: desativa (não apaga) para as tarefas antigas manterem o responsável
  UPDATE team_members SET is_active = false
  WHERE user_id = OLD.owner_id AND member_user_id = OLD.partner_user_id AND kind = 'partner';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_partner_members ON public.agency_partners;
CREATE TRIGGER trg_agency_partner_members
  AFTER INSERT OR DELETE ON public.agency_partners
  FOR EACH ROW EXECUTE FUNCTION public.trg_agency_partner_members();

-- ── Conta de agência nova: o dono já nasce como responsável ─────────────────
-- ── Perfil muda de nome: o responsável acompanha ─────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_profile_login_members()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'agency' THEN
      PERFORM public.sync_login_member(NEW.id, NEW.id, 'owner');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.agency_name IS DISTINCT FROM OLD.agency_name THEN
    UPDATE team_members tm
    SET name = public.login_display_name(NEW.id, CASE WHEN tm.kind = 'partner'
                 THEN (SELECT ap.name FROM agency_partners ap
                       WHERE ap.owner_id = tm.user_id AND ap.partner_user_id = NEW.id)
               END)
    WHERE tm.member_user_id = NEW.id AND tm.kind IN ('owner', 'partner');
  END IF;
  -- Conta virou agência depois do cadastro (raro): garante o dono
  IF NEW.role = 'agency' AND OLD.role IS DISTINCT FROM 'agency' THEN
    PERFORM public.sync_login_member(NEW.id, NEW.id, 'owner');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_login_members ON public.profiles;
CREATE TRIGGER trg_profile_login_members
  AFTER INSERT OR UPDATE OF full_name, agency_name, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profile_login_members();

-- ── Backfill: donos e sócios que já existem ──────────────────────────────────
SELECT public.sync_login_member(p.id, p.id, 'owner')
FROM profiles p
WHERE p.role = 'agency';

SELECT public.sync_login_member(ap.owner_id, ap.partner_user_id, 'partner', ap.name)
FROM agency_partners ap;

-- Só o banco cria essas linhas
REVOKE EXECUTE ON FUNCTION public.sync_login_member(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
