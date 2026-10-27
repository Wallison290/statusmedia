-- ── 110: assinatura salva de quem assina pela agência ───────────────────────
-- Cada pessoa (dono ou sócio) guarda a própria assinatura uma vez e, nos
-- próximos contratos, escolhe "Usar minha assinatura". Só a própria pessoa lê
-- e grava a dela: sócio não vê nem usa a assinatura do outro.

CREATE TABLE IF NOT EXISTS public.user_signatures (
  user_id    uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users ON DELETE CASCADE,
  name       text NOT NULL,
  image      text NOT NULL CHECK (image LIKE 'data:image/%' AND length(image) < 400000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own signature" ON public.user_signatures;
CREATE POLICY "Own signature" ON public.user_signatures FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Quem já assinou algum contrato pela agência começa com a assinatura mais
-- recente dele (contrato da própria conta, assinado com o nome do perfil)
INSERT INTO public.user_signatures (user_id, name, image, updated_at)
SELECT DISTINCT ON (c.user_id) c.user_id, c.agency_signer_name, c.agency_signature, coalesce(c.agency_signed_at, c.updated_at)
FROM public.crm_contracts c
JOIN public.profiles p ON p.id = c.user_id
WHERE c.agency_signature LIKE 'data:image/%'
  AND lower(btrim(c.agency_signer_name)) = lower(btrim(p.full_name))
ORDER BY c.user_id, c.agency_signed_at DESC NULLS LAST
ON CONFLICT (user_id) DO NOTHING;
