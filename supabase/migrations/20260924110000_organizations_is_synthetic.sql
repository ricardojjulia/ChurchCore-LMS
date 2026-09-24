-- ─── organizations.is_synthetic (COUNCIL-2026-031 D8) ────────────────────────
-- Marks the production synthetic-QA tenant used by the post-release suite so
-- it can be labelled in the platform console and kept out of billing.
-- Existing tenants default to false.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.is_synthetic IS
  'True only for the post-release synthetic-QA tenant (slug synthetic-qa). Never billed.';
