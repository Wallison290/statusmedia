-- ── 075: CRM — formulário de captura e automações ────────────────────────────
-- Depende da 073 e da 074. Idempotente.
--
-- Captura: link público (/captura/<token>) que joga o lead direto no funil.
-- Mesma pessoa preenchendo de novo NÃO vira card duplicado: o contato é
-- reconhecido pelo WhatsApp (ou e-mail) e ganha uma entrada no histórico.
-- Ideia trazida do webhook de lead do Sistema (webhooksCatalogo.js).
--
-- Automações: "quando X acontecer com um lead, faça Y". Mesmo modelo do
-- api-automacao do Sistema, rodando dentro do banco:
--   • cada execução é registrada com uma chave de evento única, então o mesmo
--     evento nunca dispara a mesma automação duas vezes (o "lock" do Sistema);
--   • um erro numa automação não derruba a ação do usuário: fica gravado em
--     `last_error` para aparecer na tela.
--
-- Nenhuma ação manda mensagem para o lead pelo WhatsApp da plataforma. Esse
-- número é compartilhado por todas as agências: mensagem automática para
-- terceiros sairia de um número que o lead não conhece e arriscaria o bloqueio
-- do número que entrega os avisos de todo mundo. A ação "lembrete_whatsapp"
-- avisa a AGÊNCIA com a mensagem pronta e o link wa.me, e ela envia do próprio
-- número com um toque.

-- ── 1. Captura de leads ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_crm_capture_form(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'title',       coalesce(nullif(s.capture_title, ''), 'Fale com a gente'),
    'description', s.capture_description,
    'thanks',      coalesce(nullif(s.capture_thanks, ''), 'Recebemos seu contato! Em breve falamos com você.'),
    'agency',      crm_agency_public(s.user_id)
  )
  FROM crm_settings s
  WHERE s.capture_token = p_token AND s.capture_enabled;
$$;

GRANT EXECUTE ON FUNCTION public.get_crm_capture_form(uuid) TO anon, authenticated;

