import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import NewAnnouncementForm from './NewAnnouncementForm'

export const dynamic = 'force-dynamic'

export default async function NewAnnouncementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: courses } = await supabase
    .from('courses')
    .select('id, title')
    .eq('status', 'published')
    .order('title', { ascending: true })

  return <NewAnnouncementForm courses={courses ?? []} />
}
