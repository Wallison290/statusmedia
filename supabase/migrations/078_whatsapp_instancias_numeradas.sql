-- ── 078: instâncias de WhatsApp numeradas ────────────────────────────────────
-- Cada agência que conecta ganha uma instância na UazAPI chamada agencia-001,
-- agencia-002... em sequência. O nome e o e-mail da agência vão nos campos
-- "Admin Field 01/02" da instância, para quem olha o painel da UazAPI saber de
-- quem é cada número.
--
-- A sequência começa em 2: a agencia-001 já existe (conta Status Media).
-- Número usado não volta: instância apagada deixa o buraco na sequência, e o
-- nome continua único para sempre.

CREATE SEQUENCE IF NOT EXISTS public.whatsapp_instance_seq START 2;

CREATE OR REPLACE FUNCTION public.next_whatsapp_instance_name()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'agencia-' || lpad(nextval('public.whatsapp_instance_seq')::text, 3, '0');
$$;

REVOKE ALL ON FUNCTION public.next_whatsapp_instance_name() FROM PUBLIC, anon, authenticated;
