-- Migration: Hosted Video (Upload and Adaptive Streaming) (COUNCIL-2026-041)

CREATE TABLE IF NOT EXISTS video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  block_id uuid REFERENCES course_blocks(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'mux', -- 'mux' | 'cloudflare'
  provider_asset_id text,
  provider_playback_id text,
  provider_upload_id text,
  title text,
  status text NOT NULL DEFAULT 'preparing', -- 'preparing' | 'ready' | 'errored' | 'deleted'
  duration_seconds numeric(10, 2),
  aspect_ratio text,
  captions jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_playback_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  video_asset_id uuid NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  block_id uuid REFERENCES course_blocks(id) ON DELETE CASCADE,
  user_uid uuid NOT NULL REFERENCES profiles(uid) ON DELETE CASCADE,
  seconds_watched numeric(10, 2) NOT NULL DEFAULT 0,
  max_playback_position numeric(10, 2) NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_asset_id, user_uid)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_assets_org_id ON video_assets(org_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_block_id ON video_assets(block_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_upload_id ON video_assets(provider_upload_id);
CREATE INDEX IF NOT EXISTS idx_video_assets_playback_id ON video_assets(provider_playback_id);
CREATE INDEX IF NOT EXISTS idx_video_heartbeats_user ON video_playback_heartbeats(user_uid, video_asset_id);

-- Enable RLS
ALTER TABLE video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_playback_heartbeats ENABLE ROW LEVEL SECURITY;

-- Policies for video_assets
CREATE POLICY "Users can view ready video assets in their org"
  ON video_assets FOR SELECT
  USING (
    org_id = public.current_user_org_id()
  );

CREATE POLICY "Instructors and admins can manage video assets in their org"
  ON video_assets FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.current_user_role() = 'teacher'
      OR public.is_platform_admin()
    )
  );

-- Policies for heartbeats
CREATE POLICY "Users can view and record their own heartbeats"
  ON video_playback_heartbeats FOR ALL
  USING (
    user_uid = public.current_user_uid()
  );

CREATE POLICY "Teachers and admins can view heartbeats in their org"
  ON video_playback_heartbeats FOR SELECT
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.current_user_role() = 'teacher'
      OR public.is_platform_admin()
    )
  );
