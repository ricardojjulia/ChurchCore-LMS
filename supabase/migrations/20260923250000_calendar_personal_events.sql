-- ─── calendar_events: members manage their own personal events ───────────────
-- Found by the COUNCIL-2026-031 flows. /calendar/new offers every signed-in
-- user a "personal" scope (CalendarEventForm), but the only write policy was
-- "staff manage own org", so a learner's personal event was always rejected.
-- This adds exactly that capability: personal-scope rows owned by, and only
-- visible to, the caller, inside the caller's org.

CREATE POLICY "calendar_events: members manage own personal events"
  ON public.calendar_events FOR ALL TO authenticated
  USING (
    scope = 'personal'
    AND user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  )
  WITH CHECK (
    scope = 'personal'
    AND user_id = public.current_user_uid()
    AND created_by = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );
