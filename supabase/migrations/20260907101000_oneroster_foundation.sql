-- OneRoster foundation (COUNCIL-2026-017).
-- Adds tenant-scoped connection metadata, provenance mappings, import jobs,
-- and redacted import rows. No credentials or raw roster rows are stored here.

CREATE TABLE IF NOT EXISTS public.oneroster_connections (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL DEFAULT 'OneRoster',
  mode             TEXT        NOT NULL DEFAULT 'standalone'
                    CHECK (mode IN ('standalone','csv_import','academy_csv','academy_rest')),
  provider         TEXT        NOT NULL DEFAULT 'manual'
                    CHECK (provider IN ('manual','churchcore_academy','external_sis')),
  enabled          BOOLEAN     NOT NULL DEFAULT FALSE,
  source_system    TEXT        NOT NULL DEFAULT 'manual',
  source_tenant_id TEXT,
  status           TEXT        NOT NULL DEFAULT 'inactive'
                    CHECK (status IN ('inactive','active','paused','error','revoked')),
  sync_direction   TEXT        NOT NULL DEFAULT 'inbound'
                    CHECK (sync_direction IN ('inbound','outbound','bidirectional')),
  settings         JSONB       NOT NULL DEFAULT '{}'::JSONB,
  last_sync_at     TIMESTAMPTZ,
  created_by       UUID        REFERENCES public.profiles(uid) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, source_system, source_tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_oneroster_connections_org
  ON public.oneroster_connections(org_id);

CREATE INDEX IF NOT EXISTS idx_oneroster_connections_status
  ON public.oneroster_connections(status);

ALTER TABLE public.oneroster_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oneroster_connections: admins read own org"
  ON public.oneroster_connections FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "oneroster_connections: admins manage own org"
  ON public.oneroster_connections FOR ALL TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager')
  );

CREATE POLICY "oneroster_connections: service role manage"
  ON public.oneroster_connections FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.external_entity_links (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id              UUID        REFERENCES public.oneroster_connections(id) ON DELETE SET NULL,
  source_system              TEXT        NOT NULL,
  source_tenant_id           TEXT,
  object_type                TEXT        NOT NULL
                               CHECK (object_type IN (
                                 'org','user','role','academic_session',
                                 'course','class','enrollment','guardian','result'
                               )),
  sourced_id                 TEXT        NOT NULL,
  sourced_id_hash            TEXT        NOT NULL,
  local_table                TEXT        NOT NULL,
  local_id                   UUID        NOT NULL,
  source_status              TEXT        NOT NULL DEFAULT 'active'
                               CHECK (source_status IN ('active','tobedeleted','inactive')),
  date_last_modified         TIMESTAMPTZ,
  last_seen_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_hash                  TEXT,
  managed_by_external_system BOOLEAN     NOT NULL DEFAULT TRUE,
  metadata                   JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, source_system, object_type, sourced_id),
  UNIQUE (org_id, local_table, local_id, source_system)
);

CREATE INDEX IF NOT EXISTS idx_external_entity_links_org
  ON public.external_entity_links(org_id);

CREATE INDEX IF NOT EXISTS idx_external_entity_links_local
  ON public.external_entity_links(local_table, local_id);

CREATE INDEX IF NOT EXISTS idx_external_entity_links_source_hash
  ON public.external_entity_links(sourced_id_hash);

ALTER TABLE public.external_entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_entity_links: staff read own org"
  ON public.external_entity_links FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

CREATE POLICY "external_entity_links: service role manage"
  ON public.external_entity_links FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.oneroster_import_jobs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id     UUID        REFERENCES public.oneroster_connections(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'uploaded'
                      CHECK (status IN (
                        'uploaded','validating','validated','ready',
                        'applying','applied','failed','cancelled'
                      )),
  dry_run           BOOLEAN     NOT NULL DEFAULT TRUE,
  package_hash      TEXT        NOT NULL,
  package_filename  TEXT,
  uploaded_by       UUID        REFERENCES public.profiles(uid) ON DELETE SET NULL,
  source_system     TEXT        NOT NULL DEFAULT 'manual',
  source_tenant_id  TEXT,
  total_rows        INTEGER     NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  created_count     INTEGER     NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count     INTEGER     NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  unchanged_count   INTEGER     NOT NULL DEFAULT 0 CHECK (unchanged_count >= 0),
  deactivated_count INTEGER     NOT NULL DEFAULT 0 CHECK (deactivated_count >= 0),
  quarantined_count INTEGER     NOT NULL DEFAULT 0 CHECK (quarantined_count >= 0),
  error_count       INTEGER     NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  error_summary     JSONB       NOT NULL DEFAULT '{}'::JSONB,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oneroster_import_jobs_org_created
  ON public.oneroster_import_jobs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oneroster_import_jobs_connection
  ON public.oneroster_import_jobs(connection_id);

CREATE INDEX IF NOT EXISTS idx_oneroster_import_jobs_status
  ON public.oneroster_import_jobs(status);

ALTER TABLE public.oneroster_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oneroster_import_jobs: admins read own org"
  ON public.oneroster_import_jobs FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "oneroster_import_jobs: service role manage"
  ON public.oneroster_import_jobs FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE TABLE IF NOT EXISTS public.oneroster_import_rows (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id             UUID        NOT NULL REFERENCES public.oneroster_import_jobs(id) ON DELETE CASCADE,
  file_type          TEXT        NOT NULL,
  row_number         INTEGER     NOT NULL CHECK (row_number > 0),
  sourced_id         TEXT,
  sourced_id_hash    TEXT,
  object_type        TEXT,
  operation          TEXT        NOT NULL DEFAULT 'none'
                       CHECK (operation IN (
                         'none','create','update','unchanged','deactivate','quarantine'
                       )),
  status             TEXT        NOT NULL DEFAULT 'staged'
                       CHECK (status IN (
                         'staged','valid','invalid','quarantined','applied','skipped'
                       )),
  normalized_payload JSONB       NOT NULL DEFAULT '{}'::JSONB,
  error_code         TEXT,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, file_type, row_number)
);

CREATE INDEX IF NOT EXISTS idx_oneroster_import_rows_job
  ON public.oneroster_import_rows(job_id);

CREATE INDEX IF NOT EXISTS idx_oneroster_import_rows_org_status
  ON public.oneroster_import_rows(org_id, status);

CREATE INDEX IF NOT EXISTS idx_oneroster_import_rows_sourced_hash
  ON public.oneroster_import_rows(sourced_id_hash);

ALTER TABLE public.oneroster_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oneroster_import_rows: admins read own org"
  ON public.oneroster_import_rows FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "oneroster_import_rows: service role manage"
  ON public.oneroster_import_rows FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);
