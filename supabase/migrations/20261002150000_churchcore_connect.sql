-- COUNCIL-2026-038: ChurchCore Connect — ChMS Integration
-- Per-tenant signed bidirectional sync with ChurchCore

-- 1. churchcore_connections
CREATE TABLE IF NOT EXISTS public.churchcore_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  church_ref TEXT NOT NULL,
  connect_url TEXT NOT NULL,
  their_public_key TEXT NOT NULL,
  their_key_id TEXT NOT NULL,
  our_key_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'connected', 'revoked', 'error')) DEFAULT 'pending',
  auto_apply BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index and unique active connection per org
CREATE INDEX IF NOT EXISTS idx_churchcore_connections_org ON public.churchcore_connections(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_churchcore_connections_org_active ON public.churchcore_connections(org_id) WHERE status != 'revoked';

-- 2. churchcore_deliveries (Inbound staging)
CREATE TABLE IF NOT EXISTS public.churchcore_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.churchcore_connections(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL DEFAULT 'churchcore-connect/v1',
  payload_type TEXT NOT NULL CHECK (payload_type IN ('snapshot', 'delta')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staged', 'previewed', 'applied', 'rejected', 'error')) DEFAULT 'staged',
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES public.profiles(uid) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_churchcore_deliveries_org ON public.churchcore_deliveries(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_churchcore_deliveries_conn ON public.churchcore_deliveries(connection_id);

-- 3. churchcore_outbound_events (Outbound queue)
CREATE TABLE IF NOT EXISTS public.churchcore_outbound_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.churchcore_connections(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('enrollment_created', 'progress_milestone', 'course_completed', 'certificate_issued', 'path_completed', 'attendance_recorded')),
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'dead_letter')) DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_churchcore_outbound_status ON public.churchcore_outbound_events(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_churchcore_outbound_org ON public.churchcore_outbound_events(org_id);

-- 4. Alter external_entity_links if needed to support churchcore_connection_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'external_entity_links' AND column_name = 'churchcore_connection_id'
  ) THEN
    ALTER TABLE public.external_entity_links 
    ADD COLUMN churchcore_connection_id UUID REFERENCES public.churchcore_connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. RLS Policies
ALTER TABLE public.churchcore_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churchcore_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churchcore_outbound_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Manager full access to churchcore_connections"
  ON public.churchcore_connections
  FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  );

CREATE POLICY "Admin/Manager full access to churchcore_deliveries"
  ON public.churchcore_deliveries
  FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  );

CREATE POLICY "Admin/Manager full access to churchcore_outbound_events"
  ON public.churchcore_outbound_events
  FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  );
