-- ============================================================
-- Migration 008: Marketing Send Queue + Consent Tracking
-- ============================================================
-- Phase 1 des Marketing-Flow-Editors: Postgres-as-Queue.
--
-- Bestehende Tabellen werden NICHT verändert:
--   automation_flows  (= Flow-Definition: trigger, channel, delay, template, conditions)
--   message_templates (= Template-Bibliothek pro Provider)
--   marketing_campaigns (= one-shot Mass-Sends, separat von Flows)
--   notifications     (= in-app Bell + provider notifications)
--
-- Neu in dieser Migration:
--   pending_sends      (Queue + Audit: jeder Flow-Trigger erzeugt 1 Row, status pending → sent)
--   marketing_consent  (DSGVO-Opt-in/out pro Parent x Channel)
--   notifications.flow_id / pending_send_id  (Verknüpfung Audit ↔ Flow)
--
-- Architektur-Entscheidung:
--   pending_sends ist gleichzeitig Queue UND Audit-Log.
--   Worker claimt mit FOR UPDATE SKIP LOCKED, setzt status='sending'→'sent'/'failed'.
--   Sent rows werden NICHT gelöscht (Compliance-Audit + Send-Counts-Quelle).
--   Idempotenz via UNIQUE(flow_id, event_id, recipient_id) — Re-Trigger eines Events
--   für denselben Flow x Empfänger fügt nichts ein (ON CONFLICT DO NOTHING).
-- ============================================================

-- ------------------------------------------------------------
-- 1. PENDING_SENDS: Queue + Audit-Log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pending_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Flow-Verknüpfung
  flow_id uuid NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  -- Trigger-Kontext (zum Idempotenz-Check + Debug)
  event_type text NOT NULL,        -- 'booking_confirmed', 'session_cancelled', 'birthday', ...
  event_id uuid NOT NULL,          -- ID der auslösenden Entity (booking.id, session.id, parent.id, ...)
  event_at timestamptz NOT NULL DEFAULT now(),

  -- Empfänger (denormalisiert: erhält Empfänger-Daten zum Zeitpunkt des Triggers,
  -- damit Opt-Out / Account-Löschung den Audit-Trail nicht zerstört)
  recipient_type text NOT NULL CHECK (recipient_type IN ('parent','provider','instructor','admin')),
  recipient_id uuid NOT NULL,
  recipient_email text,
  recipient_phone text,
  recipient_name text,

  -- Render-Kontext für Template-Variablen (z.B. {courseName}, {childName})
  -- Wird beim Trigger-Hook gefüllt, vom Worker zur Render-Zeit konsumiert.
  template_vars jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Channel-Snapshot (kopiert von flow.channel zum Schutz gegen nachträgliche Flow-Edits)
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms','in_app')),

  -- Scheduling
  scheduled_at timestamptz NOT NULL,

  -- Lifecycle
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed','skipped','cancelled')),

  -- Retry-Tracking
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  last_attempted_at timestamptz,

  -- Sent-State
  sent_at timestamptz,
  external_message_id text,         -- ID vom Mailgun/WhatsApp/SMS-Provider für Delivery-Tracking

  -- Skip-Reason (bei status='skipped' z.B. "Empfänger hat opt-out")
  skip_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotenz: kein Doppel-Send für gleichen Flow × Event × Empfänger
CREATE UNIQUE INDEX IF NOT EXISTS pending_sends_idem_idx
  ON pending_sends (flow_id, event_id, recipient_id);

-- Worker-Polling: schneller Scan auf "due now"
CREATE INDEX IF NOT EXISTS pending_sends_due_idx
  ON pending_sends (scheduled_at)
  WHERE status = 'pending';

-- Per-Provider Listing (Dashboard "letzte Sends")
CREATE INDEX IF NOT EXISTS pending_sends_provider_idx
  ON pending_sends (provider_id, scheduled_at DESC);

