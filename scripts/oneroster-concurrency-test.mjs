import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const orgId = '00000000-0000-4000-8000-00000000c101'
const authId = '00000000-0000-4000-8000-00000000c102'
const jobId = '00000000-0000-4000-8000-00000000c103'

function query(sql) {
  const result = spawnSync('supabase', ['db', 'query', '--linked', '--output', 'json', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Linked database query failed')
  }
  return `${result.stdout}\n${result.stderr}`
}

function applySql() {
  return `
    SELECT public.apply_oneroster_academic_job(
      '${jobId}'::uuid,
      '${orgId}'::uuid,
      '${authId}'::uuid,
      (SELECT uid FROM public.profiles WHERE auth_id = '${authId}'::uuid)
    ) AS result;
  `
}

const cleanupSql = `
  DELETE FROM public.course_sections WHERE org_id = '${orgId}'::uuid;
  DELETE FROM public.course_blueprints WHERE org_id = '${orgId}'::uuid;
  DELETE FROM public.academic_terms WHERE org_id = '${orgId}'::uuid;
  DELETE FROM public.external_entity_links WHERE org_id = '${orgId}'::uuid;
  DELETE FROM public.oneroster_import_jobs WHERE org_id = '${orgId}'::uuid;
  DELETE FROM public.admin_audit_log
    WHERE org_id = '${orgId}'::uuid AND actor_id = '${authId}'::uuid;
  DELETE FROM public.profile_roles WHERE org_id = '${orgId}'::uuid;
  DELETE FROM public.profiles WHERE auth_id = '${authId}'::uuid;
  DELETE FROM auth.users WHERE id = '${authId}'::uuid;
  DELETE FROM public.organizations WHERE id = '${orgId}'::uuid;
`

try {
  query(cleanupSql)
  query(`
    INSERT INTO public.organizations(id, name, slug)
      VALUES ('${orgId}'::uuid, 'OneRoster concurrency test', 'oneroster-concurrency-c101');
    INSERT INTO auth.users(id, email, raw_app_meta_data)
      VALUES ('${authId}'::uuid, 'oneroster-concurrency-c102@example.invalid',
        jsonb_build_object('org_id', '${orgId}', 'role', 'admin'));
    INSERT INTO public.oneroster_import_jobs(id, org_id, status, package_hash, total_rows)
      VALUES ('${jobId}'::uuid, '${orgId}'::uuid, 'validated', 'concurrency-test', 1);
    INSERT INTO public.oneroster_import_rows(org_id, job_id, file_type, row_number, sourced_id, status, normalized_payload)
      VALUES ('${orgId}'::uuid, '${jobId}'::uuid, 'courses', 2, 'concurrency-course', 'valid',
        '{"title":"Concurrency course","status":"active"}'::jsonb);
  `)

  const lockSql = `
    BEGIN;
    SELECT pg_advisory_xact_lock(hashtextextended('${orgId}:manual', 0));
    SELECT pg_sleep(8);
    COMMIT;
  `
  const lock = spawn('supabase', ['db', 'query', '--linked', '--output', 'json', lockSql], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await delay(3500)
  const contended = query(applySql())
  if (!contended.includes('Another import from this source is applying')) {
    lock.kill('SIGKILL')
    throw new Error('Apply was not rejected while another session held the source lock')
  }

  const lockExit = await new Promise((resolve) => lock.once('exit', resolve))
  if (lockExit !== 0) throw new Error('Lock-holder session failed')

  const applied = query(applySql())
  if (!applied.includes('"created": 1') || !applied.includes('"status": "applied"')) {
    throw new Error('Apply did not succeed after the source lock was released')
  }

  console.log('PASS: contended apply rejected; post-release apply created one course.')
} finally {
  query(cleanupSql)
}
