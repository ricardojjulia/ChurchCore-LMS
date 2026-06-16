-- Migration 049: GIN indexes for fuzzy profile search + admin audit log
-- Enables efficient ILIKE queries on full_name and email in the search-users Edge Function.

-- pg_trgm was enabled in migration 047; this is a no-op if already present.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on display_name for fuzzy/partial name search
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING gin (display_name gin_trgm_ops);

-- Trigram index on email for fuzzy email search
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm
  ON public.profiles USING gin (email gin_trgm_ops);

-- Admin audit log — all admin search actions are recorded here.
-- Inserts are done via service role in the Edge Function; no client can insert directly.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        NOT NULL REFERENCES auth.users(id),
  action      text        NOT NULL,
  target_type text        NOT NULL,
  target_id   text,
  metadata    jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins and managers can read the audit log
CREATE POLICY "admins_read_audit_log"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (current_user_role() IN ('admin', 'manager'));

-- No client INSERT policy — only service role (Edge Function) can insert
