/**
 * Runs in CI before the e2e suite.
 * Creates or updates test Auth users via service role. Passwords never live in
 * seed SQL, and Auth UUIDs are resolved dynamically by the SQL seed.
 * Usage: node scripts/ci-setup-test-env.mjs
 * Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !TEST_PASSWORD) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or TEST_USER_PASSWORD')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_USERS = [
  'admin@test.churchcore.dev',
  'teacher@test.churchcore.dev',
  'student@test.churchcore.dev',
  'admin-b@test.churchcore.dev',
  'student-b@test.churchcore.dev',
  'guardian@test.churchcore.dev',
]

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
})

if (listError) {
  console.error(`Failed to list test users: ${listError.message}`)
  process.exit(1)
}

for (const email of TEST_USERS) {
  const existing = listed.users.find((user) => user.email?.toLowerCase() === email)
  const { error } = existing
    ? await supabase.auth.admin.updateUserById(existing.id, {
        password: TEST_PASSWORD,
        email_confirm: true,
      })
    : await supabase.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
      })

  if (error) {
    console.error(`Failed to prepare ${email}: ${error.message}`)
    process.exit(1)
  }
  console.log(`Test user ready: ${email}`)
}

console.log('Test environment setup complete.')
