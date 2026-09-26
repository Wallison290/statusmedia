-- ── 076: WhatsApp próprio da agência ─────────────────────────────────────────
-- Cada agência pode conectar o PRÓPRIO WhatsApp (instância UazAPI dela) pela
-- tela do CRM, lendo um QR code. Com ele, proposta, contrato e mensagens
-- prontas saem direto do número da agência.
--
-- Não confundir com o número da plataforma (EVOLUTION_* nos secrets), que
-- continua mandando os avisos para agência e cliente. Aquele é compartilhado;
-- este é de uma agência só.
--
-- Onde mora o token da instância: em `whatsapp_instances`, tabela SEM policy
-- nenhuma, então só a service role (edge function agency-whatsapp) lê. O
-- token é a senha do WhatsApp da agência: não pode chegar ao navegador.

-- ── 1. Instâncias (estoque + atribuição) ──────────────────────────────────────
-- Uma linha por instância UazAPI. `user_id` nulo = livre para a próxima
-- agência que conectar. Instâncias entram aqui de dois jeitos: criadas pela
-- edge function (com o admin token da UazAPI) ou cadastradas à mão (estoque).

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name   text        NOT NULL,
  instance_token  text        NOT NULL UNIQUE,
  user_id         uuid        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
-- Sem policies de propósito: nem anon nem authenticated leem ou escrevem.
REVOKE ALL ON public.whatsapp_instances FROM anon, authenticated;

-- ── 2. Estado da conexão, visível para a agência ──────────────────────────────
-- Só o que a tela precisa mostrar. Escrito pela edge function; a agência lê a
-- própria linha.

CREATE TABLE IF NOT EXISTS public.agency_whatsapp (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'disconnected'
                            CHECK (status IN ('disconnected', 'connecting', 'connected')),
  phone         text,
  profile_name  text,
  connected_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_whatsapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency reads own whatsapp" ON public.agency_whatsapp;
CREATE POLICY "Agency reads own whatsapp"
  ON public.agency_whatsapp FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.agency_whatsapp FROM anon, authenticated;

-- Reserva uma instância livre do estoque para a agência, sem corrida: duas
-- agências conectando no mesmo segundo nunca pegam a mesma instância.
CREATE OR REPLACE FUNCTION public.claim_whatsapp_instance(p_user uuid)
RETURNS public.whatsapp_instances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r whatsapp_instances;
BEGIN
  SELECT * INTO r FROM whatsapp_instances WHERE user_id = p_user;
  IF FOUND THEN RETURN r; END IF;

  UPDATE whatsapp_instances
     SET user_id = p_user, assigned_at = now()
   WHERE id = (
     SELECT id FROM whatsapp_instances
     WHERE user_id IS NULL
     ORDER BY created_at
     LIMIT 1
     FOR UPDATE SKIP LOCKED
   )
  RETURNING * INTO r;
  RETURN r;   -- nulo se o estoque acabou
END;
$$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_instance(uuid) FROM PUBLIC, anon, authenticated;

-- ── 3. Envio pelo número da agência entra no histórico como tal ───────────────
-- Nada muda no CHECK de crm_lead_activities: o envio é um 'whatsapp' com
-- meta.sent_via = 'agency_whatsapp', gravado pela edge function (service role).
CREATE INDEX IF NOT EXISTS crm_lead_activities_sent_via_idx
  ON crm_lead_activities (user_id, created_at DESC)
  WHERE kind = 'whatsapp' AND meta ? 'sent_via';
