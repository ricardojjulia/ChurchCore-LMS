-- ─── Copilot review backlog: tenant-isolation + constraint hardening ─────────
-- Closes two unresolved review findings on already-merged migrations.

-- ─── 1. course_blocks anon preview: require block/course org agreement ────────
-- 20260920200000_public_course_preview.sql checked only the parent course and
-- its organization. The authenticated "course_blocks: manage own org" policy
-- lets an org admin/manager UPDATE a block's course_id without re-checking
-- that the new course is in the block's org, so a block from Org A could be
-- re-pointed at Org B's previewable course and its title would surface
-- publicly under Org B. Requiring course_blocks.org_id = c.org_id means a
-- block is only ever previewable under a course of its own org.

DROP POLICY IF EXISTS "course_blocks: anon public preview" ON public.course_blocks;

CREATE POLICY "course_blocks: anon public preview"
  ON public.course_blocks FOR SELECT TO anon
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.courses c
      JOIN public.organizations o ON o.id = c.org_id
      WHERE c.id = course_blocks.course_id
        AND c.org_id = course_blocks.org_id
        AND c.is_public_preview = true
        AND c.status = 'published'
        AND o.status = 'active'
    )
  );

-- ─── 2. signed_push configuration: reject NULL key material ──────────────────
-- 20260914160000_oneroster_signed_delivery.sql used bare length() predicates.
-- A CHECK passes when its expression is NULL, so a direct insert could create
-- a signed_push connection with a NULL key id or public key, which the
-- delivery endpoint then rejects on every package. Recreate the constraint
-- with explicit NOT NULL guards. Validation runs against existing rows: any
-- signed_push connection already missing key material fails this migration
-- loudly rather than being silently grandfathered.

ALTER TABLE public.oneroster_connections
  DROP CONSTRAINT IF EXISTS oneroster_connections_signed_push_configuration;

ALTER TABLE public.oneroster_connections
  ADD CONSTRAINT oneroster_connections_signed_push_configuration
  CHECK (
    transport <> 'signed_push'
    OR (
      provider = 'churchcore_academy'
      AND mode = 'academy_csv'
      AND signature_algorithm = 'ed25519'
      AND signature_key_id IS NOT NULL
      AND signature_public_key IS NOT NULL
      AND length(trim(signature_key_id)) BETWEEN 1 AND 120
      AND length(signature_public_key) BETWEEN 80 AND 4096
      AND schedule_interval_minutes IS NOT NULL
    )
  );
