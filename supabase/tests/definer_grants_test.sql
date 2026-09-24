-- pgTAP: XP integrity and SECURITY DEFINER grants
-- (20260924200000_server_derived_xp_and_definer_grants.sql, COUNCIL-2026-033)
-- Run with: supabase test db

BEGIN;
SELECT plan(10);
\ir helpers/fixtures.inc

-- ─── Grants ──────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT array_agg(p.proname::text ORDER BY p.proname)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname NOT IN ('check_section_access', 'current_user_level', 'current_user_org_id',
        'current_user_role', 'current_user_tenant_active', 'current_user_thread_ids',
        'current_user_uid', 'is_group_member', 'is_platform_admin')),
  NULL,
  'anon cannot execute any SECURITY DEFINER function except the RLS helpers'
);
SELECT ok(NOT has_function_privilege('authenticated', 'public.award_xp(uuid, integer)', 'EXECUTE'),
  'signed-in users cannot call award_xp directly');
SELECT ok(NOT has_function_privilege('anon', 'public.award_xp(uuid, integer)', 'EXECUTE'),
  'anon cannot call award_xp');
SELECT ok(NOT has_function_privilege('authenticated', 'public.evaluate_badge_triggers(uuid, uuid, text)', 'EXECUTE'),
  'signed-in users cannot call evaluate_badge_triggers directly');
SELECT ok(has_function_privilege('authenticated',
  'public.record_engagement_event(text, text, uuid, integer, jsonb)', 'EXECUTE'),
  'signed-in users can still record engagement');

-- ─── Server-derived XP ───────────────────────────────────────────────────────
RESET ROLE;
INSERT INTO public.course_blocks (id, course_id, org_id, block_type_id, title, sort_order, is_published, content, gamification)
VALUES (pg_temp.fixture_id('xp-block'), pg_temp.fixture_id('course-a'), pg_temp.fixture_id('org-a'),
        'page', 'XP block', 1, true, '{}', '{"base_xp_reward": 15}');
UPDATE public.profiles SET xp_points = 0 WHERE uid = pg_temp.fixture_id('student-uid');

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');

SELECT is(
  (public.record_engagement_event('block_completion', 'block', pg_temp.fixture_id('xp-block'), 999999, '{}')->>'xp_earned')::int,
  15, 'XP comes from the block''s base_xp_reward, not the caller''s p_xp');
SELECT is(
  (public.record_engagement_event('block_completion', 'block', gen_random_uuid(), 50, '{}')->>'error'),
  'Invalid source', 'a made-up source id earns nothing');
SELECT is(
  (public.record_engagement_event('course_completion', 'course', pg_temp.fixture_id('course-a'), 100, '{}')->>'error'),
  'Invalid source', 'course completion XP requires a completed enrollment');
SELECT is(
  (public.record_engagement_event('discussion_post', 'discussion', gen_random_uuid(), 5000, '{}')->>'xp_earned')::int,
  0, 'discussion events carry no caller-chosen XP');

RESET ROLE;
SELECT is((SELECT xp_points FROM public.profiles WHERE uid = pg_temp.fixture_id('student-uid')),
  15, 'only the derived block XP was awarded');

SELECT * FROM finish();
ROLLBACK;
