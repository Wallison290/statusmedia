-- ── 088_agency_partners.sql ───────────────────────────────────────────────────
-- Sócios da agência: outra pessoa, com login próprio, enxerga e opera TODO o
-- sistema da agência como se fosse o dono (inclusive assinatura e convites).
-- Recurso do plano Agency.
--
-- Como funciona: todo dado da agência pertence ao user_id do dono, e as regras
-- de RLS diziam "auth.uid() = user_id". Esta migration troca essa comparação
-- por public.is_agency_member(user_id), que vale para o próprio dono (igual a
-- antes) OU para um sócio ativo dele. A troca é feita a partir das definições
-- vivas no banco (pg_policies / pg_get_functiondef), não de cópias.
--
-- A condição nova é sempre um superconjunto da antiga: quem tinha acesso
-- continua tendo, e só os sócios do dono daquela linha ganham acesso.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tabela ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agency_partners (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL,
  name             TEXT,
  invited_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agency_partners_not_self CHECK (owner_id <> partner_user_id)
);

-- Uma pessoa é sócia de no máximo uma agência.
CREATE UNIQUE INDEX IF NOT EXISTS agency_partners_partner_unique
  ON public.agency_partners (partner_user_id);
CREATE INDEX IF NOT EXISTS agency_partners_owner_idx
  ON public.agency_partners (owner_id);

-- ── 2. Funções de acesso ──────────────────────────────────────────────────────
-- O sócio só vale enquanto a agência estiver no plano Agency ativo (ou em
-- trial válido). Se o dono cair de plano, os sócios perdem o acesso sozinhos.
CREATE OR REPLACE FUNCTION public.agency_partner_owner(p_user UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ap.owner_id
  FROM   agency_partners ap
  JOIN   subscriptions s ON s.user_id = ap.owner_id
  WHERE  ap.partner_user_id = p_user
    AND  s.plan = 'agency'
    AND  (s.status = 'active'
          OR (s.status = 'trialing' AND s.trial_ends_at > now()))
  LIMIT  1
$$;

-- ID da agência de quem está logado: o dono, se for sócio; senão ele mesmo.
CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.agency_partner_owner(auth.uid()), auth.uid())
$$;

