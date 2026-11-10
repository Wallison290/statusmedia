-- ── 117: cada instância de WhatsApp das agências guarda o servidor UazAPI dela ──
-- Em 10/11/2026 entrou o servidor novo (statusmediaapp.uazapi.com, plano de 100
-- instâncias). Os números já conectados continuam no servidor antigo
-- (statusmedia.uazapi.com) sem precisar ler o QR de novo; instâncias novas são
-- criadas no servidor do secret AGENCY_UAZAPI_URL (o novo). server_url vazio =
-- servidor do secret.
ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS server_url TEXT;

UPDATE whatsapp_instances SET server_url = 'https://statusmedia.uazapi.com' WHERE server_url IS NULL;
