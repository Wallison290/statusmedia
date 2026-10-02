-- ── 084: CRM — custos/taxas do lead ────────────────────────────────────────
-- Idempotente.
--
-- Ao lado do valor estimado (bruto), o custo do serviço: taxas de cartão,
-- impostos, ferramentas, terceirizados. Líquido = estimated_value - estimated_cost,
-- calculado na tela e nos relatórios (não fica gravado, para nunca divergir).

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS estimated_cost numeric;
