import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const dbUrl = process.env.TEST_DATABASE_URL
if (!dbUrl || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(dbUrl).hostname)) {
  throw new Error('TEST_DATABASE_URL must target a disposable local database')
}
const ids = Object.fromEntries(['org', 'admin', 'student', 'blueprint', 'term', 'section', 'group'].map(key => [key, randomUUID()]))
const query = sql => {
  const result = spawnSync('psql', [dbUrl, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const assignment = user => `INSERT INTO public.section_group_members(group_id,org_id,user_id)
  VALUES('${ids.group}','${ids.org}','${user}');`
const actor = `SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub','${ids.admin}',true);`
const cleanup = `DELETE FROM public.section_groups WHERE id='${ids.group}';
  DELETE FROM public.course_sections WHERE id='${ids.section}';
  DELETE FROM public.course_blueprints WHERE id='${ids.blueprint}';
  DELETE FROM public.academic_terms WHERE id='${ids.term}';
  DELETE FROM auth.users WHERE id IN ('${ids.admin}','${ids.student}');
  DELETE FROM public.organizations WHERE id='${ids.org}';`

let holder
try {
  query(`INSERT INTO public.organizations(id,name,slug) VALUES('${ids.org}','Capacity race','capacity-${ids.org}');
    INSERT INTO auth.users(id,email,raw_app_meta_data) VALUES
      ('${ids.admin}','${ids.admin}@capacity.invalid','{"org_id":"${ids.org}","role":"admin"}'),
      ('${ids.student}','${ids.student}@capacity.invalid','{"org_id":"${ids.org}","role":"student"}');
    INSERT INTO public.course_blueprints(id,org_id,course_code,title,created_by)
      VALUES('${ids.blueprint}','${ids.org}','CAPACITY','Capacity','${ids.admin}');
    INSERT INTO public.academic_terms(id,org_id,term_name,term_code,type,start_date,end_date,created_by)
      VALUES('${ids.term}','${ids.org}','Capacity','CAPACITY','semester','2026-09-01','2026-12-01','${ids.admin}');
    INSERT INTO public.course_sections(id,org_id,blueprint_id,term_id,section_code,delivery_format,created_by)
      VALUES('${ids.section}','${ids.org}','${ids.blueprint}','${ids.term}','CAPACITY','asynchronous','${ids.admin}');
    INSERT INTO public.section_groups(id,org_id,section_id,group_name,max_members,created_by)
      VALUES('${ids.group}','${ids.org}','${ids.section}','Capacity',1,'${ids.admin}');`)
  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ']) {
    const app = `capacity-${randomUUID()}`
    holder = spawn('psql', [dbUrl, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-c',
      `BEGIN; ${actor} ${assignment(ids.admin)} SELECT pg_sleep(3); COMMIT;`],
    { env: { ...process.env, PGAPPNAME: app }, stdio: ['ignore', 'pipe', 'pipe'] })
    let holderError = ''
    holder.stderr.on('data', data => { holderError += data })
    const completion = new Promise(resolve => holder.once('exit', resolve))
    let locked = false
    for (let attempt = 0; attempt < 50; attempt++) {
      if (query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${app}' AND wait_event='PgSleep'`) === '1') {
        locked = true
        break
      }
      await delay(50)
    }
    if (!locked) throw new Error(`First assignment did not acquire the slot: ${holderError}`)
    const contender = spawnSync('psql', [dbUrl, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-c',
      `BEGIN ISOLATION LEVEL ${isolation}; ${actor} ${assignment(ids.student)} COMMIT;`], { encoding: 'utf8' })
    if (await completion !== 0) throw new Error(holderError)
    holder = undefined
    const expected = isolation === 'READ COMMITTED' ? 'PCC01' : '40001'
    if (contender.status === 0 || !contender.stderr.includes(expected)) {
      throw new Error(`${isolation}: expected ${expected}, got ${contender.stderr}`)
    }
    if (query(`SELECT count(*) FROM public.section_group_members WHERE group_id='${ids.group}'`) !== '1') {
      throw new Error('Competing assignments exceeded capacity')
    }
    console.log(`PASS: ${isolation} competing assignment rejected with ${expected}; one member persisted`)
    query(`DELETE FROM public.section_group_members WHERE group_id='${ids.group}'`)
  }
} finally {
  if (holder) holder.kill('SIGTERM')
  query(cleanup)
}
