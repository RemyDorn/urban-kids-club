-- ==========================================================================
-- Migration 006 — Parent Federation (Hybrid B/C Architecture)
--
-- Goal:
--   Email = global account anchor across providers, while each provider keeps
--   white-label branding and provider-scoped data hoheit.
--
-- Strategy:
--   - parents          = one row per real human, globally unique by email
--   - parent_links     = M:N between parents and providers (one link per
--                        relationship; carries provider-scoped data like
--                        first booking, marketing consent, …)
--   - existing tables  = continue to reference parents.id, but provider-scoped
--                        queries always JOIN parent_links to enforce hoheit.
--
-- DSGVO impact:
--   - A provider only sees parent rows for which a parent_link exists in their
--     own provider context (RLS policy below).
--   - Cross-provider visibility is opt-in (parent_links.share_with_other_providers).
--   - Email lookup at signup checks for existing parents but NEVER reveals
--     provider list to the calling provider — only the parent themself can
--     view "all my providers" via /portal master view (Phase 2).
-- ==========================================================================

BEGIN;

-- 1. Global parent identity ---------------------------------------------------
CREATE TABLE IF NOT EXISTS parents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,           -- case-insensitive (CITEXT extension)
  email_verified  TIMESTAMPTZ,
  display_name    TEXT,                             -- "Hannah B." (parent-controlled)
  phone           TEXT,
  locale          TEXT NOT NULL DEFAULT 'de-DE',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ,
  -- soft-delete: retain row for cross-provider analytics, hide from UI
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_parents_email_active
  ON parents (email) WHERE deleted_at IS NULL;

COMMENT ON TABLE parents IS
  'Global parent identity. Email is unique anchor; one row per human across all providers.';
COMMENT ON COLUMN parents.email IS
  'Lowercased on insert via CITEXT. Never exposed cross-provider without explicit consent.';


-- 2. Parent ↔ Provider relationships ------------------------------------------
CREATE TABLE IF NOT EXISTS parent_provider_links (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id                UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  provider_id              UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  -- per-provider profile data (was previously on customers table)
  provider_first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_last_booking_at TIMESTAMPTZ,
  marketing_consent        BOOLEAN NOT NULL DEFAULT FALSE,
  marketing_consent_at     TIMESTAMPTZ,
  -- Phase 2 (B2C federation switch): if TRUE, this link surfaces in the
  -- parent's UKC-master view. Default FALSE → status quo (white-label only).
  share_with_other_providers BOOLEAN NOT NULL DEFAULT FALSE,
  -- archive without losing history when provider terminates relationship
  archived_at              TIMESTAMPTZ,
  archive_reason           TEXT,
  UNIQUE (parent_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_pp_links_provider_active
  ON parent_provider_links (provider_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pp_links_parent
  ON parent_provider_links (parent_id);

COMMENT ON TABLE parent_provider_links IS
  'M:N between parents and providers. White-label hoheit per row; cross-provider sharing opt-in.';


-- 3. Children (under parent, can be referenced by multiple providers) --------
-- Children stay parent-scoped. A provider sees a child only if the child has
-- bookings or interest at that provider (enforced in RLS).
CREATE TABLE IF NOT EXISTS children (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  first_name   TEXT NOT NULL,
  birth_date   DATE,
  notes        TEXT,                                  -- allergies, special needs (parent-controlled)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_children_parent ON children (parent_id);


-- 4. Magic-link auth tokens (provider-scoped issuance) ------------------------
CREATE TABLE IF NOT EXISTS parent_magic_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  -- Which provider issued the magic link → determines which provider portal
  -- the parent lands on. Even though the account is global, the entrypoint
  -- is provider-bound to preserve white-label experience.
  issuing_provider_id  UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  token_hash    BYTEA NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_magic_links_parent ON parent_magic_links (parent_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_unused
  ON parent_magic_links (parent_id, expires_at) WHERE used_at IS NULL;


-- 5. Backfill from existing customers tables ---------------------------------
-- (Each provider currently has a customers table referenced by bookings.
--  We migrate by collapsing duplicates by lowercased email into parents,
--  then create one parent_provider_link per old customer row.)
--
-- Pseudocode (run per-provider in app code, not in this migration):
--   FOR each customer in old.customers:
--     INSERT INTO parents (email, display_name, phone)
--       VALUES (lower(customer.email), customer.name, customer.phone)
--     ON CONFLICT (email) DO UPDATE SET last_seen_at = NOW()
--     RETURNING id INTO parent_id;
--     INSERT INTO parent_provider_links (parent_id, provider_id, provider_first_seen_at, marketing_consent)
--       VALUES (parent_id, current_provider_id, customer.created_at, customer.marketing_consent)
--     ON CONFLICT (parent_id, provider_id) DO NOTHING;
--
-- The old customers table is kept as customers_legacy for one quarter, then
-- dropped in migration 010. Do NOT delete here.


-- 6. Row-Level Security policies ---------------------------------------------
ALTER TABLE parents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_provider_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE children               ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_magic_links     ENABLE ROW LEVEL SECURITY;

-- Provider-scoped: provider can only see parents linked to itself.
CREATE POLICY parents_provider_scope ON parents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM parent_provider_links ppl
      WHERE ppl.parent_id = parents.id
        AND ppl.provider_id = current_setting('app.current_provider_id', true)::UUID
        AND ppl.archived_at IS NULL
    )
  );

-- Parent self-access: parent can see their own row + all their links across
-- all providers (this is what powers the future master-view in Phase 2).
CREATE POLICY parents_self_access ON parents
  FOR SELECT
  USING (id = current_setting('app.current_parent_id', true)::UUID);

CREATE POLICY parent_links_provider_scope ON parent_provider_links
  FOR ALL
  USING (provider_id = current_setting('app.current_provider_id', true)::UUID);

CREATE POLICY parent_links_self_access ON parent_provider_links
  FOR SELECT
  USING (parent_id = current_setting('app.current_parent_id', true)::UUID);

CREATE POLICY children_parent_access ON children
  FOR ALL
  USING (parent_id = current_setting('app.current_parent_id', true)::UUID);

CREATE POLICY children_provider_visible_via_booking ON children
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.child_id = children.id
        AND b.provider_id = current_setting('app.current_provider_id', true)::UUID
    )
  );


-- 7. Phase-2 hook (DO NOT use in Phase 1, kept for documentation) -------------
-- View that powers the future "Kids Club Master App":
--   surfaces all providers a parent has opted-in to share with.
CREATE OR REPLACE VIEW v_parent_federated_providers AS
SELECT
  p.id                       AS parent_id,
  p.email,
  p.display_name,
  ppl.provider_id,
  pr.slug                    AS provider_slug,
  pr.display_name            AS provider_name,
  ppl.provider_first_seen_at,
  ppl.provider_last_booking_at,
  ppl.share_with_other_providers
FROM parents p
JOIN parent_provider_links ppl ON ppl.parent_id = p.id AND ppl.archived_at IS NULL
JOIN providers pr              ON pr.id = ppl.provider_id
WHERE ppl.share_with_other_providers = TRUE;

COMMENT ON VIEW v_parent_federated_providers IS
  'Phase-2 only: do not query from white-label provider portals. Only the future Kids Club master app may use this.';


COMMIT;
