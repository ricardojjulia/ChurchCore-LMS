-- ============================================================
-- ChurchCore LMS — Test Seed Data (dual-org, RLS penetration)
-- ============================================================
-- Organization, profile, and course IDs are deterministic.
-- auth.users IDs are GoTrue-assigned — never hardcoded here.
-- All auth_id references resolve at seed time via email subquery.
--
-- PREREQUISITE: GoTrue users must exist before running this file.
-- Create them once via the Admin API (passwords and email_confirm
-- included — no SQL password hacks needed):
--
--   source .env.test.local
--   for row in \
--     "admin@test.churchcore.dev|admin|ORG_A|Test Admin A" \
--     "teacher@test.churchcore.dev|teacher|ORG_A|Test Teacher A" \
--     "student@test.churchcore.dev|student|ORG_A|Test Student A" \
--     "admin-b@test.churchcore.dev|admin|ORG_B|Test Admin B" \
--     "student-b@test.churchcore.dev|student|ORG_B|Test Student B"; do
--     IFS='|' read -r email role org_id name <<< "$row"
--     curl -s -X POST "$TEST_SUPABASE_URL/auth/v1/admin/users" \
--       -H "apikey: $TEST_SUPABASE_SERVICE_ROLE_KEY" \
--       -H "Authorization: Bearer $TEST_SUPABASE_SERVICE_ROLE_KEY" \
--       -H "Content-Type: application/json" \
--       -d "{\"email\":\"$email\",\"password\":\"$TEST_USER_PASSWORD\",\"email_confirm\":true}"
--   done
--
-- After users exist, this file is safe to run repeatedly (idempotent).
--
-- ─── UUID legend ────────────────────────────────────────────────────────────────
--
-- Organizations (deterministic)
--   ORG_A  = 00000000-0000-0000-0010-000000000001  (Test Church Alpha)
--   ORG_B  = 00000000-0000-0000-0010-000000000002  (Test Church Beta)
--
-- profiles.uid (deterministic domain identity)
--   admin-a    = 00000000-0000-0000-0002-000000000001
--   teacher-a  = 00000000-0000-0000-0002-000000000002
--   student-a  = 00000000-0000-0000-0002-000000000003
--   admin-b    = 00000000-0000-0000-0002-000000000004
--   student-b  = 00000000-0000-0000-0002-000000000005
--
-- auth.users IDs: GoTrue-assigned. Resolved at seed time via:
--   (SELECT id FROM auth.users WHERE email = '...')
--
-- Courses (deterministic)
--   COURSE_A = 00000000-0000-0000-0011-000000000001  (Org A)
--   COURSE_B = 00000000-0000-0000-0011-000000000002  (Org B)
-- ────────────────────────────────────────────────────────────────────────────────

-- ─── Wipe existing test data ─────────────────────────────────────────────────
-- Delete in FK dependency order.
-- Never touch auth.users — GoTrue users are managed outside this file.

DELETE FROM public.direct_enrollments
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.course_enrollments
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.notifications
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.announcements
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.courses
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.course_sections
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.course_blueprints
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.academic_terms
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
DELETE FROM public.profile_roles
  WHERE org_id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');
-- Also catch trigger-created profiles that may not yet have org_id set
DELETE FROM public.profile_roles
  WHERE auth_id IN (
    SELECT id FROM auth.users
    WHERE email IN (
      'admin@test.churchcore.dev','teacher@test.churchcore.dev','student@test.churchcore.dev',
      'admin-b@test.churchcore.dev','student-b@test.churchcore.dev'
    )
  );
DELETE FROM public.profiles
  WHERE email IN (
    'admin@test.churchcore.dev','teacher@test.churchcore.dev','student@test.churchcore.dev',
    'admin-b@test.churchcore.dev','student-b@test.churchcore.dev'
  );
DELETE FROM public.organizations
  WHERE id IN ('00000000-0000-0000-0010-000000000001','00000000-0000-0000-0010-000000000002');

-- ─── Organizations ───────────────────────────────────────────────────────────

INSERT INTO public.organizations (id, name, slug, status, plan, settings)
VALUES
  (
    '00000000-0000-0000-0010-000000000001',
    'Test Church Alpha',
    'alpha',
    'active',
    'free',
    '{
      "branding": {},
      "features": {
        "ai_tutor": true,
        "guardian_portal": true,
        "leaderboard": true,
        "hq": true,
        "reporting": true
      },
      "onboarding": {
        "logo_uploaded": false,
        "first_teacher_invited": false,
        "first_course_created": false,
        "first_announcement_published": false
      }
    }'::jsonb
  ),
  (
    '00000000-0000-0000-0010-000000000002',
    'Test Church Beta',
    'beta',
    'active',
    'free',
    '{
      "branding": {},
      "features": {
        "ai_tutor": true,
        "guardian_portal": true,
        "leaderboard": true,
        "hq": true,
        "reporting": true
      },
      "onboarding": {
        "logo_uploaded": false,
        "first_teacher_invited": false,
        "first_course_created": false,
        "first_announcement_published": false
      }
    }'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Profiles ────────────────────────────────────────────────────────────────
