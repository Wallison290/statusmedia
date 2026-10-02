-- ── 085: CRM — fila de respostas, opt-out, forecast, reuniões, tags, campos
--          personalizados, webhook de leads e pós-venda ──────────────────────
-- Depende da 073, 080 e 081. Idempotente.

-- ── 1. Lead respondeu, sua vez ────────────────────────────────────────────────
-- Desde quando o lead está esperando resposta da agência. O webhook preenche
-- quando chega mensagem do lead; qualquer mensagem da agência limpa.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS awaiting_reply_since timestamptz;

-- ── 2. Opt-out ────────────────────────────────────────────────────────────────
-- Lead que pediu para não receber mais mensagens (o webhook detecta).
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

-- ── 4. Previsão de vendas ─────────────────────────────────────────────────────
-- Chance (0-100) de um lead desta etapa virar negócio. Nulo = a tela sugere
-- pela posição da etapa no funil.
ALTER TABLE public.crm_columns
  ADD COLUMN IF NOT EXISTS win_probability integer
    CHECK (win_probability IS NULL OR win_probability BETWEEN 0 AND 100);

-- ── 5. Reuniões ───────────────────────────────────────────────────────────────
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS meeting_at          timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_reminded_at timestamptz;

ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS meeting_reminder boolean NOT NULL DEFAULT true;

-- ── 7. Tags e campos personalizados ───────────────────────────────────────────
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS tags   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom jsonb  NOT NULL DEFAULT '{}'::jsonb;

-- Definição dos campos: [{ "key": "especialidade", "label": "Especialidade", "type": "text" | "number" | "bool" }]
ALTER TABLE public.crm_settings
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS crm_leads_tags_idx ON public.crm_leads USING gin (tags);

-- ── 10. Pós-venda ─────────────────────────────────────────────────────────────
-- Data de renovação do contrato do cliente fechado: lembrete 30 e 7 dias antes.
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS renewal_at date;

-- ── Notificações novas ────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'NEW_CONTENT', 'APPROVAL_REQUEST', 'APPROVED', 'REJECTED', 'COMMENT', 'ADJUSTMENT_DONE',
  'TASK_STATUS_UPDATE', 'TASK_DONE', 'FORM_SUBMITTED', 'POST_PUBLISHED', 'POST_FAILED',
  'NOTE_REQUEST', 'NEW_REPORT', 'IG_TOKEN_EXPIRING',
  'CRM_FOLLOWUP', 'CRM_LEAD_NEW', 'CRM_PROPOSAL_VIEWED', 'CRM_PROPOSAL_ACCEPTED',
  'CRM_PROPOSAL_REJECTED', 'CRM_CONTRACT_SIGNED', 'CRM_AUTOMATION',
  'CRM_REPLY', 'CRM_OPT_OUT', 'CRM_RENEWAL'
]));

-- ── 10. Lembrete de renovação (roda junto do lembrete diário) ────────────────
CREATE OR REPLACE FUNCTION public.crm_renewal_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  r       record;
  v_sent  integer := 0;
BEGIN
  FOR r IN
    SELECT l.id, l.user_id, l.name, l.renewal_at, (l.renewal_at - v_today) AS days
    FROM crm_leads l
    WHERE l.archived_at IS NULL
      AND l.renewal_at IS NOT NULL
      AND (l.renewal_at - v_today) IN (30, 7, 0)
      -- uma vez por dia por lead
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = l.user_id AND n.type = 'CRM_RENEWAL'
          AND n.link = '/crm?lead=' || l.id
          AND (n.created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today
      )
  LOOP
    PERFORM crm_notify(
      r.user_id, 'CRM_RENEWAL',
      CASE WHEN r.days = 0 THEN 'Renovação hoje: ' || r.name
           ELSE 'Renovação em ' || r.days || ' dias: ' || r.name END,
      'O contrato de ' || r.name || ' renova em ' || to_char(r.renewal_at, 'DD/MM/YYYY')
        || '. Bom momento para conversar sobre resultados e oferecer algo a mais.',
      r.id
    );
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_renewal_reminders() FROM PUBLIC, anon, authenticated;

-- O lembrete diário (073) passa a chamar o de renovação no fim
CREATE OR REPLACE FUNCTION public.crm_daily_digest()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  r       record;
  v_sent  integer := 0;
BEGIN
  FOR r IN
    SELECT l.user_id,
           count(*)                                         AS total,
           count(*) FILTER (WHERE l.next_contact_at < v_today) AS late,
           string_agg(
             '• ' || l.name || coalesce(' (' || l.company || ')', '')
               || CASE WHEN l.next_contact_at < v_today THEN ' ⚠️ atrasado' ELSE '' END,
             E'\n' ORDER BY l.next_contact_at, l.name
           ) FILTER (WHERE l.rn <= 8)                       AS lines
    FROM (
      SELECT l.*, row_number() OVER (PARTITION BY l.user_id ORDER BY l.next_contact_at, l.name) AS rn
      FROM crm_leads l
      JOIN crm_columns c ON c.id = l.column_id
      WHERE l.archived_at IS NULL
        AND l.next_contact_at IS NOT NULL
        AND l.next_contact_at <= v_today
        AND c.stage_type = 'normal'
    ) l
    LEFT JOIN crm_settings s ON s.user_id = l.user_id
    WHERE coalesce(s.daily_digest, true)
      -- Idempotente no dia: rodar o cron duas vezes não manda dois lembretes
      AND NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.user_id = l.user_id AND n.type = 'CRM_FOLLOWUP'
          AND (n.created_at AT TIME ZONE 'America/Sao_Paulo')::date = v_today
      )
    GROUP BY l.user_id
  LOOP
    PERFORM crm_notify(
      r.user_id, 'CRM_FOLLOWUP',
      CASE WHEN r.total = 1 THEN 'Você tem 1 retorno hoje'
           ELSE 'Você tem ' || r.total || ' retornos hoje' END,
      r.lines
        || CASE WHEN r.total > 8 THEN E'\n…e mais ' || (r.total - 8) ELSE '' END
        || CASE WHEN r.late > 0 THEN E'\n\n' || r.late || ' deles já passaram da data.' ELSE '' END,
      NULL
    );
    v_sent := v_sent + 1;
  END LOOP;

  -- "Lead parado há X dias" roda junto, uma vez por dia (executor na 075)
  PERFORM crm_run_stale_automations();
  -- Renovações de contrato (085)
  PERFORM crm_renewal_reminders();

  RETURN v_sent;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_daily_digest() FROM PUBLIC, anon, authenticated;

-- ── Estado inicial da fila de respostas ───────────────────────────────────────
-- Leads cuja última mensagem gravada é do lead já entram esperando resposta.
UPDATE crm_leads l
   SET awaiting_reply_since = m.sent_at
  FROM (
    SELECT DISTINCT ON (lead_id) lead_id, direction, sent_at
    FROM crm_messages
    ORDER BY lead_id, sent_at DESC
  ) m
 WHERE m.lead_id = l.id AND m.direction = 'in' AND l.awaiting_reply_since IS NULL;
