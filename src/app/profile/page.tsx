import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import ProfileForm from '@/components/profile/ProfileForm'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, xp_points, current_level, avatar_url, date_of_birth')
    .eq('auth_id', user.id)
    .single()

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Your Profile</h1>
          <p className="text-slate-500 mt-1 text-sm">How you appear in ChurchCore LMS.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Level / XP banner */}
          <div className="bg-gradient-to-r from-indigo-950 to-slate-900 px-8 py-6 flex items-center gap-5">
            <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-2xl font-black text-white shrink-0">
              {profile?.display_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <p className="text-white font-extrabold text-xl leading-tight">
                {profile?.display_name ?? 'Set your name below'}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">
                  {profile?.role ?? 'student'}
                </span>
                <span className="text-xs text-slate-400">
                  Level {profile?.current_level ?? 1} · {profile?.xp_points ?? 0} XP
                </span>
              </div>
            </div>
          </div>

          {/* Edit form */}
          <div className="px-8 py-8">
            <ProfileForm
              userId={user.id}
              initialFullName={profile?.display_name ?? ''}
              initialAvatarUrl={profile?.avatar_url ?? ''}
              role={profile?.role ?? 'student'}
              initialDateOfBirth={profile?.date_of_birth ?? null}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
