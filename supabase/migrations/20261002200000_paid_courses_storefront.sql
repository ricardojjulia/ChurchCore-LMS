-- Migration: Paid Courses & Course Storefront (COUNCIL-2026-039)
-- Option A: Church collects directly via Stripe Connect Standard / Express.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_connect_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_status text NOT NULL DEFAULT 'not_connected';

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS price_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency varchar(3) DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS seat_limit integer DEFAULT NULL;

CREATE TABLE IF NOT EXISTS course_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  buyer_uid uuid REFERENCES profiles(uid) ON DELETE SET NULL,
  buyer_email text NOT NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'succeeded' | 'refunded' | 'failed'
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_course_purchases_org_id ON course_purchases(org_id);
CREATE INDEX IF NOT EXISTS idx_course_purchases_course_id ON course_purchases(course_id);
CREATE INDEX IF NOT EXISTS idx_course_purchases_buyer_uid ON course_purchases(buyer_uid);
CREATE INDEX IF NOT EXISTS idx_course_purchases_session_id ON course_purchases(stripe_checkout_session_id);

-- Enable RLS
ALTER TABLE course_purchases ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins and managers can view org purchases"
  ON course_purchases FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM profiles
      WHERE auth_id = auth.uid()
      AND role IN ('admin', 'manager', 'platform_admin')
    )
  );

CREATE POLICY "Buyers can view their own purchases"
  ON course_purchases FOR SELECT
  USING (
    buyer_uid IN (
      SELECT uid FROM profiles WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "Platform admins have full access to course purchases"
  ON course_purchases FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE auth_id = auth.uid() AND role = 'platform_admin'
    )
  );
