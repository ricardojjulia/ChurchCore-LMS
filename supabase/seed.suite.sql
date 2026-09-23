-- ChurchCore LMS — full-suite fixtures (COUNCIL-2026-031 Prompt A)
--
-- Applied AFTER supabase/seed.test.sql, in CI and locally:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.test.sql
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.suite.sql
--
-- Adds the two extra roles the suite needs (manager, dedicated platform admin)
-- and one deterministic record for every dynamic route the page sweep visits.
-- Auth users must already exist (scripts/ci-setup-test-env.mjs creates them).
--
-- UUID namespace 0090 is reserved for this file; 0002 (profiles), 0010 (orgs),
-- 0011 (courses), 0020-0022 (academic), 0070 (gradebook e2e) belong to others.
-- Keep IDs in sync with tests/playwright/fixtures/data.ts.
--
-- Idempotent: seed.test.sql deletes and recreates both test orgs (ON DELETE
-- CASCADE clears everything below), and every insert here is ON CONFLICT-safe.

BEGIN;

-- ─── Extra roles ─────────────────────────────────────────────────────────────

INSERT INTO public.profiles (uid, auth_id, display_name, email, role, status, org_id)
VALUES
  ('00000000-0000-0000-0002-000000000007',
   (SELECT id FROM auth.users WHERE email = 'manager@test.churchcore.dev'),
   'Test Manager A', 'manager@test.churchcore.dev', 'manager', 'active',
   '00000000-0000-0000-0010-000000000001'),
  -- Platform admin is a plain student in Org A: every elevated capability it
  -- shows must come from platform_admins, never from its org role.
  ('00000000-0000-0000-0002-000000000008',
   (SELECT id FROM auth.users WHERE email = 'platform@test.churchcore.dev'),
   'Test Platform Admin', 'platform@test.churchcore.dev', 'student', 'active',
   '00000000-0000-0000-0010-000000000001')
ON CONFLICT (auth_id) DO UPDATE
  SET uid = EXCLUDED.uid, display_name = EXCLUDED.display_name, email = EXCLUDED.email,
      role = EXCLUDED.role, status = EXCLUDED.status, org_id = EXCLUDED.org_id;

INSERT INTO public.profile_roles (auth_id, uid, role, status, current_level, org_id, tenant_active)
VALUES
  ((SELECT id FROM auth.users WHERE email = 'manager@test.churchcore.dev'),
   '00000000-0000-0000-0002-000000000007', 'manager', 'active', 1,
   '00000000-0000-0000-0010-000000000001', true),
  ((SELECT id FROM auth.users WHERE email = 'platform@test.churchcore.dev'),
   '00000000-0000-0000-0002-000000000008', 'student', 'active', 1,
   '00000000-0000-0000-0010-000000000001', true)
ON CONFLICT (auth_id) DO UPDATE
  SET uid = EXCLUDED.uid, role = EXCLUDED.role, status = EXCLUDED.status,
      current_level = EXCLUDED.current_level, org_id = EXCLUDED.org_id,
      tenant_active = EXCLUDED.tenant_active;

INSERT INTO public.platform_admins (auth_id, display_name)
SELECT id, 'Test Platform Admin' FROM auth.users WHERE email = 'platform@test.churchcore.dev'
ON CONFLICT DO NOTHING;

-- ─── Guardian ↔ student ──────────────────────────────────────────────────────