-- Per-Flow Aggregation (Send-Counts)
CREATE INDEX IF NOT EXISTS pending_sends_flow_status_idx
  ON pending_sends (flow_id, status);

-- updated_at-Trigger
DROP TRIGGER IF EXISTS pending_sends_updated_at ON pending_sends;
CREATE TRIGGER pending_sends_updated_at
  BEFORE UPDATE ON pending_sends
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- RLS: Service-Role-Bypass (Backend nutzt service_role client)
ALTER TABLE pending_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on pending_sends" ON pending_sends;
CREATE POLICY "Service role full access on pending_sends"
  ON pending_sends FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ------------------------------------------------------------
-- 2. MARKETING_CONSENT: DSGVO Opt-in/out pro Parent x Channel
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms')),

  granted boolean NOT NULL DEFAULT true,
  source text,                       -- 'signup','profile-page','unsubscribe-link','admin'

  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,

  -- Audit
  ip_address text,
  user_agent text,

  UNIQUE (parent_id, channel)
);

CREATE INDEX IF NOT EXISTS marketing_consent_parent_idx
  ON marketing_consent (parent_id, channel);

-- RLS
ALTER TABLE marketing_consent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on marketing_consent" ON marketing_consent;
CREATE POLICY "Service role full access on marketing_consent"
  ON marketing_consent FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ------------------------------------------------------------
-- 3. NOTIFICATIONS: Verknüpfung mit Flows (für Audit-Trail)
-- ------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES automation_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_send_id uuid REFERENCES pending_sends(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notifications_flow_idx
  ON notifications(flow_id) WHERE flow_id IS NOT NULL;


-- ------------------------------------------------------------
-- 4. SEND-COUNTS VIEW (für Dashboard, Aggregation einer Stelle)
-- ------------------------------------------------------------
DROP VIEW IF EXISTS marketing_flow_stats;
CREATE VIEW marketing_flow_stats AS
SELECT
  f.id                                              AS flow_id,
  f.provider_id,
  f.name,
  f.trigger_type,
  f.channel,
  f.status                                          AS flow_status,
  COUNT(ps.id) FILTER (WHERE ps.status = 'pending')                       AS sends_pending,
  COUNT(ps.id) FILTER (WHERE ps.status = 'sent')                          AS sends_sent,
  COUNT(ps.id) FILTER (WHERE ps.status = 'failed')                        AS sends_failed,
  COUNT(ps.id) FILTER (WHERE ps.status = 'skipped')                       AS sends_skipped,
  COUNT(ps.id) FILTER (WHERE ps.status = 'sent' AND ps.sent_at >= now() - interval '30 days')  AS sends_30d,
  MAX(ps.sent_at)                                   AS last_sent_at
FROM automation_flows f
LEFT JOIN pending_sends ps ON ps.flow_id = f.id
GROUP BY f.id, f.provider_id, f.name, f.trigger_type, f.channel, f.status;


-- ------------------------------------------------------------
-- COMMENTS (Doku in der DB)
-- ------------------------------------------------------------
COMMENT ON TABLE pending_sends IS
  'Marketing-Flow-Queue + Audit-Log. Worker claimt mit FOR UPDATE SKIP LOCKED. Sent-Rows bleiben für Compliance.';
COMMENT ON COLUMN pending_sends.template_vars IS
  'JSON-Kontext für Template-Render zur Send-Zeit (Variablen wie courseName, childName, sessionDate).';
COMMENT ON COLUMN pending_sends.event_id IS
  'ID der auslösenden Entity. Plus flow_id + recipient_id = eindeutiger Idempotenz-Key.';
COMMENT ON TABLE marketing_consent IS
  'DSGVO-Opt-in/out pro Parent × Channel. Worker prüft vor Send: granted=false → status=skipped.';
COMMENT ON VIEW marketing_flow_stats IS
  'Aggregierte Send-Counts pro Flow für Dashboard. Refresh on demand (kein Materialized).';
