import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.test.local' })

const url   = process.env.TEST_SUPABASE_URL
const key   = process.env.TEST_SUPABASE_ANON_KEY
const email = process.env.TEST_USER_A_EMAIL
const pwd   = process.env.TEST_USER_PASSWORD

if (!url || !key || !email || !pwd) {
  console.error('Missing vars:', { url: !!url, key: !!key, email: !!email, pwd: !!pwd })
  process.exit(1)
}

const { data, error } = await createClient(url, key)
  .auth.signInWithPassword({ email, password: pwd })

if (error) {
  console.error('FAILED:', error.message)
  process.exit(1)
}

console.log('OK — signed in as', data.user.email)
console.log('org_id in metadata:', data.user.user_metadata?.org_id ?? 'none')
