-- ============================================
-- ChurchCore LMS — Test Seed Data
-- All IDs are deterministic. Never use gen_random_uuid() here.
-- This file runs before every e2e suite in CI.
-- ============================================

-- Clear existing test data (test project only — never run on production)
TRUNCATE auth.users CASCADE;

-- ── Test users (deterministic UUIDs) ──────────────────────────────────────
-- Passwords are set by scripts/ci-setup-test-env.mjs via service role API.
INSERT INTO auth.users (id, email, email_confirmed_at, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0001-000000000001',
   'admin@test.churchcore.dev', NOW(), NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000002',
   'teacher@test.churchcore.dev', NOW(), NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000003',
   'student@test.churchcore.dev', NOW(), NOW(), NOW()),
  ('00000000-0000-0000-0001-000000000004',
   'student2@test.churchcore.dev', NOW(), NOW(), NOW());

-- ── Profiles (match schema: uid PK, auth_id FK, display_name) ─────────────
INSERT INTO public.profiles (uid, auth_id, display_name, role, status)
VALUES
  ('00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0001-000000000001', 'Test Admin',    'admin',   'active'),
  ('00000000-0000-0000-0002-000000000002',
   '00000000-0000-0000-0001-000000000002', 'Test Teacher',  'teacher', 'active'),
  ('00000000-0000-0000-0002-000000000003',
   '00000000-0000-0000-0001-000000000003', 'Test Student',  'student', 'active'),
  ('00000000-0000-0000-0002-000000000004',
   '00000000-0000-0000-0001-000000000004', 'Test Student 2','student', 'active');

-- ── One published course ────────────────────────────────────────────────────
INSERT INTO public.courses (id, title, description, status, owner_id)
VALUES (
  '00000000-0000-0000-0003-000000000001',
  'Test Course Alpha',
  'A test course for e2e validation.',
  'published',
  '00000000-0000-0000-0002-000000000002'
);

-- ── Enrollment (student enrolled in Test Course Alpha) ─────────────────────
INSERT INTO public.enrollments (user_id, course_id, transit_status, progress_percent)
VALUES (
  '00000000-0000-0000-0002-000000000003',
  '00000000-0000-0000-0003-000000000001',
  'in_progress',
  25
);

-- ── Notification (unread, for student) ────────────────────────────────────
INSERT INTO public.notifications (id, user_id, type, title, body, is_read)
VALUES (
  '00000000-0000-0000-0004-000000000001',
  '00000000-0000-0000-0002-000000000003',
  'system',
  'Welcome to Test Course Alpha',
  'Your enrollment is confirmed.',
  FALSE
);
