-- Migration 030: Fix Supabase security linter errors
--
-- 1. v_unified_calendar — recreate with security_invoker = true so RLS on the
--    underlying calendar_events table is evaluated as the querying user, not
--    the view owner. Without this the view silently bypasses RLS.
--
-- 2. block_types — static lookup table missing RLS. Enable RLS and add a
--    read-only policy for authenticated users. No write policies are added,
--    so INSERT/UPDATE/DELETE are blocked for all roles except superuser/service.

-- ── 1. Fix v_unified_calendar ────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_unified_calendar;

CREATE VIEW public.v_unified_calendar
  WITH (security_invoker = true)
AS
SELECT
  ce.id::TEXT      AS source_id,
  ce.event_type,
  ce.title,
  ce.description,
  ce.course_id,
  ce.user_id,
  ce.scope,
  ce.starts_at,
  ce.ends_at,
  ce.is_all_day,
  ce.color_code,
  ce.location,
  c.title          AS course_name
FROM public.calendar_events ce
LEFT JOIN public.courses c ON c.id = ce.course_id;

COMMENT ON VIEW public.v_unified_calendar IS
  'Unified calendar surface. security_invoker=true ensures RLS on calendar_events applies to the querying user.';

-- ── 2. Fix block_types ────────────────────────────────────────────────────────

ALTER TABLE public.block_types ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read block type definitions (it is a static registry).
-- No INSERT / UPDATE / DELETE policies are created — those operations are
-- blocked by default when RLS is enabled, and must go through the service role.
CREATE POLICY "block_types: authenticated read"
  ON public.block_types
  FOR SELECT
  TO authenticated
  USING (true);
