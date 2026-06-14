-- Migration 032: Backlog features
--
-- 1. Discussion reply editing and deletion (SECURITY DEFINER RPCs)
-- 2. Assignment file uploads (Supabase Storage bucket + RLS)
-- (Prerequisites enforced server-side in actions — no schema change needed)
-- (Email notifications via Resend in server action — no schema change needed)

-- ── 1. Discussion: edit own reply ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edit_discussion_reply(
  p_submission_id UUID,
  p_text          TEXT
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := current_user_uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

  p_text := TRIM(p_text);
  IF LENGTH(p_text) < 2   THEN RAISE EXCEPTION 'Reply must be at least 2 characters'; END IF;
  IF LENGTH(p_text) > 2000 THEN RAISE EXCEPTION 'Reply exceeds 2000 character limit'; END IF;

  UPDATE public.block_submissions
  SET content = jsonb_build_object(
      'text',      p_text,
      'type',      'discussion',
      'edited_at', NOW()::TEXT
    )
  WHERE id         = p_submission_id
    AND user_id    = v_uid
    AND is_deleted = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reply not found or does not belong to you';
  END IF;

  RETURN json_build_object('success', TRUE);
END;
$$;

-- ── 2. Discussion: soft-delete own reply ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_discussion_reply(
  p_submission_id UUID
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := current_user_uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;

  UPDATE public.block_submissions
  SET is_deleted = TRUE
  WHERE id         = p_submission_id
    AND user_id    = v_uid
    AND is_deleted = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reply not found or does not belong to you';
  END IF;

  RETURN json_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_discussion_reply(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_discussion_reply(UUID)      TO authenticated;

-- ── 3. Assignment file uploads: Storage bucket + RLS ─────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'assignment-files',
  'assignment-files',
  FALSE,
  10485760,   -- 10 MB per file
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- File path convention: {auth_uid}/{block_id}/{filename}
-- Using auth.uid() (not profile uid) because the browser client only has auth session.

CREATE POLICY "assignment_files: student upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'assignment-files'
    AND (storage.foldername(name))[1] = (auth.uid())::TEXT
  );

CREATE POLICY "assignment_files: read own or staff"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'assignment-files'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::TEXT
      OR current_user_role() IN ('admin', 'manager', 'teacher')
    )
  );

CREATE POLICY "assignment_files: delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'assignment-files'
    AND (storage.foldername(name))[1] = (auth.uid())::TEXT
  );