-- Telefone brasileiro só com os dígitos locais (DDD + número), sem o 55.
CREATE OR REPLACE FUNCTION public.crm_phone_key(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN d = '' THEN NULL
    WHEN d LIKE '55%' AND length(d) > 11 THEN substr(d, 3)
    ELSE d
  END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g') AS d) x;
$$;

CREATE OR REPLACE FUNCTION public.submit_crm_capture(
  p_token     uuid,
  p_name      text,
  p_whatsapp  text,
  p_email     text DEFAULT NULL,
  p_company   text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_message   text DEFAULT NULL,
  p_source    text DEFAULT NULL,
  p_website   text DEFAULT NULL   -- armadilha para robôs: campo escondido no formulário
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s         crm_settings;
  v_name    text := left(btrim(coalesce(p_name, '')), 120);
  v_phone   text := crm_phone_key(p_whatsapp);
  v_email   text := nullif(lower(left(btrim(coalesce(p_email, '')), 150)), '');
  v_msg     text := nullif(left(btrim(coalesce(p_message, '')), 2000), '');
  v_source  text := coalesce(nullif(left(btrim(coalesce(p_source, '')), 60), ''), 'Formulário');
  v_today   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_lead    crm_leads;
  v_column  uuid;
  v_recent  integer;
  v_act_id  uuid;
BEGIN
  SELECT * INTO s FROM crm_settings WHERE capture_token = p_token AND capture_enabled;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Formulário indisponível.');
  END IF;

  -- Robô preencheu o campo invisível: finge que deu certo e não grava nada
  IF coalesce(btrim(p_website), '') <> '' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF length(v_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe seu nome.');
  END IF;
  IF v_phone IS NULL OR length(v_phone) NOT BETWEEN 10 AND 11 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Informe um WhatsApp válido, com DDD.');
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'E-mail inválido.');
  END IF;

  -- Freio contra enxurrada: no máximo 30 envios por agência a cada 10 minutos
  SELECT count(*) INTO v_recent
  FROM crm_lead_activities
  WHERE user_id = s.user_id AND kind = 'captura' AND created_at > now() - interval '10 minutes';
  IF v_recent >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Muitos envios agora. Tente de novo em alguns minutos.');
  END IF;

  -- Já é contato desta agência? Procura pelo WhatsApp e, na falta, pelo e-mail.
  SELECT * INTO v_lead
  FROM crm_leads l
  WHERE l.user_id = s.user_id
    AND l.archived_at IS NULL
    AND (crm_phone_key(l.whatsapp) = v_phone
         OR (v_email IS NOT NULL AND lower(l.email) = v_email))
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE crm_leads
       SET next_contact_at = LEAST(coalesce(next_contact_at, v_today), v_today),
           email     = coalesce(email, v_email),
           company   = coalesce(company, nullif(left(btrim(coalesce(p_company, '')), 120), '')),
           instagram = coalesce(instagram, nullif(left(btrim(coalesce(p_instagram, '')), 80), ''))
     WHERE id = v_lead.id;

    INSERT INTO crm_lead_activities (user_id, lead_id, kind, content, meta)
    VALUES (s.user_id, v_lead.id, 'captura',
            'Entrou em contato de novo pelo formulário' || coalesce(': ' || v_msg, ''),
            jsonb_build_object('source', v_source, 'repeat', true))
    RETURNING id INTO v_act_id;

    PERFORM crm_notify(s.user_id, 'CRM_LEAD_NEW', 'Lead voltou a chamar',
      v_lead.name || ' preencheu o formulário de novo' || coalesce(E'.\n\n"' || v_msg || '"', '.'),
      v_lead.id);
    PERFORM crm_run_automations(s.user_id, v_lead.id, 'lead_formulario', v_lead.column_id, 'form:' || v_act_id);
    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Lead novo: entra na etapa escolhida ou na primeira do funil
  SELECT c.id INTO v_column
  FROM crm_columns c
  WHERE c.user_id = s.user_id
    AND (c.id = s.capture_column_id OR s.capture_column_id IS NULL)
  ORDER BY (c.id = s.capture_column_id) DESC, c.position
  LIMIT 1;

  IF v_column IS NULL THEN
    INSERT INTO crm_columns (user_id, name, color, position, stage_type)
    VALUES (s.user_id, 'Novos leads', '#2563EB', 0, 'normal')
    RETURNING id INTO v_column;
  END IF;

  INSERT INTO crm_leads (user_id, column_id, position, name, company, whatsapp, email, instagram,
                         source, temperature, next_contact_at, notes)
  VALUES (s.user_id, v_column, 0, v_name,
          nullif(left(btrim(coalesce(p_company, '')), 120), ''),
          left(btrim(p_whatsapp), 30), v_email,
          nullif(left(btrim(coalesce(p_instagram, '')), 80), ''),
          v_source, 'morno', v_today, v_msg)
  RETURNING * INTO v_lead;

  INSERT INTO crm_lead_activities (user_id, lead_id, kind, content, meta)
  VALUES (s.user_id, v_lead.id, 'captura',
          'Chegou pelo formulário' || coalesce(': ' || v_msg, ''),
          jsonb_build_object('source', v_source))
  RETURNING id INTO v_act_id;

  PERFORM crm_notify(s.user_id, 'CRM_LEAD_NEW', 'Novo lead pelo formulário! 🧲',
    v_lead.name || coalesce(' (' || v_lead.company || ')', '') || ' acabou de chegar.'
      || coalesce(E'\n\n"' || v_msg || '"', ''),
    v_lead.id);
  PERFORM crm_run_automations(s.user_id, v_lead.id, 'lead_formulario', v_column, 'form:' || v_act_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_crm_capture(uuid, text, text, text, text, text, text, text, text) TO anon, authenticated;

-- ── 2. Automações ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_automations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  is_active         boolean     NOT NULL DEFAULT true,

  trigger_type      text        NOT NULL CHECK (trigger_type IN (
                      'lead_criado', 'lead_formulario', 'lead_entrou_etapa', 'lead_parado',
                      'proposta_visualizada', 'proposta_aceita', 'proposta_recusada',
                      'contrato_assinado'
                    )),
  trigger_column_id uuid        REFERENCES crm_columns(id) ON DELETE CASCADE,
  trigger_days      integer     CHECK (trigger_days IS NULL OR trigger_days BETWEEN 1 AND 365),

  action_type       text        NOT NULL CHECK (action_type IN (
                      'criar_tarefa', 'notificar', 'lembrete_whatsapp',
                      'mover_etapa', 'agendar_contato', 'definir_temperatura'
                    )),
  action_params     jsonb       NOT NULL DEFAULT '{}'::jsonb,

  run_count         integer     NOT NULL DEFAULT 0,
  last_run_at       timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE crm_automations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency manages own automations" ON crm_automations;
CREATE POLICY "Agency manages own automations"
  ON crm_automations FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Busca feita em todo evento: "quais automações ativas desta agência esperam isto?"
CREATE INDEX IF NOT EXISTS crm_automations_lookup_idx
  ON crm_automations (user_id, trigger_type) WHERE is_active;

DROP TRIGGER IF EXISTS crm_automations_set_updated_at ON crm_automations;
CREATE TRIGGER crm_automations_set_updated_at
  BEFORE UPDATE ON crm_automations
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- Registro de execuções. O UNIQUE é a trava contra execução duplicada.
CREATE TABLE IF NOT EXISTS crm_automation_runs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid        NOT NULL REFERENCES crm_automations(id) ON DELETE CASCADE,
  lead_id       uuid        NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  event_ref     text        NOT NULL,
  status        text        NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'erro')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, lead_id, event_ref)
);

