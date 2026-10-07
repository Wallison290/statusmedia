-- ── 092_notas_fiscais_assistidas.sql ──────────────────────────────────────────
-- Financeiro, Fase 3 (modo assistido): notas fiscais de serviço sem integração.
--
-- A nota só vale quando o governo autoriza, então quem emite é a agência, no
-- Emissor Nacional ou no portal da prefeitura. O StatusMedia:
--   • guarda a configuração fiscal da agência e os dados fiscais do cliente;
--   • lista o que foi faturado e ainda está sem nota ("Notas a emitir");
--   • prepara tudo para copiar e abre o portal;
--   • registra a nota emitida (número, data, PDF/XML) ligada às parcelas,
--     mostra no portal do cliente e manda o link junto da cobrança automática.
-- Nota e pagamento são independentes: nota emitida não quer dizer pago.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Configuração fiscal da agência ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_fiscal_settings (
  user_id              UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cnpj                 TEXT,
  legal_name           TEXT,
  municipal_reg        TEXT,        -- inscrição municipal
  tax_regime           TEXT         CHECK (tax_regime IN ('mei', 'simples', 'presumido', 'real', 'outro')),
  city                 TEXT,
  state                TEXT,
  issuing_portal       TEXT         NOT NULL DEFAULT 'nacional' CHECK (issuing_portal IN ('nacional', 'prefeitura')),
  portal_url           TEXT,
  service_code         TEXT,        -- código de tributação / item da lista do ISS que a contabilidade usa
  service_description  TEXT,        -- descrição padrão, com variáveis
  iss_rate             NUMERIC(5,2),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Dados fiscais do cliente (tomador do serviço) ────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS fiscal_document   TEXT,   -- CNPJ ou CPF, só números
  ADD COLUMN IF NOT EXISTS fiscal_name       TEXT,   -- razão social / nome completo
  ADD COLUMN IF NOT EXISTS fiscal_email      TEXT,
  ADD COLUMN IF NOT EXISTS municipal_reg     TEXT,
  ADD COLUMN IF NOT EXISTS address_zip       TEXT,
  ADD COLUMN IF NOT EXISTS address_street    TEXT,
  ADD COLUMN IF NOT EXISTS address_number    TEXT,
  ADD COLUMN IF NOT EXISTS address_complement TEXT,
  ADD COLUMN IF NOT EXISTS address_district  TEXT,
  ADD COLUMN IF NOT EXISTS address_city      TEXT,
  ADD COLUMN IF NOT EXISTS address_state     TEXT;

-- ── Notas emitidas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_invoices (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id          UUID          REFERENCES public.clients(id) ON DELETE SET NULL,
  number             TEXT          NOT NULL,
  issue_date         DATE          NOT NULL DEFAULT current_date,
  competence         DATE          NOT NULL,
  amount             NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description        TEXT,
  access_key         TEXT,         -- chave de acesso (NFS-e nacional) ou código de verificação
  pdf_url            TEXT,
  xml_url            TEXT,
  status             TEXT          NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida', 'cancelada')),
  notes              TEXT,
  created_by         UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_invoices_user_idx   ON public.fin_invoices (user_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS fin_invoices_client_idx ON public.fin_invoices (client_id);
-- O mesmo número não se repete na agência (nota cancelada libera)
CREATE UNIQUE INDEX IF NOT EXISTS fin_invoices_number_unique
  ON public.fin_invoices (user_id, number) WHERE status = 'emitida';

-- Uma parcela tem no máximo uma nota; uma nota pode cobrir várias parcelas
ALTER TABLE public.fin_entries
  ADD COLUMN IF NOT EXISTS invoice_id   UUID REFERENCES public.fin_invoices(id) ON DELETE SET NULL,
  -- "Esta parcela não precisa de nota" (ex.: reembolso de mídia)
  ADD COLUMN IF NOT EXISTS invoice_skip BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS fin_entries_invoice_idx ON public.fin_entries (invoice_id) WHERE invoice_id IS NOT NULL;

-- Nota cancelada solta as parcelas, que voltam para "a emitir"
CREATE OR REPLACE FUNCTION public.trg_fin_invoice_cancel()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
    UPDATE fin_entries SET invoice_id = NULL, updated_at = now() WHERE invoice_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fin_invoice_cancel ON public.fin_invoices;
CREATE TRIGGER trg_fin_invoice_cancel AFTER UPDATE ON public.fin_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_invoice_cancel();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.fin_fiscal_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_fiscal_settings_agency ON public.fin_fiscal_settings;
CREATE POLICY fin_fiscal_settings_agency ON public.fin_fiscal_settings FOR ALL
  USING ((user_id = auth.uid() OR public.is_agency_member(user_id)))
  WITH CHECK ((user_id = auth.uid() OR public.is_agency_member(user_id)));

ALTER TABLE public.fin_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fin_invoices_agency ON public.fin_invoices;
CREATE POLICY fin_invoices_agency ON public.fin_invoices FOR ALL
  USING ((user_id = auth.uid() OR public.is_agency_member(user_id)))
  WITH CHECK ((user_id = auth.uid() OR public.is_agency_member(user_id)));
-- O cliente vê as próprias notas no portal
DROP POLICY IF EXISTS fin_invoices_portal_read ON public.fin_invoices;
CREATE POLICY fin_invoices_portal_read ON public.fin_invoices FOR SELECT
  USING (status = 'emitida' AND client_id = public.get_my_linked_client_id());

-- ── Autoria e histórico (mesmos triggers da 090) ─────────────────────────────
DROP TRIGGER IF EXISTS trg_fin_invoices_authorship ON public.fin_invoices;
CREATE TRIGGER trg_fin_invoices_authorship BEFORE INSERT ON public.fin_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_authorship();
DROP TRIGGER IF EXISTS trg_fin_invoices_audit ON public.fin_invoices;
CREATE TRIGGER trg_fin_invoices_audit AFTER INSERT OR UPDATE OR DELETE ON public.fin_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_fin_audit();
