-- pgTAP: auth throttle and security events (COUNCIL-2026-045,
-- migration 20260928100000_auth_abuse_protection.sql)
-- Run with: supabase test db

BEGIN;
SELECT plan(12);
\ir helpers/fixtures.inc

-- ── The throttle counts within a window and reports a retry time ────────────
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is((SELECT allowed FROM public.auth_throttle_hit('t|k1', 2, 60)), true,  'first hit is allowed');
SELECT is((SELECT allowed FROM public.auth_throttle_hit('t|k1', 2, 60)), true,  'second hit is allowed');
SELECT is((SELECT allowed FROM public.auth_throttle_hit('t|k1', 2, 60)), false, 'third hit is over the limit');
SELECT ok((SELECT retry_after FROM public.auth_throttle_hit('t|k1', 2, 60)) BETWEEN 1 AND 60,
  'a blocked hit says how long until the window resets');

RESET ROLE;
UPDATE public.auth_throttle SET window_start = now() - interval '2 minutes' WHERE key = 't|k1';
SET LOCAL ROLE service_role;
SELECT is((SELECT allowed FROM public.auth_throttle_hit('t|k1', 2, 60)), true, 'a new window starts fresh');
SELECT public.auth_throttle_clear('t|k1');
SELECT is((SELECT count(*)::int FROM public.auth_throttle WHERE key = 't|k1'), 0, 'clear removes the counter');

-- ── Users can't touch either table or call the functions ───────────────────
RESET ROLE;
INSERT INTO public.auth_security_events (event, ip_hash) VALUES ('login_failed', 'ip:abc');
INSERT INTO auth.users(id, email) VALUES (pg_temp.fixture_id('platform-auth'), 'platform@regression.invalid');
DELETE FROM public.profiles WHERE auth_id = pg_temp.fixture_id('platform-auth');
INSERT INTO public.platform_admins(auth_id, display_name)
VALUES (pg_temp.fixture_id('platform-auth'), 'Regression Platform Admin');
SET LOCAL ROLE authenticated;

SELECT pg_temp.actor('admin');
SELECT throws_ok($$SELECT public.auth_throttle_hit('t|x', 1, 60)$$, '42501', NULL,
  'an org admin cannot call the throttle function');
SELECT throws_ok($$SELECT count(*) FROM public.auth_throttle$$, '42501', NULL,
  'an org admin cannot read throttle counters');
SELECT is((SELECT count(*)::int FROM public.auth_security_events), 0,
  'an org admin sees no security events');
SELECT throws_ok($$INSERT INTO public.auth_security_events (event) VALUES ('login_failed')$$, '42501', NULL,
  'users cannot write security events');

SELECT pg_temp.actor('platform');
SELECT ok((SELECT count(*) FROM public.auth_security_events) >= 1, 'a platform admin can read security events');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT count(*) FROM public.auth_security_events$$, '42501', NULL,
  'anonymous users cannot read security events');

SELECT * FROM finish();
ROLLBACK;
