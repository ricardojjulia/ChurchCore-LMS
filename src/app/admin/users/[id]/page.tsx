import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import EngagementWidget from '@/components/engagement/EngagementWidget'

export const dynamic = 'force-dynamic'

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: uid } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profile_roles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name, email, role, xp_points, current_level, status, org_id')
    .eq('uid', uid)
    .single()

  if (!profile || profile.org_id !== me.org_id) redirect('/admin/users')

  const ROLE_BADGE: Record<string, string> = {
    admin:   'bg-indigo-100 text-indigo-800',
    manager: 'bg-purple-100 text-purple-800',
    teacher: 'bg-sky-100 text-sky-800',
    student: 'bg-slate-100 text-slate-700',
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/users" className="hover:text-primary font-medium">Members</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{profile.display_name ?? 'Member'}</span>
        </nav>

        {/* Profile card */}
        <div className="bg-white border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {(profile.display_name ?? '?').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-foreground">
                    {profile.display_name ?? 'Unknown'}
                  </h1>
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${ROLE_BADGE[profile.role] ?? 'bg-slate-100 text-slate-700'}`}>
                {profile.role}
              </span>
              <span className="text-xs font-semibold text-muted-foreground bg-slate-100 px-2.5 py-1 rounded-full">
                Level {profile.current_level ?? 1}
              </span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                {(profile.xp_points ?? 0).toLocaleString()} XP
              </span>
            </div>
          </div>
        </div>

        {/* Engagement widget (reuses the same server component, scoped to this user's uid) */}
        <EngagementWidget uid={uid} />

      </div>
    </main>
  )
}
