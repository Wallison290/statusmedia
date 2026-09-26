-- ── 079: identidade da agência nas páginas do cliente ────────────────────────
-- Proposta, contrato e formulário de captura são abertos pelo cliente da
-- agência. Até aqui saíam com o azul da StatusMedia; agora saem com a cor e o
-- logo da própria agência. Configurado em CRM › Configurações.

ALTER TABLE crm_settings
  ADD COLUMN IF NOT EXISTS brand_color    text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text;

-- Cor em hexadecimal de 6 dígitos (#1A2B3C). Qualquer outra coisa iria direto
-- para o CSS da página pública.
ALTER TABLE crm_settings DROP CONSTRAINT IF EXISTS crm_settings_brand_color_hex;
ALTER TABLE crm_settings
  ADD CONSTRAINT crm_settings_brand_color_hex
  CHECK (brand_color IS NULL OR brand_color ~ '^#[0-9A-Fa-f]{6}$');

-- Logo: o da identidade, se cadastrado; senão a foto de perfil (como antes)
CREATE OR REPLACE FUNCTION public.crm_agency_public(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name',  coalesce(nullif(p.agency_name, ''), nullif(p.full_name, ''), 'Agência'),
    'logo',  coalesce(nullif(s.brand_logo_url, ''), p.avatar_url),
    'color', s.brand_color
  )
  FROM profiles p
  LEFT JOIN crm_settings s ON s.user_id = p.id
  WHERE p.id = p_user;
$$;

REVOKE ALL ON FUNCTION public.crm_agency_public(uuid) FROM PUBLIC, anon, authenticated;
