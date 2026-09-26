-- ─── Create storage buckets the app uses but no migration ever created ───────
-- Found by the COUNCIL-2026-031 API suite: image upload returned 500 on a
-- stack built from migrations. Production had only `assignment-files`, so
-- these two were missing there as well:
--
--   content-images — course editor image uploads (POST /api/upload/image).
--     Its object policies already exist (20260620200700_storage_rls.sql);
--     only the bucket row was never created. Private: rendered through
--     createSignedUrl() (src/lib/storage.ts), never getPublicUrl().
--     Limits mirror the route: 5 MB, jpeg/png/webp/gif.
--
--   reports — generated report files and certificate PDFs
--     (generate-certificate edge function, report artifacts). Read and
--     written only via the service role (signed URLs), so no object
--     policies for authenticated users are needed or added.
--
-- ON CONFLICT DO NOTHING keeps this safe if a bucket was created by hand.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('content-images', 'content-images', FALSE, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('reports', 'reports', FALSE, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