-- "Quem está logado pode agir como p_owner?"
CREATE OR REPLACE FUNCTION public.is_agency_member(p_owner UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_owner IS NOT NULL
     AND (p_owner = auth.uid() OR p_owner = public.agency_partner_owner(auth.uid()))
$$;

-- Variante para storage: a primeira pasta do caminho é o user_id do dono.
CREATE OR REPLACE FUNCTION public.is_agency_member_folder(p_folder TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN public.is_agency_member(p_folder::uuid);
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_agency_id()              TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_member(UUID)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agency_member_folder(TEXT)     TO authenticated;

-- ── 3. Reescreve as políticas de RLS ──────────────────────────────────────────
DO $$
DECLARE
  -- auth.uid() como o Postgres imprime: puro ou "( SELECT auth.uid() AS uid)"
  u   CONSTANT TEXT := '(?:\(\s*SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))';
  -- \m e \M: só "user_id" inteiro (nunca o fim de "client_user_id").
  -- "owner" é a coluna de storage.objects com quem enviou o arquivo.
  col CONSTANT TEXT := '(\m(?:[a-z_]+\.)?(?:user_id|owner))\M';
  -- (auth.uid())::text = (storage.foldername(name))[1], nas duas ordens
  fld CONSTANT TEXT := '(?:\(' || u || '\)|' || u || ')::text\s*=\s*\(storage\.foldername\(name\)\)\[1\]';
  dlf CONSTANT TEXT := '\(storage\.foldername\(name\)\)\[1\]\s*=\s*(?:\(' || u || '\)|' || u || ')::text';
  -- O dono continua passando pela comparação direta (barata, avaliada
  -- primeiro); só quem não é o dono chega à consulta de sócios.
  rep_col CONSTANT TEXT := '(\1 = auth.uid() OR public.is_agency_member(\1))';
  rep_fld CONSTANT TEXT := '((storage.foldername(name))[1] = (auth.uid())::text OR public.is_agency_member_folder((storage.foldername(name))[1]))';
  r     RECORD;
  e     TEXT;
  q     TEXT;
  w     TEXT;
  stmt  TEXT;
  n     INT := 0;
  i     INT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM   pg_policies
    WHERE  schemaname IN ('public', 'storage')
      AND  tablename <> 'agency_partners'
      AND  (coalesce(qual, '') ~ 'auth\.uid\(\)' OR coalesce(with_check, '') ~ 'auth\.uid\(\)')
      -- já reescrita (migration rodada de novo): não mexe outra vez
      AND  coalesce(qual, '') || coalesce(with_check, '') !~ 'is_agency_member'
  LOOP
    q := r.qual;
    w := r.with_check;
    -- Duas passadas: primeiro troca cada comparação por um marcador neutro,
    -- depois expande os marcadores. Expandir direto faria a expressão nova
    -- ("user_id = auth.uid() OR ...") casar de novo com o padrão seguinte.
    FOR i IN 1..2 LOOP
      e := CASE i WHEN 1 THEN q ELSE w END;
      IF e IS NOT NULL THEN
        e := regexp_replace(e, u || '\s*=\s*' || col, 'AGENCYMEMBER<<\1>>', 'g');
        e := regexp_replace(e, col || '\s*=\s*' || u, 'AGENCYMEMBER<<\1>>', 'g');
        e := regexp_replace(e, fld, 'AGENCYFOLDER', 'g');
        e := regexp_replace(e, dlf, 'AGENCYFOLDER', 'g');
        e := regexp_replace(e, 'AGENCYMEMBER<<([^>]+)>>', rep_col, 'g');
        e := replace(e, 'AGENCYFOLDER', rep_fld);
      END IF;
      IF i = 1 THEN q := e; ELSE w := e; END IF;
    END LOOP;

    IF q IS NOT DISTINCT FROM r.qual AND w IS NOT DISTINCT FROM r.with_check THEN
      CONTINUE;  -- política que não compara com o dono (ex.: profiles.id, portal do cliente)
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF q IS NOT NULL THEN stmt := stmt || format(' USING (%s)', q); END IF;
    IF w IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', w); END IF;
    EXECUTE stmt;
    n := n + 1;
    RAISE NOTICE '% %.%: % | %', r.policyname, r.schemaname, r.tablename, q, w;
  END LOOP;
  RAISE NOTICE 'Políticas reescritas: %', n;
END;
$$;

-- profiles usa "id" (não user_id). O sócio precisa ler e atualizar o perfil do
-- dono, onde ficam as configurações da agência (nome, WhatsApp da agência).
DROP POLICY IF EXISTS "profiles_agency_partner_select" ON public.profiles;
CREATE POLICY "profiles_agency_partner_select" ON public.profiles
  FOR SELECT USING (public.is_agency_member(id));
DROP POLICY IF EXISTS "profiles_agency_partner_update" ON public.profiles;
CREATE POLICY "profiles_agency_partner_update" ON public.profiles
  FOR UPDATE USING (public.is_agency_member(id))
  WITH CHECK (public.is_agency_member(id));

-- ── 4. Funções SQL que comparavam com o dono ──────────────────────────────────
DO $$
DECLARE
  u   CONSTANT TEXT := '(?:\(\s*SELECT auth\.uid\(\) AS uid\)|auth\.uid\(\))';
  col CONSTANT TEXT := '(\m(?:[a-z_]+\.)?user_id)\M';
  r    RECORD;
  def  TEXT;
  novo TEXT;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM   pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE  ns.nspname = 'public'
      AND  p.proname IN ('get_crm_proposal', 'get_crm_contract', 'sync_client_auth_email')
  LOOP
    def  := pg_get_functiondef(r.oid);
    novo := regexp_replace(def,  'auth\.uid\(\) IS DISTINCT FROM ' || col, 'NOT public.is_agency_member(\1)', 'g');
    novo := regexp_replace(novo, u || '\s*=\s*' || col, 'public.is_agency_member(\1)', 'g');
    novo := regexp_replace(novo, col || '\s*=\s*' || u, 'public.is_agency_member(\1)', 'g');
    IF novo <> def THEN
      EXECUTE novo;
      RAISE NOTICE 'Função atualizada: %', r.proname;
    END IF;
  END LOOP;
END;
$$;

-- ── 5. RLS da própria tabela ──────────────────────────────────────────────────
-- Leitura para a agência e para o próprio sócio. Escrita só pela Edge Function
-- agency-partners (service role), que valida plano e permissões.
ALTER TABLE public.agency_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agency_partners_read" ON public.agency_partners;
CREATE POLICY "agency_partners_read" ON public.agency_partners
  FOR SELECT USING (public.is_agency_member(owner_id) OR partner_user_id = auth.uid());
