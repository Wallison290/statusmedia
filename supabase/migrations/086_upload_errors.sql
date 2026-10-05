-- ── 086: registro de falhas de upload ───────────────────────────────────────
-- Idempotente.
--
-- Upload que falha no navegador não deixa rastro no servidor (a falha acontece
-- entre o aparelho e o Cloudflare R2). O app grava aqui cada falha: em que
-- etapa, o motivo, o arquivo e o aparelho. É o que permite achar a causa de
-- erros que só acontecem de vez em quando.

CREATE TABLE IF NOT EXISTS public.upload_errors (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage       text        NOT NULL,   -- preparar | enviar | supabase
  message     text,
  http_status integer,
  attempt     integer,
  file_name   text,
  file_type   text,
  file_size   bigint,
  online      boolean,
  user_agent  text,
  page        text,
  recovered   boolean     NOT NULL DEFAULT false,  -- a reserva (Supabase) salvou o envio
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS upload_errors_user_idx ON public.upload_errors (user_id, created_at DESC);

ALTER TABLE public.upload_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User logs own upload errors" ON public.upload_errors;
CREATE POLICY "User logs own upload errors"
  ON public.upload_errors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User reads own upload errors" ON public.upload_errors;
CREATE POLICY "User reads own upload errors"
  ON public.upload_errors FOR SELECT
  USING (auth.uid() = user_id);
