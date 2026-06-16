/**
 * Runs in CI before the e2e suite.
 * Sets test user passwords via service role — passwords never live in seed SQL.
 * Usage: node scripts/ci-setup-test-env.mjs
 * Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? 'TestPassword!2025'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TEST_USERS = [
  { id: '00000000-0000-0000-0001-000000000001', email: 'admin@test.churchcore.dev' },
  { id: '00000000-0000-0000-0001-000000000002', email: 'teacher@test.churchcore.dev' },
  { id: '00000000-0000-0000-0001-000000000003', email: 'student@test.churchcore.dev' },
  { id: '00000000-0000-0000-0001-000000000004', email: 'student2@test.churchcore.dev' },
]

for (const user of TEST_USERS) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: TEST_PASSWORD,
  })
  if (error) {
    console.error(`Failed to set password for ${user.email}:`, error.message)
    process.exit(1)
  }
  console.log(`Password set for ${user.email}`)
}

console.log('Test environment setup complete.')
