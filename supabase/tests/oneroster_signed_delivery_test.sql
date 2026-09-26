-- Signed delivery constraints, replay defense, and tenant isolation.
BEGIN;
SET LOCAL ROLE postgres;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();
  v_connection uuid := gen_random_uuid();
  v_other_connection uuid := gen_random_uuid();
  v_delivery uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations(id, name, slug) VALUES
    (v_org, 'Signed delivery test', 'signed-delivery-' || v_org),
    (v_other_org, 'Other delivery test', 'other-delivery-' || v_other_org);
  INSERT INTO auth.users(id, email, raw_app_meta_data)
    VALUES (v_auth, v_auth || '@example.invalid', jsonb_build_object('org_id', v_org, 'role', 'admin'));

  INSERT INTO public.oneroster_connections(
    id, org_id, name, mode, provider, enabled, source_system, source_tenant_id,
    status, transport, schedule_interval_minutes, signature_algorithm,
    signature_key_id, signature_public_key
  ) VALUES
    (v_connection, v_org, 'Academy', 'academy_csv', 'churchcore_academy', true,
      'churchcore_academy', 'academy-a', 'active', 'signed_push', 60, 'ed25519',
      'academy-key', repeat('K', 80)),
    (v_other_connection, v_other_org, 'Other Academy', 'academy_csv', 'churchcore_academy', true,
      'churchcore_academy', 'academy-b', 'active', 'signed_push', 60, 'ed25519',
      'other-key', repeat('K', 80));

  INSERT INTO public.oneroster_transport_attempts(
    org_id, connection_id, delivery_id, package_hash, status, delivered_at
  ) VALUES
    (v_org, v_connection, v_delivery, repeat('a', 64), 'validated', now()),
    (v_other_org, v_other_connection, gen_random_uuid(), repeat('b', 64), 'validated', now());

  PERFORM set_config('test.delivery_org', v_org::text, true);
  PERFORM set_config('test.delivery_connection', v_connection::text, true);
  PERFORM set_config('test.delivery_id', v_delivery::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

SELECT has_table('public', 'oneroster_transport_attempts', 'transport attempts table exists');
SELECT has_column('public', 'oneroster_connections', 'signature_public_key', 'connection stores a public verification key');
SELECT has_column('public', 'oneroster_connections', 'next_expected_at', 'connection stores cadence status');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.set_oneroster_connection_updated_at()', 'EXECUTE'),
  'authenticated cannot invoke the timestamp trigger directly'
);

SELECT throws_ok(
  $$INSERT INTO public.oneroster_connections(
      org_id, name, mode, provider, enabled, source_system, source_tenant_id, status,
      transport, schedule_interval_minutes, signature_algorithm, signature_key_id, signature_public_key
    ) VALUES (
      current_setting('test.delivery_org')::uuid, 'Broken', 'academy_csv', 'manual', true,
      'broken', 'broken', 'active', 'signed_push', 60, 'ed25519', 'broken-key', repeat('K', 80)
    )$$,
  '23514', NULL,
  'signed push requires the ChurchCore Academy provider contract'
);

SELECT throws_ok(
  format(
    $$INSERT INTO public.oneroster_transport_attempts(
        org_id, connection_id, delivery_id, package_hash, status, delivered_at
      ) VALUES (%L, %L, %L, %L, 'duplicate', now())$$,
    current_setting('test.delivery_org'),
    current_setting('test.delivery_connection'),
    current_setting('test.delivery_id'),
    repeat('c', 64)
  ),
  '23505', NULL,
  'a delivery ID cannot be replayed for the same connection'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$UPDATE public.oneroster_transport_attempts SET status = 'failed'$$,
  '42501', NULL,
  'service role cannot mutate the immutable attempt ledger'
);

SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM public.oneroster_transport_attempts),
  1::bigint,
  'an active tenant admin reads only its own delivery attempts'
);
SELECT throws_ok(
  format(
    $$INSERT INTO public.oneroster_transport_attempts(
        org_id, connection_id, delivery_id, package_hash, status, delivered_at
      ) VALUES (%L, %L, gen_random_uuid(), %L, 'failed', now())$$,
    current_setting('test.delivery_org'),
    current_setting('test.delivery_connection'),
    repeat('d', 64)
  ),
  '42501', NULL,
  'authenticated users cannot write transport attempts'
);

SET LOCAL ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
