-- Keep temporary OneRoster staging data short-lived and avoid retaining roster PII.
ALTER TABLE public.oneroster_import_jobs
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');

CREATE INDEX IF NOT EXISTS idx_oneroster_import_jobs_expires
  ON public.oneroster_import_jobs(expires_at);
