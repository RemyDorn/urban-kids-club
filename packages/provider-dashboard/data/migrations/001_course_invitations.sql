-- Migration: Create course_invitations table for tracking parent invitations
-- Run this in Supabase SQL Editor or via `supabase db push`

CREATE TABLE IF NOT EXISTS course_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  parent_id uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  coupon_code text,
  email_sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate invitations for same parent + activity
  UNIQUE (provider_id, activity_id, parent_id)
);

-- Index for fast lookup by provider + activity
CREATE INDEX IF NOT EXISTS idx_course_invitations_provider_activity
  ON course_invitations(provider_id, activity_id);

-- Index for checking if a parent was already invited
CREATE INDEX IF NOT EXISTS idx_course_invitations_parent
  ON course_invitations(parent_id);

-- RLS
ALTER TABLE course_invitations ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend uses service_role key)
CREATE POLICY "Service role full access on course_invitations"
  ON course_invitations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
