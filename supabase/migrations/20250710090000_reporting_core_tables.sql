-- ============================================================
-- Migration: 20250710090000_reporting_core_tables.sql
-- Description: Reporting system core tables
-- ADR: ADR-2025-012 Amendment 001
-- Author: ChurchCore LMS Engineering
-- Date: 2025-07-10
-- Rollback: See 20250710090000_reporting_core_tables.down.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE RESTRICT,
  name          TEXT NOT NULL,
  report_type   TEXT NOT NULL CHECK (report_type IN ('gradebook','completion','engagement','attendance','certificate','custom')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_scheduled  BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_cron TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.report_artifacts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_definition_id     UUID REFERENCES public.report_definitions(id) ON DELETE CASCADE,
  org_id                   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  generated_by             UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  format                   TEXT NOT NULL CHECK (format IN ('pdf','xlsx','json','csv')),
  storage_path             TEXT,
  archive_storage_path     TEXT,
  signed_url               TEXT,
  signed_url_expires       TIMESTAMPTZ,
  row_count                INTEGER,
  generation_status        TEXT NOT NULL DEFAULT 'pending' CHECK (generation_status IN ('pending','processing','complete','failed')),
  error_message            TEXT,
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at               TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  archived_at              TIMESTAMPTZ,
  retention_class          TEXT NOT NULL DEFAULT 'standard' CHECK (retention_class IN ('standard','ferpa','extended'))
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  course_id   UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id   UUID REFERENCES public.modules(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN ('module_view','module_complete','assignment_submit','quiz_attempt','video_watch','login','certificate_earned')),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.analytics_events IS 'FERPA:educational_record — learning activity data';

CREATE TABLE IF NOT EXISTS public.report_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id         UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE RESTRICT,
  actor_role       TEXT NOT NULL,
  actor_email      TEXT NOT NULL,
  action           TEXT NOT NULL CHECK (action IN (
    'report_created','report_viewed','report_exported_pdf','report_exported_xlsx',
    'report_exported_csv','report_scheduled','report_deleted',
    'report_definition_created','report_definition_updated','report_definition_deleted',
    'report_artifact_accessed','report_artifact_expired','bulk_export_initiated',
    'student_self_export'
  )),
  resource_type    TEXT NOT NULL CHECK (resource_type IN ('report_definition','report_artifact','analytics_dashboard')),
  resource_id      UUID,
  target_user_id   UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  target_course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  request_ip       INET,
  user_agent       TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at      TIMESTAMPTZ,
  retention_class  TEXT NOT NULL DEFAULT 'standard' CHECK (retention_class IN ('standard','ferpa','extended'))
);

CREATE OR REPLACE RULE no_update_audit AS
  ON UPDATE TO public.report_audit_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE no_delete_audit AS
  ON DELETE TO public.report_audit_log DO INSTEAD NOTHING;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ferpa_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS data_retention_override_days INTEGER;

ALTER TABLE public.course_certificates
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_generation_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  ALTER TABLE public.course_certificates
    ADD CONSTRAINT course_certificates_pdf_generation_status_check
    CHECK (pdf_generation_status IN ('pending','processing','complete','failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.reporting_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_definitions_updated_at ON public.report_definitions;
CREATE TRIGGER trg_report_definitions_updated_at
  BEFORE UPDATE ON public.report_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.reporting_set_updated_at();

DO $$
BEGIN
  IF to_regclass('public.submissions') IS NOT NULL THEN
    COMMENT ON TABLE public.submissions IS 'FERPA:educational_record — submitted coursework and grades';
  END IF;
  IF to_regclass('public.enrollments') IS NOT NULL THEN
    COMMENT ON TABLE public.enrollments IS 'FERPA:educational_record — course enrollment and progress';
  END IF;
END $$;

COMMENT ON TABLE public.report_audit_log IS 'FERPA:educational_record — immutable reporting access and export audit log';
COMMENT ON TABLE public.analytics_events IS 'FERPA:educational_record — learning activity data';
