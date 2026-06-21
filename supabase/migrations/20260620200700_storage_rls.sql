-- ─── Storage bucket RLS: content-images ─────────────────────────────────────
-- Bucket changed from public to private (set in Supabase dashboard).
-- Objects are stored at {org_id}/{auth_uid}/{timestamp}.ext
-- Access is granted only to members of the same org.

-- INSERT: staff of the uploading user's org
CREATE POLICY "content_images: org members upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );

-- SELECT: any authenticated member of the same org
CREATE POLICY "content_images: org members read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- SELECT: platform admins can read all (support and moderation)
CREATE POLICY "content_images: platform admin read all"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-images'
    AND public.is_platform_admin()
  );

-- DELETE: org admins and managers
CREATE POLICY "content_images: org admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
    AND public.current_user_role() IN ('admin', 'manager')
  );

-- UPDATE: same as DELETE (for upsert / replace flows)
CREATE POLICY "content_images: org admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  )
  WITH CHECK (
    bucket_id = 'content-images'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
    AND public.current_user_role() IN ('admin', 'manager', 'teacher')
  );
