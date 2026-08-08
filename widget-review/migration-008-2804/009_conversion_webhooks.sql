-- Migration 009: Conversion-Webhooks for server-side tracking (Meta CAPI, GA4 MP, etc.)
-- =====================================================================================
-- Use case: Provider sets up an outgoing webhook (n8n / Zapier / Make / own endpoint)
-- and UKC POSTs standardized booking events with hashed identifiers (SHA256, CAPI-compliant)
-- on every booking_confirmed / payment_received / refund / customer_signup event.
-- Failed deliveries are retried via background worker.

CREATE TABLE IF NOT EXISTS conversion_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT,                                          -- HMAC-SHA256 secret (optional)
  events TEXT[] NOT NULL DEFAULT ARRAY['booking_confirmed', 'payment_received'],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id)                                  -- One webhook per provider for now
);

CREATE INDEX IF NOT EXISTS conversion_webhooks_provider_idx ON conversion_webhooks(provider_id);
CREATE INDEX IF NOT EXISTS conversion_webhooks_active_idx ON conversion_webhooks(active) WHERE active = TRUE;

-- Delivery log + retry queue (Postgres-as-queue pattern, similar to pending_sends)
CREATE TABLE IF NOT EXISTS conversion_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES conversion_webhooks(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,                               -- Dedup-Key (matches browser-pixel event_id)
  event_name TEXT NOT NULL,                             -- 'Purchase', 'Lead', etc. (CAPI-naming)
  trigger_type TEXT NOT NULL,                           -- 'booking_confirmed', 'payment_received', ...
  payload JSONB NOT NULL,                               -- Full CAPI-compatible payload
  status TEXT NOT NULL DEFAULT 'pending',               -- 'pending' | 'sending' | 'success' | 'failed'
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  response_status INT,                                  -- HTTP status from endpoint
  response_body TEXT,                                   -- Truncated to 1000 chars
  last_error TEXT,
  next_retry_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (webhook_id, event_id)                         -- Idempotency: one delivery per event per webhook
);

CREATE INDEX IF NOT EXISTS conversion_deliveries_status_idx
  ON conversion_deliveries(status, next_retry_at)
  WHERE status IN ('pending', 'sending');

CREATE INDEX IF NOT EXISTS conversion_deliveries_provider_created_idx
  ON conversion_deliveries(provider_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversion_deliveries_webhook_idx
  ON conversion_deliveries(webhook_id, created_at DESC);

COMMENT ON TABLE conversion_webhooks IS 'Provider-konfigurierter Outgoing-Webhook für Server-Side-Tracking (Meta CAPI, GA4 MP, Google Ads, n8n, etc.)';
COMMENT ON TABLE conversion_deliveries IS 'Delivery-Log + Retry-Queue für Conversion-Webhook-Sendungen';
COMMENT ON COLUMN conversion_deliveries.event_id IS 'Eindeutiger Dedup-Key — 1:1 mit Browser-Pixel event_id für Server+Pixel-Dedup';