INSERT INTO public.guardian_links (id, guardian_uid, student_uid, created_by, org_id)
VALUES ('00000000-0000-0000-0090-000000000001',
        '00000000-0000-0000-0002-000000000006', '00000000-0000-0000-0002-000000000003',
        '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

-- ─── Course A: public preview + one block of every active type ───────────────

UPDATE public.courses SET is_public_preview = true, description = 'Suite fixture course'
WHERE id = '00000000-0000-0000-0011-000000000001';

INSERT INTO public.course_blocks (id, course_id, parent_block_id, block_type_id, title, sort_order, content, settings, gamification, is_published, org_id)
VALUES
  ('00000000-0000-0000-0090-000000000101', '00000000-0000-0000-0011-000000000001', NULL,
   'module_header', 'Suite Module 1', 1, '{}', '{}', '{}', true, '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000102', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0090-000000000101',
   'page', 'Suite Lesson Page', 2, '{"body": "<p>Welcome to the suite lesson.</p>"}', '{}', '{"base_xp_reward": 10}', true,
   '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000103', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0090-000000000101',
   'assignment', 'Suite Assignment', 3,
   '{"instructions": "Write one sentence about the lesson.", "max_points": 100, "submission_type": "text"}', '{}', '{"base_xp_reward": 20}', true,
   '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000104', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0090-000000000101',
   'quiz', 'Suite Quiz', 4,
   '{"description": "Two quick questions.", "attempts_allowed": 0, "time_limit_minutes": null,
     "questions": [
       {"id": "q1", "text": "Suite question one: pick Alpha", "type": "multiple_choice", "options": ["Alpha", "Beta"], "correct_index": 0, "points": 1},
       {"id": "q2", "text": "Suite question two: the sky is up", "type": "true_false", "options": ["True", "False"], "correct_index": 0, "points": 1}
     ]}', '{}', '{"base_xp_reward": 15}', true,
   '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000105', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0090-000000000101',
   'discussion', 'Suite Discussion', 5, '{"prompt": "Share one takeaway.", "max_score": 10}', '{}', '{}', true,
   '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000106', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0090-000000000101',
   'attendance', 'Suite Attendance', 6, '{"session_title": "Week 1", "tracking_mode": "both", "points_possible": 5}', '{}', '{}', true,
   '00000000-0000-0000-0010-000000000001'),
  -- Unpublished block: must never appear to students or on the public preview.
  ('00000000-0000-0000-0090-000000000107', '00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0090-000000000101',
   'page', 'Suite Draft Block (hidden)', 7, '{"body": "<p>draft</p>"}', '{}', '{}', false,
   '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.content_pages (id, course_id, title, body, status, created_by, sort_order, org_id)
VALUES ('00000000-0000-0000-0090-000000000201', '00000000-0000-0000-0011-000000000001',
        'Suite Content Page',
        '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Suite content page body."}]}]}',
        'published',
        '00000000-0000-0000-0002-000000000002', 1, '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

-- ─── Academic structure extras ───────────────────────────────────────────────

INSERT INTO public.program_tracks (id, name, code, description, is_active, created_by, org_id)
VALUES ('00000000-0000-0000-0090-000000000401', 'Suite Program Track', 'SUITE-TRACK', 'Suite fixture', true,
        (SELECT id FROM auth.users WHERE email = 'admin@test.churchcore.dev'), '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.program_track_courses (track_id, course_id, sequence_order, is_required)
VALUES ('00000000-0000-0000-0090-000000000401', '00000000-0000-0000-0011-000000000001', 1, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.global_cohorts (id, cohort_name, cohort_code, program_track_id, description, is_active, created_by, org_id)
VALUES ('00000000-0000-0000-0090-000000000301', 'Suite Cohort', 'SUITE-COHORT', '00000000-0000-0000-0090-000000000401',
        'Suite fixture', true, (SELECT id FROM auth.users WHERE email = 'admin@test.churchcore.dev'),
        '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.cohort_members (id, cohort_id, user_id, status, org_id)
VALUES ('00000000-0000-0000-0090-000000000302', '00000000-0000-0000-0090-000000000301',
        (SELECT id FROM auth.users WHERE email = 'student@test.churchcore.dev'), 'active',
        '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.question_banks (id, org_id, name, description, created_by)
VALUES ('00000000-0000-0000-0090-000000000501', '00000000-0000-0000-0010-000000000001',
        'Suite Question Bank', 'Suite fixture', '00000000-0000-0000-0002-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.bank_questions (id, bank_id, question_type, question_content)
VALUES ('00000000-0000-0000-0090-000000000502', '00000000-0000-0000-0090-000000000501', 'multiple_choice',
        '{"id": "bq1", "text": "Bank question: pick Yes", "type": "multiple_choice", "options": ["Yes", "No"], "correct_index": 0, "points": 1}')
ON CONFLICT DO NOTHING;

-- ─── Learning path ───────────────────────────────────────────────────────────

INSERT INTO public.learning_paths (id, org_id, title, description, is_published)
VALUES ('00000000-0000-0000-0090-000000000601', '00000000-0000-0000-0010-000000000001',
        'Suite Learning Path', 'Suite fixture path', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.learning_path_courses (id, path_id, course_id, sort_order)
VALUES
  ('00000000-0000-0000-0090-000000000602', '00000000-0000-0000-0090-000000000601', '00000000-0000-0000-0011-000000000001', 1),
  ('00000000-0000-0000-0090-000000000603', '00000000-0000-0000-0090-000000000601', '00000000-0000-0000-0011-000000000005', 2)
ON CONFLICT DO NOTHING;

-- ─── Groups ──────────────────────────────────────────────────────────────────

INSERT INTO public.section_groups (id, section_id, group_name, group_code, max_members, purpose, created_by, org_id)
VALUES ('00000000-0000-0000-0090-000000000701', '00000000-0000-0000-0022-000000000001',
        'Suite Study Group', 'SUITE-G1', 10, 'discussion',
        (SELECT id FROM auth.users WHERE email = 'teacher@test.churchcore.dev'), '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.section_group_members (id, group_id, user_id, role, org_id)
VALUES
  ('00000000-0000-0000-0090-000000000702', '00000000-0000-0000-0090-000000000701',
   (SELECT id FROM auth.users WHERE email = 'student@test.churchcore.dev'), 'member', '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000703', '00000000-0000-0000-0090-000000000701',
   (SELECT id FROM auth.users WHERE email = 'teacher@test.churchcore.dev'), 'leader', '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.group_threads (id, group_id, title, created_by, org_id)
VALUES ('00000000-0000-0000-0090-000000000704', '00000000-0000-0000-0090-000000000701', 'Suite Group Thread',
        (SELECT id FROM auth.users WHERE email = 'teacher@test.churchcore.dev'), '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

-- ─── Messaging ───────────────────────────────────────────────────────────────

INSERT INTO public.message_threads (id, thread_type, subject, created_by, last_message_at, last_message_preview, last_sender_uid, org_id)
VALUES ('00000000-0000-0000-0090-000000000801', 'direct', 'Suite Thread',
        '00000000-0000-0000-0002-000000000002', now(), 'Hello from the suite',
        '00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.message_thread_participants (id, thread_id, user_id, role, can_reply, org_id)
VALUES
  ('00000000-0000-0000-0090-000000000802', '00000000-0000-0000-0090-000000000801',
   '00000000-0000-0000-0002-000000000002', 'owner', true, '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000803', '00000000-0000-0000-0090-000000000801',
   '00000000-0000-0000-0002-000000000003', 'member', true, '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.messages (id, thread_id, sender_id, body, org_id)
VALUES ('00000000-0000-0000-0090-000000000804', '00000000-0000-0000-0090-000000000801',
        '00000000-0000-0000-0002-000000000002', 'Hello from the suite', '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

-- ─── Learner progress (enrollments bridge table; user_id = profiles.uid) ─────
-- Student A: in progress on Course A, completed Course "Advanced" (has a cert).

INSERT INTO public.enrollments (id, user_id, course_id, transit_status, progress_percent, completed_at, org_id)
VALUES
  ('00000000-0000-0000-0090-000000000e01', '00000000-0000-0000-0002-000000000003',
   '00000000-0000-0000-0011-000000000001', 'in_progress', 20, NULL, '00000000-0000-0000-0010-000000000001'),
  ('00000000-0000-0000-0090-000000000e02', '00000000-0000-0000-0002-000000000003',
   '00000000-0000-0000-0011-000000000005', 'completed', 100, now() - interval '1 day', '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

-- ─── Certificates, announcements, calendar, notifications, badges ────────────

INSERT INTO public.course_certificates (id, user_id, course_id, final_grade, letter_grade, total_xp_earned, certificate_no, pdf_generation_status, org_id)
VALUES ('00000000-0000-0000-0090-000000000901', '00000000-0000-0000-0002-000000000003',
        '00000000-0000-0000-0011-000000000005', 95, 'A', 120, 'SUITE-CERT-0001', 'pending',
        '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.announcements (id, created_by, scope, title, body, priority, is_published, published_at, org_id)
VALUES ('00000000-0000-0000-0090-000000000a01', '00000000-0000-0000-0002-000000000001', 'global',
        'Suite Announcement', 'Suite announcement body.', 'normal', true, now(),
        '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.calendar_events (id, created_by, event_type, title, description, starts_at, ends_at, scope, org_id)
VALUES ('00000000-0000-0000-0090-000000000b01', '00000000-0000-0000-0002-000000000001', 'institutional',
        'Suite Event', 'Suite calendar event', now() + interval '2 days', now() + interval '2 days 1 hour', 'institutional',
        '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.notifications (id, user_id, type, title, body, org_id)
VALUES ('00000000-0000-0000-0090-000000000c01', '00000000-0000-0000-0002-000000000003', 'system',
        'Suite Notification', 'Suite notification body.', '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.badges (id, badge_key, title, description, org_id)
VALUES ('00000000-0000-0000-0090-000000000d01', 'suite_badge', 'Suite Badge', 'Suite fixture badge',
        '00000000-0000-0000-0010-000000000001')
ON CONFLICT DO NOTHING;

COMMIT;