-- auth_id resolved at seed time via email — works regardless of GoTrue UUID.
-- handle_new_user trigger may have already created a profile row on user creation;
-- ON CONFLICT (auth_id) DO UPDATE ensures uid and org_id are set correctly.

INSERT INTO public.profiles (uid, auth_id, display_name, email, role, status, org_id)
VALUES
  -- ── Org A ──────────────────────────────────────────────────────────────────
  (
    '00000000-0000-0000-0002-000000000001',
    (SELECT id FROM auth.users WHERE email = 'admin@test.churchcore.dev'),
    'Test Admin A', 'admin@test.churchcore.dev', 'admin', 'active',
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0002-000000000002',
    (SELECT id FROM auth.users WHERE email = 'teacher@test.churchcore.dev'),
    'Test Teacher A', 'teacher@test.churchcore.dev', 'teacher', 'active',
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0002-000000000003',
    (SELECT id FROM auth.users WHERE email = 'student@test.churchcore.dev'),
    'Test Student A', 'student@test.churchcore.dev', 'student', 'active',
    '00000000-0000-0000-0010-000000000001'
  ),
  -- ── Org B ──────────────────────────────────────────────────────────────────
  (
    '00000000-0000-0000-0002-000000000004',
    (SELECT id FROM auth.users WHERE email = 'admin-b@test.churchcore.dev'),
    'Test Admin B', 'admin-b@test.churchcore.dev', 'admin', 'active',
    '00000000-0000-0000-0010-000000000002'
  ),
  (
    '00000000-0000-0000-0002-000000000005',
    (SELECT id FROM auth.users WHERE email = 'student-b@test.churchcore.dev'),
    'Test Student B', 'student-b@test.churchcore.dev', 'student', 'active',
    '00000000-0000-0000-0010-000000000002'
  )
ON CONFLICT (auth_id) DO UPDATE
  SET uid          = EXCLUDED.uid,
      display_name = EXCLUDED.display_name,
      email        = EXCLUDED.email,
      role         = EXCLUDED.role,
      status       = EXCLUDED.status,
      org_id       = EXCLUDED.org_id;

-- ─── profile_roles ───────────────────────────────────────────────────────────
-- The sync_profile_roles trigger fires on profile INSERT/UPDATE.
-- We upsert explicitly here to guarantee correctness regardless of trigger state.

INSERT INTO public.profile_roles (auth_id, uid, role, status, current_level, org_id, tenant_active)
VALUES
  -- ── Org A ──────────────────────────────────────────────────────────────────
  (
    (SELECT id FROM auth.users WHERE email = 'admin@test.churchcore.dev'),
    '00000000-0000-0000-0002-000000000001',
    'admin', 'active', 1,
    '00000000-0000-0000-0010-000000000001',
    true
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'teacher@test.churchcore.dev'),
    '00000000-0000-0000-0002-000000000002',
    'teacher', 'active', 1,
    '00000000-0000-0000-0010-000000000001',
    true
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'student@test.churchcore.dev'),
    '00000000-0000-0000-0002-000000000003',
    'student', 'active', 1,
    '00000000-0000-0000-0010-000000000001',
    true
  ),
  -- ── Org B ──────────────────────────────────────────────────────────────────
  (
    (SELECT id FROM auth.users WHERE email = 'admin-b@test.churchcore.dev'),
    '00000000-0000-0000-0002-000000000004',
    'admin', 'active', 1,
    '00000000-0000-0000-0010-000000000002',
    true
  ),
  (
    (SELECT id FROM auth.users WHERE email = 'student-b@test.churchcore.dev'),
    '00000000-0000-0000-0002-000000000005',
    'student', 'active', 1,
    '00000000-0000-0000-0010-000000000002',
    true
  )
ON CONFLICT (auth_id) DO UPDATE
  SET uid           = EXCLUDED.uid,
      role          = EXCLUDED.role,
      status        = EXCLUDED.status,
      current_level = EXCLUDED.current_level,
      org_id        = EXCLUDED.org_id,
      tenant_active = EXCLUDED.tenant_active;

-- ─── Courses ─────────────────────────────────────────────────────────────────
-- owner_id references profiles.uid (0002-series).

INSERT INTO public.courses (id, org_id, title, status, owner_id)
VALUES
  (
    '00000000-0000-0000-0011-000000000001',
    '00000000-0000-0000-0010-000000000001',
    'Alpha Course',
    'published',
    '00000000-0000-0000-0002-000000000002'   -- teacher-a uid
  ),
  (
    '00000000-0000-0000-0011-000000000002',
    '00000000-0000-0000-0010-000000000002',
    'Beta Course',
    'published',
    '00000000-0000-0000-0002-000000000004'   -- admin-b uid
  )
