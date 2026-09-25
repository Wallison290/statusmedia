-- ── 073: CRM — histórico, motivo de perda, arquivo, tarefas e lembrete diário ──
-- Primeira de três migrations do CRM completo (073 → 074 → 075). Aplique nesta
-- ordem. Todas são idempotentes: rodar de novo não duplica nada.
--
-- O que muda aqui:
--   1. O lead passa a lembrar o que aconteceu com ele (crm_lead_activities).
--      Antes existia só o campo `notes`, reescrito por cima a cada conversa.
--   2. Motivo de perda, arquivamento e as datas de entrada na etapa e de
--      fechamento — base dos relatórios de conversão.
--   3. Tarefa ligada ao lead (`tasks.crm_lead_id`).
--   4. Configurações do CRM por agência (crm_settings).
--   5. Lembrete diário dos retornos do dia, que chega no sininho e no WhatsApp.

-- ── 1. Campos novos no lead ───────────────────────────────────────────────────
-- `stage_entered_at` precisa nascer com a data da última alteração, não com a
-- data desta migration: senão todo lead antigo pareceria "recém-chegado" na
-- etapa e o relatório de tempo por etapa começaria errado. Por isso o
-- preenchimento só roda quando a coluna é criada agora.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crm_leads' AND column_name = 'stage_entered_at'
  ) THEN
    ALTER TABLE crm_leads ADD COLUMN stage_entered_at timestamptz;
    UPDATE crm_leads SET stage_entered_at = updated_at;
    ALTER TABLE crm_leads ALTER COLUMN stage_entered_at SET DEFAULT now();
    ALTER TABLE crm_leads ALTER COLUMN stage_entered_at SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'crm_leads' AND column_name = 'closed_at'
  ) THEN
    ALTER TABLE crm_leads ADD COLUMN closed_at timestamptz;
    -- Quem já está numa etapa de ganho ou perda fechou, no máximo, na última edição
    UPDATE crm_leads l SET closed_at = l.updated_at
    FROM crm_columns c
    WHERE c.id = l.column_id AND c.stage_type IN ('ganho', 'perdido');
  END IF;
END $$;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS lost_reason text;

-- O lembrete diário procura "quem tem retorno até hoje e não está arquivado"
CREATE INDEX IF NOT EXISTS crm_leads_followup_idx
  ON crm_leads (user_id, next_contact_at)
  WHERE archived_at IS NULL AND next_contact_at IS NOT NULL;

-- ── 2. Histórico do lead ──────────────────────────────────────────────────────
-- Tipos manuais (a agência registra): nota, ligacao, whatsapp, reuniao, email.
-- Todos os outros são gravados pelo próprio banco, por trigger, e por isso a
-- policy de INSERT só aceita os manuais: ninguém forja "proposta aceita" pela API.

CREATE TABLE IF NOT EXISTS crm_lead_activities (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id    uuid        NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN (
               'nota', 'ligacao', 'whatsapp', 'reuniao', 'email',
               'criado', 'etapa', 'ganho', 'perdido', 'reaberto',
               'arquivado', 'restaurado', 'convertido',
               'tarefa', 'tarefa_concluida',
               'proposta', 'contrato', 'captura', 'automacao'
             )),
  content    text,
  meta       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency reads own crm activities" ON crm_lead_activities;
CREATE POLICY "Agency reads own crm activities"
  ON crm_lead_activities FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Agency logs manual crm activities" ON crm_lead_activities;
CREATE POLICY "Agency logs manual crm activities"
  ON crm_lead_activities FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND kind IN ('nota', 'ligacao', 'whatsapp', 'reuniao', 'email')
    AND EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Agency deletes manual crm activities" ON crm_lead_activities;
CREATE POLICY "Agency deletes manual crm activities"
  ON crm_lead_activities FOR DELETE
  USING (auth.uid() = user_id AND kind IN ('nota', 'ligacao', 'whatsapp', 'reuniao', 'email'));

CREATE INDEX IF NOT EXISTS crm_lead_activities_lead_idx
  ON crm_lead_activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_lead_activities_user_idx
  ON crm_lead_activities (user_id, created_at DESC);

