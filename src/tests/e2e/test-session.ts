import { createBrowserClient, type SetAllCookies } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

interface TestSession {
  accessToken: string
  client: SupabaseClient
  cookieHeader: string
}

export async function signInTestUser(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<TestSession> {
  const cookieJar = new Map<string, string>()
  const client = createBrowserClient(supabaseUrl, anonKey, {
    isSingleton: false,
    cookies: {
      getAll() {
        return Array.from(cookieJar, ([name, value]) => ({ name, value }))
      },
      setAll(cookies: Parameters<SetAllCookies>[0]) {
        for (const cookie of cookies) {
          if (cookie.value) cookieJar.set(cookie.name, cookie.value)
          else cookieJar.delete(cookie.name)
        }
      },
    },
  })

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)

  return {
    accessToken: data.session?.access_token ?? '',
    client,
    cookieHeader: Array.from(cookieJar, ([name, value]) => `${name}=${value}`).join('; '),
  }
}