ON CONFLICT (id) DO NOTHING;

-- ─── course_enrollments ──────────────────────────────────────────────────────
-- user_id references profiles.uid (0002-series, NOT auth.users.id).
-- Unique constraint: (course_id, user_id, role).

INSERT INTO public.course_enrollments (user_id, course_id, role, status, source, org_id)
VALUES
  (
    '00000000-0000-0000-0002-000000000003',   -- student-a uid
    '00000000-0000-0000-0011-000000000001',   -- COURSE_A
    'student', 'active', 'admin',
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0002-000000000005',   -- student-b uid
    '00000000-0000-0000-0011-000000000002',   -- COURSE_B
    'student', 'active', 'admin',
    '00000000-0000-0000-0010-000000000002'
  )
ON CONFLICT (course_id, user_id, role) DO NOTHING;

-- ─── academic_terms ──────────────────────────────────────────────────────────
-- created_by references auth.users.id — resolved by email subquery.

INSERT INTO public.academic_terms (
  id, term_name, term_code, type, start_date, end_date, config, is_active, created_by, org_id
)
VALUES
  (
    '00000000-0000-0000-0020-000000000001',
    'Test Term Alpha', 'TEST-ALPHA-2026', 'semester',
    '2026-01-01', '2026-12-31', '{}', true,
    (SELECT id FROM auth.users WHERE email = 'admin@test.churchcore.dev'),
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0020-000000000002',
    'Test Term Beta', 'TEST-BETA-2026', 'semester',
    '2026-01-01', '2026-12-31', '{}', true,
    (SELECT id FROM auth.users WHERE email = 'admin-b@test.churchcore.dev'),
    '00000000-0000-0000-0010-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── course_blueprints ───────────────────────────────────────────────────────

INSERT INTO public.course_blueprints (
  id, course_code, title, is_active, created_by, org_id
)
VALUES
  (
    '00000000-0000-0000-0021-000000000001',
    'TEST-ALPHA-BP-001', 'Alpha Blueprint', true,
    (SELECT id FROM auth.users WHERE email = 'admin@test.churchcore.dev'),
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0021-000000000002',
    'TEST-BETA-BP-001', 'Beta Blueprint', true,
    (SELECT id FROM auth.users WHERE email = 'admin-b@test.churchcore.dev'),
    '00000000-0000-0000-0010-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── course_sections ─────────────────────────────────────────────────────────

INSERT INTO public.course_sections (
  id, blueprint_id, term_id, section_code, delivery_format, is_active, created_by, org_id
)
VALUES
  (
    '00000000-0000-0000-0022-000000000001',
    '00000000-0000-0000-0021-000000000001',   -- Alpha Blueprint
    '00000000-0000-0000-0020-000000000001',   -- Test Term Alpha
    'ALPHA-001', 'self_paced', true,
    (SELECT id FROM auth.users WHERE email = 'admin@test.churchcore.dev'),
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0022-000000000002',
    '00000000-0000-0000-0021-000000000002',   -- Beta Blueprint
    '00000000-0000-0000-0020-000000000002',   -- Test Term Beta
    'BETA-001', 'self_paced', true,
    (SELECT id FROM auth.users WHERE email = 'admin-b@test.churchcore.dev'),
    '00000000-0000-0000-0010-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── direct_enrollments ──────────────────────────────────────────────────────
-- user_id references auth.users.id (NOT profiles.uid) per the schema FK.

INSERT INTO public.direct_enrollments (id, user_id, section_id, status, source, org_id)
VALUES
  (
    '00000000-0000-0000-0023-000000000001',
    (SELECT id FROM auth.users WHERE email = 'student@test.churchcore.dev'),
    '00000000-0000-0000-0022-000000000001',   -- Alpha Section
    'active', 'direct',
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0023-000000000002',
    (SELECT id FROM auth.users WHERE email = 'student-b@test.churchcore.dev'),
    '00000000-0000-0000-0022-000000000002',   -- Beta Section
    'active', 'direct',
    '00000000-0000-0000-0010-000000000002'
  )
ON CONFLICT (user_id, section_id) DO NOTHING;

-- ─── Notifications ───────────────────────────────────────────────────────────

INSERT INTO public.notifications (id, user_id, type, title, body, is_read, org_id)
VALUES
  (
    '00000000-0000-0000-0004-000000000001',
    '00000000-0000-0000-0002-000000000003',   -- student-a uid
    'system', 'Welcome to Alpha Course', 'Your enrollment is confirmed.', FALSE,
    '00000000-0000-0000-0010-000000000001'
  ),
  (
    '00000000-0000-0000-0004-000000000002',
    '00000000-0000-0000-0002-000000000005',   -- student-b uid
    'system', 'Welcome to Beta Course', 'Your enrollment is confirmed.', FALSE,
    '00000000-0000-0000-0010-000000000002'
  )
ON CONFLICT (id) DO NOTHING;