ALTER TABLE crm_automation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency reads own automation runs" ON crm_automation_runs;
CREATE POLICY "Agency reads own automation runs"
  ON crm_automation_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM crm_automations a WHERE a.id = automation_id AND a.user_id = auth.uid()));

-- Codifica texto para URL (o wa.me precisa da mensagem em ?text=)
CREATE OR REPLACE FUNCTION public.crm_urlencode(p text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_bytes bytea := convert_to(coalesce(p, ''), 'UTF8');
  v_out   text  := '';
  v_b     integer;
  i       integer;
BEGIN
  FOR i IN 0 .. length(v_bytes) - 1 LOOP
    v_b := get_byte(v_bytes, i);
    IF (v_b BETWEEN 48 AND 57) OR (v_b BETWEEN 65 AND 90) OR (v_b BETWEEN 97 AND 122)
       OR v_b IN (45, 46, 95, 126) THEN
      v_out := v_out || chr(v_b);
    ELSE
      v_out := v_out || '%' || upper(lpad(to_hex(v_b), 2, '0'));
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

-- Troca {nome}, {primeiro_nome}, {empresa}, {agencia}, {etapa} e {valor}
CREATE OR REPLACE FUNCTION public.crm_fill_vars(p_text text, p_lead crm_leads, p_agency text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT replace(replace(replace(replace(replace(replace(coalesce(p_text, ''),
    '{nome}',          coalesce(p_lead.name, '')),
    '{primeiro_nome}', coalesce(split_part(btrim(p_lead.name), ' ', 1), '')),
    '{empresa}',       coalesce(p_lead.company, p_lead.name, '')),
    '{agencia}',       coalesce(p_agency, '')),
    '{etapa}',         coalesce((SELECT name FROM crm_columns WHERE id = p_lead.column_id), '')),
    '{valor}',         coalesce('R$ ' || to_char(p_lead.estimated_value, 'FM999G999G990D00'), ''));
$$;

CREATE OR REPLACE FUNCTION public.crm_run_automations(
  p_user uuid, p_lead uuid, p_trigger text, p_column uuid, p_event_ref text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a        crm_automations;
  v_lead   crm_leads;
  v_agency text;
  v_run_id uuid;
  v_text   text;
  v_title  text;
  v_link   text;
  v_days   integer;
  v_member team_members;
  v_col    uuid;
  v_summary text;
BEGIN
  IF p_lead IS NULL THEN RETURN; END IF;

  -- Cadeias (mover etapa → outra automação → mover de novo) param aqui:
  -- ninguém monta de propósito um fluxo com mais de três saltos, mas um ciclo
  -- A → B → A montado sem querer rodaria para sempre.
  IF pg_trigger_depth() > 6 THEN RETURN; END IF;

  SELECT coalesce(nullif(agency_name, ''), nullif(full_name, ''), 'nossa agência')
    INTO v_agency FROM profiles WHERE id = p_user;

  FOR a IN
    SELECT * FROM crm_automations
    WHERE user_id = p_user AND is_active AND trigger_type = p_trigger
      AND (trigger_column_id IS NULL OR trigger_column_id = p_column)
      -- "Parado há X dias": cada automação tem o próprio prazo. Sem esta
      -- condição, a de 3 dias puxaria junto a de 10 dias no terceiro dia.
      AND (p_trigger <> 'lead_parado' OR EXISTS (
            SELECT 1 FROM crm_leads l
            WHERE l.id = p_lead
              AND l.stage_entered_at < now() - make_interval(days => coalesce(trigger_days, 7))
          ))
    ORDER BY created_at
  LOOP
    INSERT INTO crm_automation_runs (automation_id, lead_id, event_ref)
    VALUES (a.id, p_lead, p_event_ref)
    ON CONFLICT (automation_id, lead_id, event_ref) DO NOTHING
    RETURNING id INTO v_run_id;

    CONTINUE WHEN v_run_id IS NULL;   -- este evento já rodou esta automação

    -- Relido a cada volta: a automação anterior pode ter mudado o lead
    SELECT * INTO v_lead FROM crm_leads WHERE id = p_lead;
    EXIT WHEN NOT FOUND;

    BEGIN
      v_summary := NULL;

      CASE a.action_type
        WHEN 'criar_tarefa' THEN
          v_title := left(crm_fill_vars(coalesce(nullif(a.action_params->>'title', ''), 'Falar com {nome}'), v_lead, v_agency), 200);
          v_days  := coalesce((a.action_params->>'due_in_days')::int, 0);
          SELECT * INTO v_member FROM team_members
           WHERE id = nullif(a.action_params->>'assignee_id', '')::uuid AND user_id = p_user;

          INSERT INTO tasks (user_id, title, description, due_date, priority, status,
                             assignee, assignee_id, crm_lead_id)
          VALUES (p_user, v_title,
                  nullif(crm_fill_vars(a.action_params->>'description', v_lead, v_agency), ''),
                  (now() AT TIME ZONE 'America/Sao_Paulo')::date + greatest(v_days, 0),
                  CASE WHEN a.action_params->>'priority' IN ('baixa', 'media', 'alta', 'urgente')
                       THEN a.action_params->>'priority' ELSE 'media' END,
                  'a_fazer', v_member.name, v_member.id, p_lead);
          v_summary := 'tarefa "' || v_title || '" criada';

        WHEN 'notificar' THEN
          v_text := crm_fill_vars(coalesce(nullif(a.action_params->>'message', ''), '{nome} precisa de atenção.'), v_lead, v_agency);
          PERFORM crm_notify(p_user, 'CRM_AUTOMATION', a.name, v_text, p_lead);
          v_summary := 'aviso enviado para a agência';

        WHEN 'lembrete_whatsapp' THEN
          v_text := crm_fill_vars(coalesce(nullif(a.action_params->>'message', ''), 'Olá, {primeiro_nome}! Tudo bem?'), v_lead, v_agency);
          IF crm_phone_key(v_lead.whatsapp) IS NULL THEN
            PERFORM crm_notify(p_user, 'CRM_AUTOMATION', a.name,
              v_lead.name || ' está sem WhatsApp no cadastro. Mensagem sugerida:' || E'\n\n' || v_text, p_lead);
            v_summary := 'mensagem sugerida (lead sem WhatsApp)';
          ELSE
            v_link := 'https://wa.me/55' || crm_phone_key(v_lead.whatsapp) || '?text=' || crm_urlencode(v_text);
            PERFORM crm_notify(p_user, 'CRM_AUTOMATION', a.name,
              'Mensagem pronta para ' || v_lead.name || ':' || E'\n\n' || v_text
                || E'\n\nToque para enviar do seu WhatsApp:\n' || v_link, p_lead);
            v_summary := 'mensagem de WhatsApp preparada';
          END IF;

        WHEN 'mover_etapa' THEN
          SELECT id INTO v_col FROM crm_columns
           WHERE id = nullif(a.action_params->>'column_id', '')::uuid AND user_id = p_user;
          IF v_col IS NULL THEN
            RAISE EXCEPTION 'A etapa de destino não existe mais';
          END IF;
          IF v_col IS DISTINCT FROM v_lead.column_id THEN
            UPDATE crm_leads SET column_id = v_col, position = 0 WHERE id = p_lead;
          END IF;
          v_summary := 'lead movido de etapa';

        WHEN 'agendar_contato' THEN
          v_days := greatest(coalesce((a.action_params->>'days')::int, 1), 0);
          UPDATE crm_leads
             SET next_contact_at = (now() AT TIME ZONE 'America/Sao_Paulo')::date + v_days
           WHERE id = p_lead;
          v_summary := 'próximo contato agendado para daqui a ' || v_days || ' dia(s)';

        WHEN 'definir_temperatura' THEN
          IF a.action_params->>'temperature' NOT IN ('frio', 'morno', 'quente') THEN
            RAISE EXCEPTION 'Temperatura inválida';
          END IF;
          UPDATE crm_leads SET temperature = a.action_params->>'temperature' WHERE id = p_lead;
          v_summary := 'temperatura alterada para ' || (a.action_params->>'temperature');
      END CASE;

      PERFORM crm_log(p_user, p_lead, 'automacao',
        'Automação "' || a.name || '": ' || coalesce(v_summary, 'executada'),
        jsonb_build_object('automation_id', a.id));

      UPDATE crm_automations
         SET run_count = run_count + 1, last_run_at = now(), last_error = NULL
       WHERE id = a.id;

    EXCEPTION WHEN others THEN
      -- A falha fica visível na tela de automações; a ação do usuário segue
      UPDATE crm_automation_runs SET status = 'erro', error = left(SQLERRM, 500) WHERE id = v_run_id;
      UPDATE crm_automations SET last_error = left(SQLERRM, 500), last_run_at = now() WHERE id = a.id;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_run_automations(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- "Lead parado há X dias na etapa": chamado uma vez por dia pelo lembrete
-- diário (073). A chave do evento é a data de entrada na etapa, então a mesma
-- estadia só dispara uma vez; se o lead sair e voltar, conta de novo.
CREATE OR REPLACE FUNCTION public.crm_run_stale_automations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT a.user_id, l.id AS lead_id, l.column_id, l.stage_entered_at
    FROM crm_automations a
    JOIN crm_leads   l ON l.user_id = a.user_id
    JOIN crm_columns c ON c.id = l.column_id
    WHERE a.is_active
      AND a.trigger_type = 'lead_parado'
      AND l.archived_at IS NULL
      AND c.stage_type = 'normal'
      AND (a.trigger_column_id IS NULL OR a.trigger_column_id = l.column_id)
      AND l.stage_entered_at < now() - make_interval(days => coalesce(a.trigger_days, 7))
  LOOP
    PERFORM crm_run_automations(r.user_id, r.lead_id, 'lead_parado', r.column_id,
      'parado:' || r.stage_entered_at::text);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_run_stale_automations() FROM PUBLIC, anon, authenticated;
