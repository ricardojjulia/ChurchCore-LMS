'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const supabase = createClient()
  const router = useRouter()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="text-xs font-semibold text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-800"
    >
      Sign out
    </button>
  )
}
