-- ── 083: CRM — fila do follow-up automático ─────────────────────────────────
-- Depende da 080. Idempotente.
--
-- Antes: a varredura rodava de hora em hora e mandava tudo que estava no prazo
-- de uma vez (3 mensagens no mesmo minuto). Agora é uma fila por agência:
--   • a varredura roda a cada minuto e envia no máximo UMA mensagem;
--   • depois de cada envio, o próximo só é liberado após um intervalo sorteado
--     entre 5 e 15 minutos (`followup_next_send_at`);
--   • a vaga é reservada de forma atômica: duas varreduras ao mesmo tempo não
--     enviam juntas.

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS followup_next_send_at timestamptz;

-- Reserva a vez de enviar e já agenda a próxima. Falso = ainda não chegou a vez.
CREATE OR REPLACE FUNCTION public.crm_followup_take_slot(p_user uuid, p_gap_seconds integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    UPDATE crm_settings
       SET followup_next_send_at = now() + make_interval(secs => p_gap_seconds)
     WHERE user_id = p_user
       AND (followup_next_send_at IS NULL OR followup_next_send_at <= now())
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u);
$$;

-- O envio não aconteceu (IA ou WhatsApp falhou): devolve a vez na hora
CREATE OR REPLACE FUNCTION public.crm_followup_release_slot(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE crm_settings SET followup_next_send_at = now() WHERE user_id = p_user;
$$;

REVOKE ALL ON FUNCTION public.crm_followup_take_slot(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_followup_release_slot(uuid)       FROM PUBLIC, anon, authenticated;

-- Varredura a cada minuto (a função sai na hora fora do horário comercial ou
-- quando não é a vez de enviar)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-followup') THEN
    PERFORM cron.alter_job(
      (SELECT jobid FROM cron.job WHERE jobname = 'crm-followup'),
      schedule := '* * * * *'
    );
  END IF;
END $$;
