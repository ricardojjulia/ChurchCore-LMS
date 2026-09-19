-- COUNCIL-2026-019: signed scheduled OneRoster delivery foundation.

ALTER TABLE public.oneroster_connections
  ADD COLUMN transport TEXT NOT NULL DEFAULT 'manual'
    CHECK (transport IN ('manual', 'signed_push')),
  ADD COLUMN schedule_interval_minutes INTEGER
    CHECK (schedule_interval_minutes BETWEEN 15 AND 10080),
  ADD COLUMN signature_algorithm TEXT
    CHECK (signature_algorithm IS NULL OR signature_algorithm = 'ed25519'),
  ADD COLUMN signature_key_id TEXT,
  ADD COLUMN signature_public_key TEXT,
  ADD COLUMN last_attempt_at TIMESTAMPTZ,
  ADD COLUMN last_success_at TIMESTAMPTZ,
  ADD COLUMN next_expected_at TIMESTAMPTZ;

ALTER TABLE public.oneroster_connections
  ADD CONSTRAINT oneroster_connections_signed_push_configuration
  CHECK (
    transport <> 'signed_push'
    OR (
      provider = 'churchcore_academy'
      AND mode = 'academy_csv'
      AND signature_algorithm = 'ed25519'
      AND length(trim(signature_key_id)) BETWEEN 1 AND 120
      AND length(signature_public_key) BETWEEN 80 AND 4096
      AND schedule_interval_minutes IS NOT NULL
    )
  );

CREATE TABLE public.oneroster_transport_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id     UUID NOT NULL REFERENCES public.oneroster_connections(id) ON DELETE CASCADE,
  delivery_id       UUID NOT NULL,
  job_id            UUID REFERENCES public.oneroster_import_jobs(id) ON DELETE SET NULL,
  package_hash      TEXT NOT NULL CHECK (package_hash ~ '^[0-9a-f]{64}$'),
  status            TEXT NOT NULL CHECK (status IN ('validated', 'invalid', 'duplicate', 'failed')),
  error_code        TEXT,
  total_rows        INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows        INTEGER NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  quarantined_rows  INTEGER NOT NULL DEFAULT 0 CHECK (quarantined_rows >= 0),
  delivered_at      TIMESTAMPTZ NOT NULL,
  completed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, delivery_id)
);

CREATE INDEX idx_oneroster_transport_attempts_org_created
  ON public.oneroster_transport_attempts(org_id, created_at DESC);

CREATE INDEX idx_oneroster_transport_attempts_connection_created
  ON public.oneroster_transport_attempts(connection_id, created_at DESC);

CREATE UNIQUE INDEX idx_oneroster_scheduled_job_package
  ON public.oneroster_import_jobs(connection_id, package_hash)
  WHERE connection_id IS NOT NULL;

ALTER TABLE public.oneroster_transport_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oneroster_transport_attempts: admins read own org"
  ON public.oneroster_transport_attempts FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_tenant_active()
      AND public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager')
    )
  );

CREATE POLICY "oneroster_transport_attempts: service role insert"
  ON public.oneroster_transport_attempts FOR INSERT TO service_role
  WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.oneroster_transport_attempts FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE
  ON public.oneroster_transport_attempts FROM service_role;
GRANT SELECT ON public.oneroster_transport_attempts TO authenticated;
GRANT SELECT, INSERT ON public.oneroster_transport_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.set_oneroster_connection_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_oneroster_connection_updated_at()
  FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_oneroster_connection_updated_at
  ON public.oneroster_connections;
CREATE TRIGGER trg_oneroster_connection_updated_at
BEFORE UPDATE ON public.oneroster_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_oneroster_connection_updated_at();
