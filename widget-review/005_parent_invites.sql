-- ============================================================
-- Migration 005: parent_invites + affiliate_configs
-- ============================================================
-- Mom-Graph / Parent-zu-Parent Schnupper-Empfehlung + Rewards
-- Ergänzt den existierenden ParentInviteService (in-memory scaffold)
-- um eine persistente Supabase-Schicht.
-- ============================================================

-- ------------------------------------------------------------
-- AFFILIATE CONFIGURATION (pro Provider)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_configs (
  provider_id uuid PRIMARY KEY REFERENCES providers(id) ON DELETE CASCADE,
  weeks_per_credit int NOT NULL DEFAULT 4 CHECK (weeks_per_credit > 0),
  min_credits int NOT NULL DEFAULT 1 CHECK (min_credits >= 0),
  max_credits int NOT NULL DEFAULT 5 CHECK (max_credits >= 1),
  payment_method_wait_days jsonb NOT NULL DEFAULT '{
    "invoice": 0,
    "bank_transfer": 0,
    "paypal": 0,
    "credit_card": 14,
    "sepa_debit": 14,
    "cash": 0,
    "on_site": 0
  }'::jsonb,
  default_wait_days int NOT NULL DEFAULT 14 CHECK (default_wait_days >= 0),
  excluded_methods text[] NOT NULL DEFAULT ARRAY[]::text[],
  auto_coupon_enabled boolean NOT NULL DEFAULT true,
  auto_coupon_percent_off int NOT NULL DEFAULT 10 CHECK (auto_coupon_percent_off BETWEEN 0 AND 100),
  auto_coupon_max_euro_off int NOT NULL DEFAULT 20 CHECK (auto_coupon_max_euro_off >= 0),
  auto_coupon_valid_days int NOT NULL DEFAULT 60 CHECK (auto_coupon_valid_days > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE affiliate_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on affiliate_configs"
  ON affiliate_configs FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ------------------------------------------------------------
-- PARENT INVITES (Mom-Graph Edges)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parent_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Wer lädt ein, wohin
  inviter_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,

  -- URL-Code (8-stellig, kleine Buchstaben + Ziffern, keine Verwechslungen)
  code text UNIQUE NOT NULL,

  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','trial_booked','converted','rewarded','expired','cancelled')),

  -- Phase 2: Trial-Buchung von Parent B
  invitee_parent_id uuid REFERENCES parents(id) ON DELETE SET NULL,
  invitee_trial_id uuid,  -- REFERENCES trials wenn Tabelle existiert
  trial_booked_at timestamptz,

  -- Phase 3: Conversion (zahlende Buchung)
  invitee_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  converted_at timestamptz,
  course_duration_weeks int CHECK (course_duration_weeks > 0),
  payment_method text CHECK (payment_method IN ('invoice','bank_transfer','paypal','credit_card','sepa_debit','cash','on_site')),

  -- Phase 4: Reward ausgezahlt
  reward_credits int CHECK (reward_credits >= 0),
  rewarded_at timestamptz,
  reward_skipped_reason text,

  -- Auto-Gutschein für Parent B's erste zahlende Buchung
  coupon_code text UNIQUE,
  coupon_percent_off int CHECK (coupon_percent_off BETWEEN 0 AND 100),
  coupon_max_euro_off int CHECK (coupon_max_euro_off >= 0),
  coupon_valid_until timestamptz,
  coupon_used_at timestamptz,
  coupon_used_on_booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  coupon_discount_euro numeric(10,2) CHECK (coupon_discount_euro >= 0),

  -- Analytics
  view_count int NOT NULL DEFAULT 0,
  last_viewed_at timestamptz
);

-- Indexes für Query-Performance
CREATE INDEX IF NOT EXISTS idx_parent_invites_inviter ON parent_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_parent_invites_invitee ON parent_invites(invitee_parent_id) WHERE invitee_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_invites_provider ON parent_invites(provider_id);
CREATE INDEX IF NOT EXISTS idx_parent_invites_status ON parent_invites(status);
CREATE INDEX IF NOT EXISTS idx_parent_invites_converted_at ON parent_invites(converted_at) WHERE converted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parent_invites_expires ON parent_invites(expires_at) WHERE status = 'pending';

-- RLS
ALTER TABLE parent_invites ENABLE ROW LEVEL SECURITY;

-- Service role (Backend mit service_role-Key) hat vollen Zugriff
CREATE POLICY "Service role full access on parent_invites"
  ON parent_invites FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated user kann eigene Invites (als Inviter) sehen
CREATE POLICY "Parents see their own invites"
  ON parent_invites FOR SELECT TO authenticated
  USING (inviter_id = auth.uid());

-- Authenticated user kann neue Invites für sich selbst erstellen
CREATE POLICY "Parents create their own invites"
  ON parent_invites FOR INSERT TO authenticated
  WITH CHECK (inviter_id = auth.uid());


-- ------------------------------------------------------------
-- Helper-View: Mom-Graph-Statistik pro Provider (Marketing-Dashboard)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW parent_invite_stats AS
SELECT
  provider_id,
  count(*) FILTER (WHERE status = 'pending')       AS pending_count,
  count(*) FILTER (WHERE status = 'trial_booked')  AS trial_booked_count,
  count(*) FILTER (WHERE status = 'converted')     AS converted_count,
  count(*) FILTER (WHERE status = 'rewarded')      AS rewarded_count,
  count(*) FILTER (WHERE status = 'expired')       AS expired_count,
  count(*) FILTER (WHERE status = 'cancelled')     AS cancelled_count,
  count(*)                                         AS total_count,
  coalesce(sum(reward_credits) FILTER (WHERE status = 'rewarded'), 0) AS total_credits_issued,
  coalesce(sum(coupon_discount_euro) FILTER (WHERE coupon_used_at IS NOT NULL), 0) AS total_coupon_discount_euro
FROM parent_invites
GROUP BY provider_id;

COMMENT ON TABLE parent_invites IS 'Mom-Graph: Parent-zu-Parent Schnupper-Einladungen mit Reward-Tracking';
COMMENT ON TABLE affiliate_configs IS 'Provider-spezifische Mom-Graph-Konfiguration (Credits, Wartefristen, Coupons)';
COMMENT ON VIEW parent_invite_stats IS 'Aggregierte Funnel-Zahlen pro Provider für Marketing-Dashboard';
