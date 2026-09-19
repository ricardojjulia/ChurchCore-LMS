'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function SignOutButton() {
  const t = useTranslations()
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
      {t('common.signOut')}
    </button>
  )
}