-- Grava um evento do sistema. SECURITY DEFINER porque a policy de INSERT
-- barra os tipos automáticos para o usuário comum.
CREATE OR REPLACE FUNCTION public.crm_log(
  p_user uuid, p_lead uuid, p_kind text, p_content text, p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO crm_lead_activities (user_id, lead_id, kind, content, meta)
  VALUES (p_user, p_lead, p_kind, p_content, coalesce(p_meta, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.crm_log(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── 3. Automações: ponto de extensão ──────────────────────────────────────────
-- O executor de verdade chega na 075. Aqui só nasce uma versão vazia, para os
-- triggers desta migration e da 074 já poderem chamá-lo. Criada apenas se ainda
-- não existir: rodar a 073 de novo depois da 075 não pode apagar o executor.

DO $$
BEGIN
  IF to_regprocedure('public.crm_run_automations(uuid,uuid,text,uuid,text)') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.crm_run_automations(
        p_user uuid, p_lead uuid, p_trigger text, p_column uuid, p_event_ref text
      ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $b$ BEGIN RETURN; END $b$
    $f$;
  END IF;

  IF to_regprocedure('public.crm_run_stale_automations()') IS NULL THEN
    EXECUTE $f$
      CREATE FUNCTION public.crm_run_stale_automations()
      RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $b$ BEGIN RETURN; END $b$
    $f$;
  END IF;
END $$;

-- ── 4. Rastreamento automático do lead ────────────────────────────────────────
-- BEFORE: ajusta as datas no mesmo UPDATE que moveu o card (sem segundo UPDATE).
-- AFTER:  grava o histórico e dispara as automações.

CREATE OR REPLACE FUNCTION public.crm_lead_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stage text;
BEGIN
  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    SELECT stage_type INTO v_stage FROM crm_columns WHERE id = NEW.column_id;
    NEW.stage_entered_at := now();
    NEW.closed_at := CASE WHEN v_stage IN ('ganho', 'perdido') THEN now() ELSE NULL END;
    -- Motivo de perda só faz sentido enquanto o lead está perdido. Quem volta
    -- para o funil não pode continuar contando nos "motivos de perda".
    IF v_stage IS DISTINCT FROM 'perdido' THEN
      NEW.lost_reason := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_before_update ON crm_leads;
CREATE TRIGGER crm_leads_before_update
  BEFORE UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_before_update();

-- Lead criado já numa etapa de ganho/perda (acontece ao cadastrar direto lá)
CREATE OR REPLACE FUNCTION public.crm_lead_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stage text;
BEGIN
  SELECT stage_type INTO v_stage FROM crm_columns WHERE id = NEW.column_id;
  NEW.stage_entered_at := now();
  IF v_stage IN ('ganho', 'perdido') THEN NEW.closed_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_before_insert ON crm_leads;
CREATE TRIGGER crm_leads_before_insert
  BEFORE INSERT ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_before_insert();

CREATE OR REPLACE FUNCTION public.crm_lead_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col_name text;
BEGIN
  SELECT name INTO v_col_name FROM crm_columns WHERE id = NEW.column_id;

  PERFORM crm_log(NEW.user_id, NEW.id, 'criado',
    'Lead cadastrado em "' || coalesce(v_col_name, 'sem etapa') || '"',
    jsonb_build_object('to', NEW.column_id, 'to_name', v_col_name));

  PERFORM crm_run_automations(NEW.user_id, NEW.id, 'lead_criado', NEW.column_id, 'criado');
  PERFORM crm_run_automations(NEW.user_id, NEW.id, 'lead_entrou_etapa', NEW.column_id,
    'etapa:' || NEW.stage_entered_at::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_after_insert ON crm_leads;
CREATE TRIGGER crm_leads_after_insert
  AFTER INSERT ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_after_insert();

CREATE OR REPLACE FUNCTION public.crm_lead_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_name  text;
  v_to_name    text;
  v_from_stage text;
  v_to_stage   text;
  v_kind       text;
  v_content    text;
BEGIN
  IF NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    SELECT name, stage_type INTO v_from_name, v_from_stage FROM crm_columns WHERE id = OLD.column_id;
    SELECT name, stage_type INTO v_to_name,   v_to_stage   FROM crm_columns WHERE id = NEW.column_id;

    IF v_to_stage = 'ganho' THEN
      v_kind := 'ganho';
      v_content := 'Fechou! Movido para "' || coalesce(v_to_name, '?') || '"';
    ELSIF v_to_stage = 'perdido' THEN
      v_kind := 'perdido';
      v_content := 'Perdido' || coalesce(': ' || NEW.lost_reason, '');
    ELSIF v_from_stage IN ('ganho', 'perdido') THEN
      v_kind := 'reaberto';
      v_content := 'Voltou para o funil em "' || coalesce(v_to_name, '?') || '"';
    ELSE
      v_kind := 'etapa';
      v_content := coalesce(v_from_name, '?') || ' → ' || coalesce(v_to_name, '?');
    END IF;

    PERFORM crm_log(NEW.user_id, NEW.id, v_kind, v_content, jsonb_build_object(
      'from', OLD.column_id, 'from_name', v_from_name,
      'to',   NEW.column_id, 'to_name',   v_to_name,
      'reason', NEW.lost_reason,
      -- Quanto tempo o lead ficou na etapa que acabou de deixar, em horas.
      -- É o que o relatório usa para o "tempo médio por etapa".
      'hours_in_stage', round(extract(epoch FROM (now() - OLD.stage_entered_at)) / 3600.0, 1)
    ));

    PERFORM crm_run_automations(NEW.user_id, NEW.id, 'lead_entrou_etapa', NEW.column_id,
      'etapa:' || NEW.stage_entered_at::text);
  END IF;

  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
    PERFORM crm_log(NEW.user_id, NEW.id, 'arquivado', 'Lead arquivado');
  ELSIF NEW.archived_at IS NULL AND OLD.archived_at IS NOT NULL THEN
    PERFORM crm_log(NEW.user_id, NEW.id, 'restaurado', 'Lead restaurado do arquivo');
  END IF;

  IF NEW.converted_client_id IS NOT NULL AND OLD.converted_client_id IS NULL THEN
    PERFORM crm_log(NEW.user_id, NEW.id, 'convertido', 'Virou cliente da agência',
      jsonb_build_object('client_id', NEW.converted_client_id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_after_update ON crm_leads;
CREATE TRIGGER crm_leads_after_update
  AFTER UPDATE ON crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_lead_after_update();

-- ── 5. Tarefa ligada ao lead ──────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS crm_lead_id uuid REFERENCES crm_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_crm_lead_idx
  ON public.tasks (crm_lead_id) WHERE crm_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_task_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.crm_lead_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM crm_log(NEW.user_id, NEW.crm_lead_id, 'tarefa',
      'Tarefa criada: ' || NEW.title,
      jsonb_build_object('task_id', NEW.id, 'due_date', NEW.due_date));
  ELSIF NEW.status = 'concluido' AND OLD.status IS DISTINCT FROM 'concluido' THEN
    PERFORM crm_log(NEW.user_id, NEW.crm_lead_id, 'tarefa_concluida',
      'Tarefa concluída: ' || NEW.title,
      jsonb_build_object('task_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_task_activity ON public.tasks;
CREATE TRIGGER crm_task_activity
  AFTER INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_task_activity();

-- ── 6. Configurações do CRM (uma linha por agência) ───────────────────────────
-- Tudo que é "do jeito desta agência": metas, formulário de captura, modelo de
-- contrato, mensagens prontas. Os campos da captura e do contrato só passam a
-- ser usados com a 074/075, mas moram aqui para ser uma tabela só.

CREATE TABLE IF NOT EXISTS crm_settings (
  user_id             uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_digest        boolean     NOT NULL DEFAULT true,
  goal_monthly_value  numeric(12,2),
  goal_monthly_deals  integer,
  message_templates   jsonb,                          -- null = usar os modelos padrão do app
  contract_template   text,                           -- null = usar o modelo padrão do app
  proposal_defaults   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  capture_enabled     boolean     NOT NULL DEFAULT false,
  capture_token       uuid        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  capture_column_id   uuid        REFERENCES crm_columns(id) ON DELETE SET NULL,
  capture_title       text,
  capture_description text,
  capture_thanks      text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency manages own crm settings" ON crm_settings;
CREATE POLICY "Agency manages own crm settings"
  ON crm_settings FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS crm_settings_set_updated_at ON crm_settings;
CREATE TRIGGER crm_settings_set_updated_at
  BEFORE UPDATE ON crm_settings
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- ── 7. Notificações do CRM ────────────────────────────────────────────────────
-- A lista abaixo repete TODOS os tipos da 068 e acrescenta os do CRM. Os do CRM
-- são criados já aqui (inclusive os de proposta e contrato, usados na 074/075)
-- para o CHECK ser alterado uma vez só.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'NEW_CONTENT', 'APPROVAL_REQUEST', 'APPROVED', 'REJECTED', 'COMMENT',
    'ADJUSTMENT_DONE', 'TASK_STATUS_UPDATE', 'TASK_DONE', 'FORM_SUBMITTED',
    'POST_PUBLISHED', 'POST_FAILED', 'NOTE_REQUEST', 'NEW_REPORT',
    'IG_TOKEN_EXPIRING',
    'CRM_FOLLOWUP', 'CRM_LEAD_NEW', 'CRM_PROPOSAL_VIEWED', 'CRM_PROPOSAL_ACCEPTED',
    'CRM_PROPOSAL_REJECTED', 'CRM_CONTRACT_SIGNED', 'CRM_AUTOMATION'
  ));

-- Mesmo mapa da 047, com a categoria nova 'crm'. É esta função que decide se a
-- notificação vai para o WhatsApp (tipo sem categoria não sai do sininho).
CREATE OR REPLACE FUNCTION public.notification_category(p_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'APPROVED'           THEN 'aprovacoes'
    WHEN 'REJECTED'           THEN 'aprovacoes'
    WHEN 'COMMENT'            THEN 'aprovacoes'
    WHEN 'APPROVAL_REQUEST'   THEN 'aprovacoes'
    WHEN 'ADJUSTMENT_DONE'    THEN 'aprovacoes'
    WHEN 'NEW_CONTENT'        THEN 'conteudo'
    WHEN 'POST_PUBLISHED'     THEN 'instagram'
    WHEN 'POST_FAILED'        THEN 'instagram'
    WHEN 'TASK_DONE'          THEN 'tarefas'
    WHEN 'TASK_STATUS_UPDATE' THEN 'tarefas'
    WHEN 'FORM_SUBMITTED'     THEN 'solicitacoes'
    WHEN 'NOTE_REQUEST'       THEN 'solicitacoes'
    WHEN 'CRM_FOLLOWUP'          THEN 'crm'
    WHEN 'CRM_LEAD_NEW'          THEN 'crm'
    WHEN 'CRM_PROPOSAL_VIEWED'   THEN 'crm'
    WHEN 'CRM_PROPOSAL_ACCEPTED' THEN 'crm'
    WHEN 'CRM_PROPOSAL_REJECTED' THEN 'crm'
    WHEN 'CRM_CONTRACT_SIGNED'   THEN 'crm'
    WHEN 'CRM_AUTOMATION'        THEN 'crm'
    ELSE NULL
  END;
$$;

-- Atalho usado por todo o CRM para avisar a agência
CREATE OR REPLACE FUNCTION public.crm_notify(
  p_user uuid, p_type text, p_title text, p_message text, p_lead uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO notifications (user_id, client_id, type, title, message, link)
  VALUES (p_user, NULL, p_type, p_title, p_message,
          CASE WHEN p_lead IS NULL THEN '/crm' ELSE '/crm?lead=' || p_lead::text END);
$$;

REVOKE ALL ON FUNCTION public.crm_notify(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ── 8. Lembrete diário dos retornos ───────────────────────────────────────────
-- Uma notificação por agência com os leads cujo próximo contato é hoje ou já
-- passou. Só etapas "normais": lead ganho ou perdido não tem retorno pendente.
-- O "hoje" é o de Brasília, não o do servidor (UTC).

CREATE OR REPLACE FUNCTION public.crm_daily_digest()
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

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_daily_digest() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('crm-daily-digest')
    FROM cron.job WHERE jobname = 'crm-daily-digest';

    PERFORM cron.schedule(
      'crm-daily-digest',
      '0 11 * * *',   -- 11:00 UTC = 08:00 em Brasília
      'SELECT public.crm_daily_digest()'
    );

    RAISE NOTICE 'Cron "crm-daily-digest" agendado para 08:00 (Brasília) todos os dias.';
  ELSE
    RAISE NOTICE 'pg_cron não disponível. Agende manualmente: SELECT public.crm_daily_digest() diário às 11:00 UTC.';
  END IF;
END $$;
