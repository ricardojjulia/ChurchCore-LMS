-- ============================================================
-- COUNCIL-2026-016 Prompt A: enrollment_type on course_sections
-- Adds enrollment_type column that controls student self-enroll
-- behaviour: open / cohort_gated / invite_only.
-- No RLS changes needed — existing course_sections policies
-- already cover this column.
-- ============================================================

ALTER TABLE public.course_sections
  ADD COLUMN IF NOT EXISTS enrollment_type TEXT NOT NULL DEFAULT 'open'
  CHECK (enrollment_type IN ('open', 'cohort_gated', 'invite_only'));
